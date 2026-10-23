import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildCases } from "../corpus/index.mjs";
import { tasks } from "../corpus/tasks.mjs";
import { Engine } from "../lib/engine.mjs";
import { eligibility } from "../lib/runner.mjs";

test("all eligible cases run on real Pi, OpenCode and Node executors", {timeout:120000}, async()=>{
  const cases=buildCases();
  let executed=0,skipped=0;
  for(const name of ["pi","opencode","node"]) {
    const engine=new Engine({engine:name});
    try {
      await engine.start();
      for(const item of cases) {
        if(eligibility(item,engine.metadata)) {skipped++;continue;}
        const result=await engine.run(item,item.code);
        assert.equal(result.valid,true,JSON.stringify({engine:name,case:item.name,result}));
        if(item.expectedOutcome==="error") assert.equal(result.status,"expected-error");
        executed++;
      }
    } finally {await engine.close();}
  }
  assert.equal(executed,226);
  assert.equal(skipped,2);
});
test("changed seeds have the same independent output and call gates", {timeout:30000}, async()=>{
  const engine=new Engine({engine:"node"});
  try {
    await engine.start();
    for(const item of buildCases({seed:719}).filter(c=>["workflow","apex","json-scale"].includes(c.suite))) {
      const result=await engine.run(item,item.code);
      assert.equal(result.valid,true,item.name+JSON.stringify(result.reasons));
    }
  } finally {await engine.close();}
});
test("a correct canned answer does not bypass required calls; task references pass",async()=>{
  const engine=new Engine({engine:"pi"});
  try {
    await engine.start();
    const cases=buildCases();
    const item=cases.find(c=>c.name==="read-reduce");
    const bad=await engine.run(item,"return 26;");
    assert.equal(bad.answerCorrect,true);
    assert.equal(bad.valid,false);
    assert.ok(bad.reasons.includes("missing-calls"));
    const wrong=await engine.run(item,'await tools.read({path:"numbers.txt"}); return 27;');
    assert.ok(wrong.reasons.includes("wrong-answer"));
    for(const task of tasks) {
      const c=cases.find(c=>c.name===task.case);
      assert.equal((await engine.run(c,c.code)).valid,true,task.id);
    }
  } finally {await engine.close();}
});
test("invalid timing, truncation, warnings and non-JSON outputs cannot become valid samples",async()=>{
  const dir=await mkdtemp(join(tmpdir(),"codemode-invalid-"));
  const path=join(dir,"adapter.mjs");
  await writeFile(path,`export function createAdapter(){return {name:"invalid-test",language:"javascript",capabilities:[],async execute(code){
    if(code==="transport") throw new Error("BENCH_EXPECTED");
    if(code==="json") return {ok:true,value:NaN,ms:1};
    if(code==="timing") return {ok:true,value:220,ms:Infinity};
    if(code==="warning") return {ok:true,value:220,ms:1,warnings:["warning"]};
    return {ok:true,value:220,ms:1,truncated:true};
  }}}`);
  const engine=new Engine({module:path});
  try {
    await engine.start();
    for(const [code,reason] of [["json","non-json-output"],["timing","invalid-timing"],["warning","runtime-warning"],["truncated","truncated"]]) {
      const result=await engine.run(buildCases()[0],code);
      assert.equal(result.valid,false);
      assert.ok(result.reasons.includes(reason),JSON.stringify(result));
    }
    const exception=await engine.run(buildCases().find(c=>c.name==="explicit-error"),"transport");
    assert.equal(exception.valid,false);
    assert.ok(exception.reasons.includes("adapter-exception"));
  } finally {await engine.close();await rm(dir,{recursive:true,force:true});}
});
test("non-cooperative adapter is killed, recorded invalid, then restarted", {timeout:10000}, async()=>{
  const dir=await mkdtemp(join(tmpdir(),"codemode-watchdog-"));
  const path=join(dir,"adapter.mjs");
  await writeFile(path,'export function createAdapter(){return {name:"hang-test",language:"javascript",capabilities:[],async execute(code){if(code==="hang")while(true){};return {ok:true,value:220,ms:1};}}}');
  const engine=new Engine({module:path});
  try {
    await engine.start();
    const item={...buildCases()[0],timeoutMs:20};
    const result=await engine.run(item,"hang");
    assert.equal(result.valid,false);
    assert.deepEqual(result.reasons,["watchdog-timeout"]);
    assert.equal(result.traceComplete,false);
    const recovered=await engine.run(item,"recover");
    assert.equal(recovered.valid,true);
  } finally {await engine.close();await rm(dir,{recursive:true,force:true});}
});
