import test from "node:test";
import assert from "node:assert/strict";
import { createFixture } from "../lib/fixtures.mjs";

test("fixture validates signatures, exact counts and dependencies before dispatch",async()=>{
  const plan=[
    {name:"read",args:{path:"a"},value:{ids:[1]}},
    {name:"read",args:{path:"b"},value:2,after:[0]},
  ];
  const fixture=createFixture(plan);
  await assert.rejects(fixture.call("read",{path:"b"}),/Unplanned/);
  const value=await fixture.call("read",{path:"a"});
  value.ids.push(2);
  assert.deepEqual(plan[0].value,{ids:[1]});
  await fixture.call("read",{path:"b"});
  assert.ok(fixture.validate().includes("call-count"));
  assert.ok(fixture.validate().includes("call-status"));
});
test("duplicate, missing, extra and traversal calls cannot pass an oracle",async()=>{
  const f=createFixture([{name:"read",args:{path:"a"},value:"ok"}]);
  assert.ok(f.validate().includes("missing-calls"));
  await assert.rejects(f.call("read",{path:"../secret"}),/Unplanned/);
  await f.call("read",{path:"a"});
  await assert.rejects(f.call("read",{path:"a"}),/Unplanned/);
  assert.ok(f.validate().length);
});
test("expected failure and bounded parallel calls retain a full trace",async()=>{
  const f=createFixture([
    {name:"task",args:{id:1},value:1,waitMs:5},
    {name:"task",args:{id:2},value:null,error:"TRANSIENT",waitMs:5},
  ]);
  await Promise.allSettled([f.call("task",{id:1}),f.call("task",{id:2})]);
  assert.deepEqual(f.validate({minPeak:2,maxPeak:2}),[]);
  assert.deepEqual(f.trace.map(c=>c.status),["ok","error"]);
  assert.equal(f.trace[0].replyHash.length,64);
  assert.equal(f.trace[1].error,"TRANSIENT");
  assert.ok(f.validate({maxPeak:1}).includes("concurrency"));
});
test("aborted fixture work is cancellation, not an expected tool failure",async()=>{
  const f=createFixture([{name:"task",args:{id:1},value:1,waitMs:100}]);
  const controller=new AbortController();
  const pending=f.call("task",{id:1},controller.signal);
  controller.abort();
  await assert.rejects(pending);
  assert.equal(f.trace[0].status,"cancelled");
  assert.ok(f.validate().includes("call-status"));
});
