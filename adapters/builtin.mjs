import { readFile } from "node:fs/promises";
import { openNodeVm } from "./node-vm.mjs";
export { openNodeVm } from "./node-vm.mjs";
import { createFixture } from "../lib/fixtures.mjs";
import { hash } from "../lib/values.mjs";

const piDir = new URL("../node_modules/@earendil-works/pi-coding-agent/", import.meta.url);
export function openCodeMode() {
  let modules;
  return {
    name: "codemode_o", language: "javascript", capabilities: ["tools", "per-call-deadline"],
    lifecycle: "Fresh CodeMode configuration and interpreter per invocation; parse, tool schemas and execution included",
    async execute(code, { fixture = createFixture(), timeoutMs = 10000 } = {}) {
      modules ??= Promise.all([import("@opencode/codemode"), import("effect")]);
      const [{ CodeMode, Tool }, { Effect, Schema }] = await modules;
      const started = performance.now();
      const tools = Object.fromEntries(fixture.names.map(name=>[name, Tool.make({
        description: "Controlled benchmark fixture " + name, input: Schema.Unknown, output: Schema.Unknown,
        execute: args => Effect.tryPromise({ try: signal => fixture.call(name, args, signal), catch: error => error }),
      })]));
      const runtime = CodeMode.make({ tools, limits: { timeoutMs } });
      const result = await Effect.runPromise(runtime.execute(code));
      return { ok: result.ok === true, value: result.ok ? result.value : undefined,
        error: result.ok ? null : JSON.stringify(result.error), truncated: result.truncated === true,
        warnings: result.warnings ?? [], ms: performance.now() - started };
    },
  };
}
export async function openNativePi() {
  const pkg = JSON.parse(await readFile(new URL("package.json", piDir), "utf8"));
  const executeUrl = new URL("dist/extensions/codemode/execute.js", piDir);
  const { executeCodemode } = await import(executeUrl.href);
  return {
    name: "codemode", language: "javascript", version: pkg.version, capabilities: ["tools", "classes", "deep-json", "per-call-deadline"],
    implementationHash: hash(await readFile(executeUrl)),
    lifecycle: "Pinned Pi executeCodemode with fresh QuickJS sandbox; fixture context, not AgentSession",
    async execute(code, { fixture = createFixture(), timeoutMs = 10000 } = {}) {
      const started = performance.now();
      let id = 0;
      const ctx = {
        tools: fixture.names.map(name=>({ name, description: "Controlled benchmark fixture " + name,
          parameters: {type:"object",additionalProperties:true}, outputSchema: {} })),
        sessionManager: { getBranch: () => [] },
        async executeTool(name, args, {signal}) {
          const toolCall = {id:String(++id),name,arguments:args};
          try {
            const value = await fixture.call(name,args,signal);
            return {toolCall,isError:false,result:{content:[],structuredContent:value}};
          } catch(error) {
            return {toolCall,isError:true,result:{content:[{type:"text",text:error.message}]}};
          }
        },
      };
      const result = await executeCodemode("bench", {code:'// @options: {"timeout_ms":'+timeoutMs+'}\n'+code}, undefined, undefined, ctx);
      // This corpus returns exactly one value, without console/text/image output.
      const items = result.content?.filter(block=>block.type==="text").slice(1) ?? [];
      let value;
      if(result.isError !== true && items.length === 1) {
        try { value=JSON.parse(items[0].text); } catch { value=items[0].text; }
      }
      return {ok:result.isError !== true && value !== undefined,value,
        error:result.isError ? items.map(item=>item.text).join("\n") : null,
        truncated:Boolean(result.details?.fullOutputPath), ms:performance.now()-started};
    },
  };
}
export async function openBuiltin(name) {
  if(name==="pi" || name==="codemode") return openNativePi();
  if(name==="opencode" || name==="codemode_o") {
    const adapter=openCodeMode();
    adapter.version=JSON.parse(await readFile(new URL("../node_modules/@opencode/codemode/package.json",import.meta.url),"utf8")).version;
    return adapter;
  }
  if(name==="node" || name==="node-vm") return openNodeVm();
  throw new Error("Unknown engine: "+name);
}
