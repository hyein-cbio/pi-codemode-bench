import { runBenchmark, buildCases, createJsonlClient } from "pi-codemode-bench";
import type { BenchmarkConfig, ToolClientFactory, RuntimeAdapterFactory, SourceFactory } from "pi-codemode-bench";

const config = {version:1,sources:["./sources.mjs"],targets:[
  {kind:"tool",tool:"run",adapter:"./client.mjs"},
  {kind:"runtime",id:"custom",adapter:"./runtime.mjs",options:{mode:"test"}}
]} satisfies BenchmarkConfig;
const source: SourceFactory = ({seed,caseNames}) => ({
  language:"example",comment:{prefix:"#"},
  sources:{[caseNames[0]]:"return "+seed},
});
const factory: ToolClientFactory = async ({toolName}) => ({
  version:toolName,
  async callTool(name,input,{fixture,signal,timeoutMs}) {
    if(timeoutMs < 1) throw new Error("deadline");
    signal?.throwIfAborted();
    return {ok:true,value:await fixture.call(name,input,signal)};
  },
  dispose() {},
});
const runtime: RuntimeAdapterFactory = ({options}) => ({
  name:"test",language:"example",capabilities:[],
  async execute(code,context) { return {ok:true,value:options.mode??code,ms:context.timeoutMs}; },
});
void config; void source; void factory; void runtime;
void buildCases({seed:719});
void createJsonlClient({command:"python3",args:[]});
const result=await runBenchmark(["--check"],{log:()=>{}});
if(result && "mode" in result) result.targets[0].eligible.toFixed();
else if(result) result.counts.executions.toFixed();
// @ts-expect-error Unknown target variants must not typecheck.
const bad: BenchmarkConfig={version:1,targets:[{kind:"unknown"}]};
void bad;
