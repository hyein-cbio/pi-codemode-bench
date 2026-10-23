import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createJsonlClient } from "../lib/jsonl-client.mjs";
import { createFixture } from "../lib/fixtures.mjs";

test("JSONL cancellation aborts callbacks, reaps its backend and permits a clean restart", {timeout:10000}, async () => {
  const dir = await mkdtemp(join(tmpdir(), "bench-jsonl-")), pids = join(dir, "pids.txt");
  let client;
  try {
    const script = join(dir, "backend.mjs");
    await writeFile(script, `import {appendFileSync} from "node:fs";import {createInterface} from "node:readline";
appendFileSync(process.argv[2],process.pid+"\\n");
const send=m=>process.stdout.write(JSON.stringify(m)+"\\n");send({type:"ready",version:"test-backend"});
createInterface({input:process.stdin}).on("line",line=>{const m=JSON.parse(line);if(m.type==="execute")send({type:"tool",executionId:m.executionId,id:"1",name:"read",args:{path:"x"}})});`);
    client = await createJsonlClient({command:process.execPath,args:[script,pids]});
    const fixture = createFixture([{name:"read",args:{path:"x"},value:"data",waitMs:500}]);
    const controller = new AbortController();
    const call = client.callTool("run",{code:"test"},{fixture,timeoutMs:2000,signal:controller.signal});
    // Wait for the callback rather than racing interpreter startup on slow hosts.
    for (let i=0;i<500 && !fixture.trace.length;i++) await new Promise(resolve=>setTimeout(resolve,5));
    assert.equal(fixture.trace.length,1);
    controller.abort(new Error("test abort"));
    const aborted = await call;
    assert.equal(aborted.transportError,true);
    assert.equal(fixture.trace[0].status,"cancelled");
    const timeout = await client.callTool("run",{code:"test"},{fixture:createFixture(),timeoutMs:20});
    assert.equal(timeout.ok,false);
    assert.equal(timeout.transportError,undefined);
    assert.match(timeout.error,/deadline/);
    await client.dispose();
    for (const pid of (await readFile(pids,"utf8")).trim().split("\n").map(Number)) assert.throws(()=>process.kill(pid,0));
    await assert.rejects(client.callTool("run",{},{fixture:createFixture(),timeoutMs:20}),/disposed/);
  } finally {await client?.dispose();await rm(dir,{recursive:true,force:true});}
});

test("JSONL startup and protocol failures are transport errors, not guest errors", async () => {
  await assert.rejects(createJsonlClient({command:process.execPath,args:["-e",'console.log("not JSON")']}));
  const client=await createJsonlClient({command:process.execPath,args:["-e",'console.log(JSON.stringify({type:"ready",version:"test"}));process.stdin.on("data",()=>console.log(JSON.stringify({type:"result",executionId:999,ok:true,value:220})))']});
  try {
    const result=await client.callTool("run",{},{fixture:createFixture(),timeoutMs:1000});
    assert.equal(result.ok,false);
    assert.equal(result.transportError,true);
    assert.match(result.error,/execution id/);
  } finally {await client.dispose();}
});
