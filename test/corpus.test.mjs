import assert from "node:assert/strict";
import test from "node:test";
import { buildCases, selectCases, suites } from "../corpus/index.mjs";
import { tasks } from "../corpus/tasks.mjs";
import { canonical, equal, valueHash, summarize } from "../lib/values.mjs";
import { readConfig } from "../lib/config.mjs";
import { eligibility, describeCase, sourceFor, summarizeRows, runCases } from "../lib/runner.mjs";

test("catalog is deterministic, uniquely named, fully described and covers every lane",()=>{
  const cases=buildCases();
  assert.equal(cases.length,76);
  assert.equal(new Set(cases.map(c=>c.name)).size,cases.length);
  assert.deepEqual(new Set(cases.map(c=>c.suite)),new Set(Object.keys(suites)));
  assert.equal(valueHash(cases),valueHash(buildCases()));
  assert.notEqual(valueHash(cases),valueHash(buildCases({seed:2})));
  for(const c of cases) {
    assert.ok(c.code.length);
    const d=describeCase(c);
    assert.equal(d.sources.javascript.bytes,Buffer.byteLength(c.code));
    assert.equal(d.fixtureHash.length,64);
    assert.equal(d.provenance.repository,"https://github.com/hyein-cbio/pi-codemode-bench");
    c.plan.forEach((p,index)=>{
      assert.ok(p.name && p.args);
      for(const dependency of p.after??[]) assert.ok(dependency>=0 && dependency<index);
    });
  }
  assert.equal(cases.filter(c=>c.suite==="json-scale").length,36);
  for(const c of cases.filter(c=>c.suite==="json-scale")) {
    assert.ok(c.axes.inputBytes<=c.axes.targetKiB*1024);
    assert.equal(c.axes.inputBytes,Buffer.byteLength(c.plan[0].value));
    assert.equal(c.expected.rows,c.axes.rows*c.axes.passes);
    assert.equal(c.plan.length,1);
  }
  for(const t of tasks) assert.ok(cases.some(c=>c.name===t.case));
});
test("canonical JSON is key-order-independent but preserves arrays, null and types",()=>{
  assert.equal(canonical({b:2,a:1}),canonical({a:1,b:2}));
  assert.equal(equal({a:1,b:[null,false]},{b:[null,false],a:1}),true);
  assert.equal(equal([1,2],[2,1]),false);
  assert.equal(equal(1,"1"),false);
  assert.equal(equal(NaN,null),false);
  assert.throws(()=>canonical({a:undefined}));
  assert.throws(()=>canonical(Infinity));
  assert.throws(()=>canonical(new Array(1)));
  assert.equal(equal(new Array(1),[]),false);
  assert.deepEqual(summarize([4,1,3,2]), {n:4,medianMs:2.5,p95Ms:4,minMs:1,maxMs:4});
  assert.deepEqual(summarize([9,1,2]),{n:3,medianMs:2,p95Ms:9,minMs:1,maxMs:9});
});
test("selection rejects typos, empty intersections and malformed counts",()=>{
  const cases=buildCases();
  assert.equal(selectCases(cases,{names:["read-reduce"]})[0].suite,"short");
  assert.throws(()=>selectCases(cases,{sets:["unknown"]}));
  assert.throws(()=>selectCases(cases,{names:["read-reduce"],sets:["smoke"]}));
  for(const args of [["--samples=0"],["--warmup=-1"],["--samples=NaN"],["--cases=a,a"],["--sets=all,short"],["--tiers=7"],["--engines=wrong"],["--wat"],["--engines=none"]]) assert.throws(()=>readConfig(args));
  assert.equal(readConfig(["--warmup=0"]).warmup,0);
  assert.equal(readConfig(["--sets=all"]).sets,null);
  assert.equal(readConfig(["--cases=read-reduce"]).sets,null);
  assert.deepEqual(readConfig(["--engines=none","--adapter=x.mjs"]).engines,[]);
});
test("capabilities and source language are explicit; fresh source preserves the body",()=>{
  const cases=buildCases();
  const meta={language:"javascript",capabilities:["tools"]};
  assert.equal(eligibility(cases.find(c=>c.name==="class-method"),meta),"missing-capabilities:classes");
  const compute=cases[0];
  assert.equal(eligibility(compute,{language:"ruby",capabilities:[]}),"no-source:ruby");
  assert.ok(sourceFor(compute,meta,"fresh",1).endsWith(compute.code));
  assert.notEqual(sourceFor(compute,meta,"fresh",1),sourceFor(compute,meta,"fresh",2));
});
test("schedule balances engines, retains warmups and gates any phase failure",async()=>{
  const item=buildCases()[0], order=[];
  const engines=["a","b"].map(name=>({metadata:{name,language:"javascript",capabilities:[]},
    async run(){order.push(name);return {valid:true,status:"success",ms:2};}}));
  const rows=await runCases(engines,[item],{warmup:1,samples:2,seed:1,sourceMode:"fresh"});
  assert.equal(rows.length,8);
  assert.equal(rows.filter(r=>r.phase==="warmup").length,2);
  assert.deepEqual(order,["b","a","a","b","b","a","a","b"]);
  assert.equal(new Set(rows.map(r=>r.sourceHash)).size,8);
  rows[0].valid=false;rows[0].status="invalid";
  const result=summarizeRows(rows,[item],engines)[0].engines;
  assert.equal(result.b.n,2);
  assert.equal(result.b.eligibleForTiming,false);
  assert.equal(result.a.eligibleForTiming,true);
  assert.equal(result.b.invalid,1);
});
