import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
const exec=promisify(execFile);
const run=args=>exec(process.execPath,["bench.mjs",...args],{timeout:30000});
test("CLI lists, exports and writes auditable receipts without overwriting",async()=>{
  const dir=await mkdtemp(join(tmpdir(),"codemode-cli-"));
  try {
    const listing=await run(["--sets=all","--list"]);
    assert.match(listing.stdout,/76 cases/);
    const exported=join(dir,"corpus.json");
    await run(["--cases=read-reduce","--export="+exported]);
    const data=JSON.parse(await readFile(exported,"utf8"));
    assert.equal(data.cases[0].plan.length,1);
    assert.equal(data.cases[0].expected,26);
    await assert.rejects(run(["--cases=read-reduce","--export="+exported]));
    const out=join(dir,"receipt.json");
    await run(["--cases=read-reduce","--engines=node","--warmup=1","--samples=2","--source-mode=fresh","--out="+out]);
    const receipt=JSON.parse(await readFile(out,"utf8"));
    assert.equal(receipt.complete,true);
    assert.equal(receipt.counts.executions,4);
    assert.equal(receipt.counts.invalid,0);
    assert.equal(receipt.cases[0].engines["node-vm"].n,2);
    assert.equal(new Set(receipt.rows.map(r=>r.sourceHash)).size,4);
    assert.equal((await readFile(out+".samples.jsonl","utf8")).trim().split("\n").length,4);
    assert.match(await readFile(out+".md","utf8"),/NOT process-cold/);
    await assert.rejects(run(["--cases=read-reduce","--engines=node","--out="+out]));
    assert.equal(JSON.parse(await readFile(out,"utf8")).complete,true);
  } finally {await rm(dir,{recursive:true,force:true});}
});
test("strict coverage fails after recording unsupported cells; expected errors have no speed stats",async()=>{
  const dir=await mkdtemp(join(tmpdir(),"codemode-coverage-"));
  try {
    const out=join(dir,"unsupported.json");
    await assert.rejects(run(["--cases=class-method","--engines=opencode","--strict-coverage","--out="+out]));
    const receipt=JSON.parse(await readFile(out,"utf8"));
    assert.equal(receipt.counts.unsupported,1);
    assert.equal(receipt.counts.executions,0);
    const errorOut=join(dir,"error.json");
    await run(["--cases=explicit-error","--engines=node","--warmup=0","--samples=1","--out="+errorOut]);
    const probe=JSON.parse(await readFile(errorOut,"utf8"));
    assert.equal(probe.counts.expectedErrors,2);
    assert.equal(probe.cases[0].engines["node-vm"].medianMs,null);
    assert.equal(probe.cases[0].engines["node-vm"].eligibleForTiming,false);
  } finally {await rm(dir,{recursive:true,force:true});}
});
test("mixed targets and custom adapters never imply audited offline or credential-free execution", async () => {
  const dir = await mkdtemp(join(tmpdir(), "codemode-scope-"));
  try {
    const module = join(dir, "client.mjs"), config = join(dir, "mixed.json");
    await writeFile(module, 'export function createToolClient(){return {callTool:async()=>({ok:true,value:220})}}; export function createAdapter(){return {name:"custom",language:"javascript",capabilities:[],execute:async()=>({ok:true,value:220,ms:1})}}');
    await writeFile(config, JSON.stringify({version:1,targets:[
      {kind:"tool",tool:"run_script",adapter:module},
      {kind:"pi-tool",tool:"codemode",extensions:["builtin:codemode"]},
    ]}));
    for (const [label, selection] of [["mixed", ["--config=" + config]], ["custom", ["--adapter=" + module]]]) {
      const out = join(dir, label + "-receipt.json");
      await run([...selection, "--sets=smoke", "--warmup=0", "--samples=1", "--out=" + out]);
      const receipt = JSON.parse(await readFile(out, "utf8"));
      assert.match(receipt.scope, /external effects.*not inferred/);
      assert.doesNotMatch(receipt.scope, /no live model|no.*credentials|offline/i);
      assert.ok((await readFile(out + ".md", "utf8")).includes(receipt.scope));
    }
  } finally { await rm(dir, {recursive:true,force:true}); }
});
test("prompt export has no reference code or oracle; candidate grading returns unknown model metrics",async()=>{
  const dir=await mkdtemp(join(tmpdir(),"codemode-task-"));
  try {
    const listed=await exec(process.execPath,["tasks.mjs","--list"]);
    const data=JSON.parse(listed.stdout);
    assert.equal(data.tasks.length,8);
    for(const task of data.tasks) {
      assert.equal(task.code,undefined);
      assert.equal(task.expected,undefined);
    }
    const source=join(dir,"answer.js");
    await writeFile(source,"return 220;");
    const graded=await exec(process.execPath,["tasks.mjs","--task=compute","--candidate="+source,"--engine=pi"]);
    const result=JSON.parse(graded.stdout);
    assert.equal(result.valid,true);
    assert.equal(result.tokens,null);
    assert.equal(result.costUsd,null);
    await writeFile(source,"return 221;");
    await assert.rejects(exec(process.execPath,["tasks.mjs","--task=compute","--candidate="+source,"--engine=pi"]));
  } finally {await rm(dir,{recursive:true,force:true});}
});
