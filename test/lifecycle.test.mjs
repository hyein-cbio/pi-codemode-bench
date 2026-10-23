import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { runBenchmark } from "../index.mjs";
import { Engine } from "../lib/engine.mjs";
import { normalizeTargets } from "../lib/targets.mjs";
import { buildCases } from "../corpus/index.mjs";

test("normal disposal and caller cancellation clean up owned subprocesses", async () => {
  const dir = await mkdtemp(join(tmpdir(),"bench-lifecycle-"));
  let pid;
  try {
    const file = join(dir,"client.mjs"), pidFile = join(dir,"pid.txt"), disposed = join(dir,"disposed.txt");
    await writeFile(file, `import {spawn} from "node:child_process";import {writeFile} from "node:fs/promises";
export async function createToolClient({options}) {
 const child=spawn(process.execPath,["-e","setTimeout(()=>{},30000)"],{stdio:"ignore"});child.unref();
 await writeFile(options.pid,String(child.pid));
 return {version:String(child.pid),async callTool(name,input,{signal}) {
   if(input.code==="wait") return new Promise((resolve,reject)=>{signal.addEventListener("abort",()=>reject(signal.reason),{once:true})});
   return {ok:true,value:220};
 },async dispose(){const exited=new Promise(resolve=>child.once("close",resolve));child.kill();await exited;await writeFile(options.disposed,"closed");}};
}`);
    const [target] = normalizeTargets({version:1,targets:[{kind:"tool",tool:"run",adapter:file,options:{pid:pidFile,disposed}}]},dir);
    for (const cancel of [false,true]) {
      const engine = new Engine({target});
      try {
        await engine.start(); pid=Number(await readFile(pidFile,"utf8"));
        const controller = new AbortController(), item=buildCases()[0];
        const promise=engine.run(item,cancel?"wait":item.code,{signal:controller.signal});
        if(cancel) setTimeout(()=>controller.abort(new Error("test abort")),20);
        const result=await promise;
        if(cancel) { assert.equal(result.valid,false);assert.deepEqual(result.reasons,["caller-aborted"]); }
        else assert.equal(result.valid,true);
        await engine.close();
        assert.equal(await readFile(disposed,"utf8"),"closed");
        assert.throws(()=>process.kill(pid,0));
        pid=undefined;
      } finally {await engine.close();}
    }
  } finally {
    if(pid)try{process.kill(pid,"SIGKILL")}catch{}
    await rm(dir,{recursive:true,force:true});
  }
});

test("CLI interruption disposes the client and leaves an incomplete receipt", {timeout:10000}, async () => {
  const dir=await mkdtemp(join(tmpdir(),"bench-interrupt-"));
  let child;
  try {
    const client=join(dir,"client.mjs"),started=join(dir,"started"),disposed=join(dir,"disposed"),config=join(dir,"config.json"),out=join(dir,"out.json");
    await writeFile(client,'import {writeFile} from "node:fs/promises";export function createToolClient({options}){return {async callTool(name,input,{signal}){await writeFile(options.started,"started");return new Promise((resolve,reject)=>{if(signal.aborted)reject(signal.reason);else signal.addEventListener("abort",()=>reject(signal.reason),{once:true})})},dispose(){return writeFile(options.disposed,"closed")}}}');
    await writeFile(config,JSON.stringify({version:1,targets:[{kind:"tool",tool:"run",adapter:client,options:{started,disposed}}]}));
    child=spawn(process.execPath,["bench.mjs","--config="+config,"--sets=smoke","--warmup=0","--samples=1","--out="+out],{stdio:"ignore"});
    const exited=new Promise(resolve=>child.once("exit",code=>resolve(code)));
    let ready=false;
    for(let i=0;i<500&&!ready;i++){try{await readFile(started);ready=true}catch{await new Promise(resolve=>setTimeout(resolve,5))}}
    assert.equal(ready,true);
    child.kill("SIGINT");
    assert.equal(await exited,130);
    assert.equal(await readFile(disposed,"utf8"),"closed");
    assert.equal(JSON.parse(await readFile(out,"utf8")).complete,false);
  }finally{child?.kill("SIGKILL");await rm(dir,{recursive:true,force:true});}
});
test("an already cancelled API call does not initialize a client", async () => {
  const controller=new AbortController();controller.abort(new Error("cancelled before setup"));
  await assert.rejects(runBenchmark(["--config=/does-not-exist.json"],{signal:controller.signal}),/cancelled before setup/);
});
test("disposal failures are reported, not silently treated as clean shutdown", async () => {
  const dir=await mkdtemp(join(tmpdir(),"bench-close-"));
  const path=join(dir,"adapter.mjs"),engine=new Engine({module:path});
  try {
    await writeFile(path,'export function createAdapter(){return {name:"test",language:"javascript",capabilities:[],execute:async()=>({ok:true,value:220,ms:1}),dispose(){throw new Error("cleanup failed")}}}');
    await engine.start();
    await assert.rejects(engine.close(),/cleanup failed/);
  } finally {await engine.close();await rm(dir,{recursive:true,force:true});}
});
