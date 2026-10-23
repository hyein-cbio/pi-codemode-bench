import { parentPort, workerData } from "node:worker_threads";
import { pathToFileURL } from "node:url";
import { createFixture } from "./fixtures.mjs";
import { validateOutcome } from "./validation.mjs";

let adapter;
try {
  if (workerData.target?.kind === "tool") adapter = await (await import("../adapters/tool.mjs")).openTool(workerData.target);
  else if (workerData.target?.kind === "pi-tool") adapter = await (await import("../adapters/pi-tool.mjs")).openPiTool(workerData.target);
  else if (workerData.module) adapter = await (await import(pathToFileURL(workerData.module).href)).createAdapter({ options: workerData.options ?? {} });
  else adapter = await (await import("../adapters/builtin.mjs")).openBuiltin(workerData.engine);
  if(!adapter || typeof adapter.name!=="string" || typeof adapter.language!=="string"
    || !Array.isArray(adapter.capabilities) || typeof adapter.execute!=="function")
    throw new Error("Invalid adapter contract");
  if(workerData.id) adapter.name=workerData.id;
  parentPort.postMessage({type:"ready",metadata:{
    name:adapter.name,language:adapter.language,capabilities:adapter.capabilities,
    version:adapter.version??null,lifecycle:adapter.lifecycle??"unknown",implementationHash:adapter.implementationHash??null,
    kind:adapter.kind??(workerData.module?"adapter":"runtime"),toolName:adapter.toolName??null,
    target:adapter.target??null,extensionHashes:adapter.extensionHashes??{},maxToolCalls:adapter.maxToolCalls??null,
    clock:adapter.clock??"performance.now around runtime setup and execute",
  }});
  let controller, closing = false;
  parentPort.on("message", async ({type,id,item,code})=>{
    if (type === "close") {
      if (closing) return;
      closing = true; controller?.abort(new Error("Benchmark host closed"));
      try { await adapter.dispose?.(); parentPort.postMessage({type:"closed"}); }
      catch (error) { parentPort.postMessage({type:"closed",error:String(error?.stack ?? error)}); }
      return;
    }
    if (closing) return;
    controller = new AbortController();
    const fixture=createFixture(item.plan);
    const start=performance.now();
    let result;
    try {result=await adapter.execute(code,{fixture,timeoutMs:item.timeoutMs,signal:controller.signal});}
    catch(error) {result={ok:false,transportError:true,error:String(error?.stack??error),ms:performance.now()-start};}
    const outcome = validateOutcome(item, result);
    const reasons = [...fixture.validate(item.concurrency), ...outcome.reasons];
    parentPort.postMessage({id,type:"result",result:{
      ...outcome, reasons, valid:reasons.length===0,
      status:reasons.length ? "invalid" : item.expectedOutcome === "error" ? "expected-error" : "success",
      trace:fixture.trace,peak:fixture.peak,toolAudit:result?.toolAudit??null,
    }});
  });
} catch(error) {
  try { await adapter?.dispose?.(); } catch { /* Report the original initialization failure. */ }
  parentPort.postMessage({type:"fatal",error:String(error?.stack??error)});
}
