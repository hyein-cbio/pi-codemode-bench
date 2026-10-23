import { define, call, rows, aggregate, aggregateCode } from "./helpers.mjs";

export function workflowCases(seed) {
  const specs = [];
  const records = rows(37, seed);
  const plan = [];
  for (let offset = 0; offset < records.length; offset += 8) {
    plan.push(call("page", { cursor: offset === 0 ? null : "p" + offset },
      { rows: records.slice(offset, offset + 8), next: offset + 8 < records.length ? "p" + (offset + 8) : null },
      { after: plan.length ? [plan.length - 1] : [] }));
  }
  specs.push({ name: "cursor-pagination", plan, expected: records.filter(r => r.active).map(r => r.id),
    code: `let cursor = null; const ids = [];
do { const page = await tools.page({cursor}); for (const row of page.rows) if(row.active) ids.push(row.id); cursor = page.next; } while (cursor !== null);
return ids;`, tags: ["pagination", "dependency"] });
  const users = [{ id: 1, name: "A" }, { id: 2, name: "B" }, { id: 3, name: "C" }];
  const orders = [{ user: 1, amount: 7 }, { user: 2, amount: 19 }, { user: 1, amount: 12 }, { user: 9, amount: 50 }, { user: 3, amount: 3 }];
  specs.push({ name: "join-topk", plan: [call("table", { name: "users" }, users), call("table", { name: "orders" }, orders)],
    expected: [{ id: 1, name: "A", total: 19 }, { id: 2, name: "B", total: 19 }],
    code: `const tables = await Promise.all(["users","orders"].map(name=>tools.table({name})));
const users = tables[0], orders = tables[1], out = [];
for (const user of users) { let total = 0; for (const order of orders) if(order.user===user.id) total+=order.amount; out.push({id:user.id,name:user.name,total}); }
out.sort((a,b)=>b.total-a.total || a.id-b.id); return out.slice(0,2);`, tags: ["join", "stable-topk"] });

  const retryPlan = [], expected = [];
  for (let start = 1; start <= 12; start += 4) {
    const previousWave = retryPlan.map((_, i) => i);
    const retries = [];
    for (let id = start; id < start + 4; id++) {
      const fail = id % 4 === 0 || id === 7;
      const idx = retryPlan.length;
      retryPlan.push(call("task", { id, attempt: 1 }, id * 3 + seed, { ...(fail ? { error: "TRANSIENT" } : {}), waitMs: 2, after: previousWave }));
      if (fail) retries.push({ id, idx });
      expected.push({ id, value: id === 7 ? null : id * 3 + seed });
    }
    const wave = retryPlan.map((_, i) => i);
    for (const { id } of retries) retryPlan.push(call("task", { id, attempt: 2 }, id * 3 + seed,
      { ...(id === 7 ? { error: "PERMANENT" } : {}), after: wave }));
  }
  specs.push({ name: "retry-waves", plan: retryPlan, expected, concurrency: { minPeak: 4, maxPeak: 4 },
    code: `const out = [];
for(let start=1;start<=12;start+=4) {
  const ids=[start,start+1,start+2,start+3];
  const results=await Promise.allSettled(ids.map(id=>tools.task({id,attempt:1})));
  for(let i=0;i<ids.length;i++) {
    let value=null;
    if(results[i].status==="fulfilled") value=results[i].value;
    else { try { value=await tools.task({id:ids[i],attempt:2}); } catch(e) {} }
    out.push({id:ids[i],value});
  }
}
return out;`, tags: ["bounded-fanout", "selective-retry", "permanent-failure"] });

  const data = rows(96, seed);
  const chunks = [JSON.stringify(data.slice(0, 48)), "{broken", JSON.stringify(data.slice(48))];
  specs.push({ name: "multi-file-etl", plan: [
    call("list", { glob: "*.json" }, ["a.json", "b.json", "c.json"]),
    ...chunks.map((value, i) => call("read", { path: ["a.json", "b.json", "c.json"][i] }, value, { after: [0] })),
  ], expected: { ...aggregate(data), failures: 1 },
  code: `const paths=await tools.list({glob:"*.json"});
const texts=await Promise.all(paths.map(path=>tools.read({path})));
const all=[]; let failures=0;
for(const raw of texts) { try { const rows=JSON.parse(raw); for(const row of rows) all.push(row); } catch(e) { failures++; } }
const summary=await (async()=>{ ${aggregateCode("JSON.stringify(all)")} })();
summary.failures=failures; return summary;`, tags: ["etl", "malformed-json", "partial-failure"] });

  return specs.map(s => define({ suite: "workflow", tier: 3, kind: "composed-workflow", ...s }));
}
export function apexCases(seed) {
  const specs = [];
  // Version conflict, tie-breaking and tombstones, delivered out of order.
  const events = Array.from({ length: 192 }, (_, i) => ({
    id: i % 48, version: Math.floor(i / 48), seq: i,
    deleted: i % 11 === 0, amount: (i * 13 + seed) % 97,
  })).reverse();
  const winners = Array.from({ length: 48 }, (_, id) => events.filter(e => e.id === id).sort((a,b)=>b.version-a.version || b.seq-a.seq)[0]);
  const surviving = winners.filter(e => !e.deleted).sort((a,b)=>a.id-b.id);
  const plan = [];
  for (let p = 0; p < 12; p++) plan.push(call("events", { page: p }, events.slice(p * 16, (p + 1) * 16), { after: p ? [p - 1] : [] }));
  specs.push({ name: "versioned-reconciliation", plan,
    expected: { ids: surviving.map(e => e.id), total: surviving.reduce((s,e)=>s+e.amount,0), deleted: winners.filter(e=>e.deleted).length },
    code: `const latest={};
for(let page=0;page<12;page++) {
  const events=await tools.events({page});
  for(const e of events) { const old=latest[e.id]; if(!old || e.version>old.version || (e.version===old.version && e.seq>old.seq)) latest[e.id]=e; }
}
const ids=[]; let total=0,deleted=0;
for(let id=0;id<48;id++) { const e=latest[id]; if(e.deleted) deleted++; else { ids.push(id); total+=e.amount; } }
return {ids,total,deleted};`, tags: ["versions", "tombstones", "out-of-order"] });

  const dagPlan = [], values = [];
  const width = 8, levels = 8;
  for(let level=0;level<levels;level++) {
    const previous = level === 0 ? [] : values.slice((level - 1) * width, level * width);
    const total = previous.reduce((a,b)=>a+b,0);
    for(let slot=0;slot<width;slot++) {
      const value = (total + slot + seed) % 1009;
      dagPlan.push(call("node", { level, slot, inputs: previous }, value,
        { after: level === 0 ? [] : Array.from({length:width},(_,i)=>(level-1)*width+i), waitMs: 1 }));
      values.push(value);
    }
  }
  specs.push({ name: "fan-in-dag-64", plan: dagPlan, expected: { leaves: values.slice(-width), checksum: values.reduce((a,b)=>a+b,0) },
    concurrency: { minPeak: width, maxPeak: width },
    code: `let inputs=[]; let checksum=0;
for(let level=0;level<8;level++) {
  const calls=[]; for(let slot=0;slot<8;slot++) calls.push(tools.node({level,slot,inputs}));
  inputs=await Promise.all(calls); for(const n of inputs) checksum+=n;
}
return {leaves:inputs,checksum};`, tags: ["dag", "fan-in", "fanout"] });

  const echoPlan = [];
  let value = { text: "Aé🙂", nil: null, bool: false, empty: [], n: seed };
  for (let i = 0; i < 12; i++) value = { child: value, index: i };
  for (let i = 0; i < 64; i++) echoPlan.push(call("echo", { step: i, value }, value, { after: i ? [i - 1] : [] }));
  specs.push({ name: "deep-roundtrip-64", plan: echoPlan, expected: value,
    code: `let value=${JSON.stringify(value)}; for(let step=0;step<64;step++) value=await tools.echo({step,value}); return value;`,
    tags: ["bridge", "unicode", "nested-json"], axes: { depth: 13, calls: 64 } });
  return specs.map(s=>define({ suite: "apex", tier: 4, kind: "composed-ceiling", timeoutMs: 30000, ...s }));
}
