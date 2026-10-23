import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync, execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
const exec=promisify(execFile);
const python=spawnSync("python3",["--version"],{encoding:"utf8"}).status===0;

test("Python JSONL executes real fixture callbacks, parallelism, failures and deadlines", {
  skip:!python && "Optional example requires python3", timeout:30000,
},async()=>{
  const dir=await mkdtemp(join(tmpdir(),"bench-python-"));
  try {
    const out=join(dir,"receipt.json");
    await exec(process.execPath,["bench.mjs","--config=examples/targets/python.json",
      "--cases=even-squares-10,read-reduce,parallel-context,optional-context,explicit-error,deadline-loop",
      "--source-mode=fresh","--warmup=1","--samples=2","--out="+out],{timeout:25000});
    const r=JSON.parse(await readFile(out,"utf8"));
    assert.deepEqual(r.counts,{executions:24,invalid:0,unsupported:0,expectedErrors:8});
    const parallel=r.rows.filter(row=>row.case==="parallel-context");
    assert.ok(parallel.every(row=>row.peak===2 && row.trace.length===2));
    assert.ok(r.rows.filter(row=>row.case==="optional-context").every(row=>row.trace.filter(call=>call.status==="error").length===1));
    assert.ok(r.rows.filter(row=>row.case==="deadline-loop").every(row=>row.status==="expected-error"));
    assert.ok(Object.keys(r.implementationHashes).some(path=>path.endsWith("python-jsonl-server.py")));
    assert.ok(r.engines[0].version.startsWith("Python "));
  }finally{await rm(dir,{recursive:true,force:true});}
});
