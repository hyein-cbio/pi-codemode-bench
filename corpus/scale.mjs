import { define, call, rows, aggregate, aggregateCode } from "./helpers.mjs";
export function jsonScaleCases(seed) {
  const cases = [];
  for (const shape of ["records", "strings"]) for (const targetKiB of [2, 8, 16, 24, 32, 48]) {
    const noteSize = shape === "records" ? 8 : 512;
    const candidates = rows(1000, seed, noteSize), data = [];
    let size = 2;
    for(const row of candidates) {
      const next = Buffer.byteLength(JSON.stringify(row)) + (data.length ? 1 : 0);
      if(size + next > targetKiB * 1024) break;
      data.push(row); size += next;
    }
    const raw = JSON.stringify(data);
    for(const passes of [1, 4, 16]) cases.push(define({
      name: "json-" + shape + "-" + targetKiB + "k-x" + passes,
      suite: "json-scale", kind: "json-parse-aggregate",
      plan: [call("read", { path: "data.json" }, raw)],
      expected: aggregate(data, passes), code: aggregateCode('await tools.read({path:"data.json"})', passes),
      axes: { shape, targetKiB, inputBytes: Buffer.byteLength(raw), inputUnits: raw.length, rows: data.length, passes, artificialWaitMs: 0 },
      tags: ["json", "size", "parse-count"], timeoutMs: 30000,
    }));
  }
  return cases;
}
export function sourceCases() {
  return [128, 4096, 32768].map(bytes => {
    // Executed declarations, not just padding comments. Oracle is a closed-form sum.
    const count = Math.floor(bytes / 24);
    const code = Array.from({ length: count }, (_, i) => "const v" + i + " = " + i + ";").join("\n") +
      "\nreturn " + Array.from({ length: count }, (_, i) => "v" + i).join("+") + ";";
    return define({ name: "source-" + bytes, suite: "source", kind: "parse-compile-size", code,
      expected: count * (count - 1) / 2, axes: { targetBytes: bytes, declarations: count }, tags: ["source-size"] });
  });
}
export function stressCases(seed) {
  const specs = [];
  for (const count of [100000, 1000000]) {
    const q = BigInt(Math.floor(count / 97)), r = BigInt(count % 97);
    specs.push({ name: "arithmetic-" + count, expected: Number(q * 96n * 97n / 2n + r * (r + 1n) / 2n),
      code: `let sum=0; for(let i=1;i<=${count};i++) sum+=i%97; return sum;`, tags: ["cpu"] });
  }
  for(const n of [12, 32]) {
    const sumK = n * (n - 1) / 2, sumK2 = n * (n - 1) * (2 * n - 1) / 6;
    let expected = 0;
    for(let i=0;i<n;i++) for(let j=0;j<n;j++) expected += n * i * j + (i + j) * sumK + sumK2;
    specs.push({ name: "matrix-" + n, expected,
      code: `let checksum=0; for(let i=0;i<${n};i++) for(let j=0;j<${n};j++) { let cell=0; for(let k=0;k<${n};k++) cell+=(i+k)*(k+j); checksum+=cell; } return checksum;`,
      axes: { dimension: n, multiplications: n ** 3 }, tags: ["cpu", "nested-loops"] });
  }
  const n = 2000;
  const sorted = Array.from({length:n},(_,id)=>({id,key:(id*48271+seed)%997})).sort((a,b)=>a.key-b.key||a.id-b.id);
  specs.push({ name: "stable-sort-2000", expected: sorted.map(r=>r.id).slice(0,24),
    code: `const rows=[]; for(let id=0;id<2000;id++) rows.push({id,key:(id*48271+${seed})%997}); rows.sort((a,b)=>a.key-b.key||a.id-b.id); return rows.slice(0,24).map(r=>r.id);`,
    tags: ["sorting", "tie-break"] });
  const distances = [0];
  for(let i=1;i<256;i++) distances[i] = 1 + Math.min(...[1,3,7].filter(d=>i>=d).map(d=>distances[i-d]));
  specs.push({ name: "graph-bfs-256", expected: distances,
    code: `const dist=[]; for(let i=0;i<256;i++) dist.push(-1); dist[0]=0; const queue=[0]; let head=0;
while(head<queue.length) { const from=queue[head++]; for(const step of [1,3,7]) { const to=from+step; if(to<256 && dist[to]===-1) {dist[to]=dist[from]+1;queue.push(to);} } } return dist;`,
    tags: ["graph", "queue"], axes: { nodes: 256 } });
  specs.push({ name: "allocation-churn", expected: 40 * 100 * 99 / 2 + 100 * 40 * 39 / 2,
    code: `let checksum=0; for(let g=0;g<40;g++) { const rows=[]; for(let i=0;i<100;i++) rows.push({pair:[i,g],note:"row-"+i}); for(const row of rows) checksum+=row.pair[0]+row.pair[1]; } return checksum;`,
    tags: ["allocation", "gc"] });
  for(const width of [1, 32]) {
    const plan = [];
    for(let id=0;id<128;id++) plan.push(call("task", {id}, id+seed,
      { waitMs: width === 1 ? 0 : 2, after: id < width ? [] : Array.from({length:width},(_,i)=>Math.floor(id/width)*width-width+i) }));
    specs.push({ name: "bridge-128-width-" + width, plan, expected: 128 * seed + 127 * 128 / 2,
      code: `let sum=0; for(let start=0;start<128;start+=${width}) { const calls=[]; for(let id=start;id<start+${width};id++) calls.push(tools.task({id})); const values=await Promise.all(calls); for(const value of values) sum+=value; } return sum;`,
      concurrency: { minPeak: width, maxPeak: width }, axes: { calls: 128, width, artificialWaitMs: width === 1 ? 0 : 2 }, tags: ["bridge", "fanout"] });
  }
  return specs.map(s=>define({ suite: "stress", tier: 5, kind: "resource-pressure", timeoutMs: 30000, ...s }));
}
export function boundaryCases() {
  return [
    define({ name: "explicit-error", suite: "limits", kind: "error-propagation",
      code: 'throw new Error("BENCH_EXPECTED");', expectedOutcome: "error", errorPattern: "BENCH_EXPECTED",
      tags: ["expected-error"] }),
    define({ name: "deadline-loop", suite: "limits", kind: "deadline",
      code: "while(true) {}", expectedOutcome: "error", errorPattern: "timeout|timed out|deadline",
      timeoutMs: 100, requires: ["per-call-deadline"], tags: ["expected-timeout"] }),
    define({ name: "json-depth-40", suite: "capabilities", kind: "bridge-depth", requires: ["deep-json"],
      code: 'let value=null; for(let i=0;i<40;i++) value={child:value}; return value;',
      expected: Array.from({length:40}).reduce(value=>({child:value}),null), tags: ["data-boundary"] }),
    define({ name: "class-method", suite: "capabilities", kind: "language-support", requires: ["classes"],
      code: "class Counter { constructor(n) { this.n=n; } add(n) { this.n+=n; return this.n; } } return new Counter(3).add(4);",
      expected: 7, tags: ["syntax"] }),
    define({ name: "unicode-json", suite: "capabilities", kind: "data-roundtrip",
      code: 'return JSON.parse(JSON.stringify({text:"Aé🙂",nil:null,empty:[],flag:false,zero:0}));',
      expected: {text:"Aé🙂",nil:null,empty:[],flag:false,zero:0}, tags: ["unicode", "null"] }),
  ];
}
