import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { isMain } from "./lib/main.mjs";
import { tasks } from "./corpus/tasks.mjs";
import { buildCases } from "./corpus/index.mjs";
import { Engine } from "./lib/engine.mjs";
import { hash } from "./lib/values.mjs";
import { describeCase } from "./lib/runner.mjs";

export async function main(argv=process.argv.slice(2)) {
  const options={};
  for(const arg of argv) {
    if(arg==="--list") options.list=true;
    else {
      const m=/^--(task|candidate|engine|export)=(.+)$/.exec(arg);
      if(!m || options[m[1]]) throw new Error("Use --list, --export=file, or --task=id --candidate=file --engine=pi|opencode");
      options[m[1]]=m[2];
    }
  }
  if(options.list || options.export) {
    if(options.task || options.candidate || options.engine || (options.list && options.export)) throw new Error("Cannot combine listing/export with evaluation");
    const publicTasks=tasks.map(t=>({...t,language:"javascript",answer:"Return JSON-safe data, no text/console output",
      tools:"tools.read({path}) -> string; tools.list({glob}) -> string[]. Fixture-only tools; no real filesystem."}));
    const text=JSON.stringify({format:1,tasks:publicTasks},null,2);
    if(options.export) await writeFile(resolve(options.export),text,{flag:"wx"});
    else console.log(text);
    return;
  }
  const task=tasks.find(t=>t.id===options.task);
  if(!task || !options.candidate || !["pi","opencode"].includes(options.engine)) throw new Error("Specify --task=id --candidate=file --engine=pi|opencode");
  const code=await readFile(resolve(options.candidate),"utf8");
  if(Buffer.byteLength(code)>128*1024) throw new Error("Candidate source exceeds 128 KiB");
  const item=buildCases().find(c=>c.name===task.case);
  const engine=new Engine({engine:options.engine});
  try {
    await engine.start();
    const result=await engine.run(item,code);
    console.log(JSON.stringify({format:1,task:task.id,case:describeCase(item),engine:engine.metadata,sourceHash:hash(code),
      generationMs:null,tokens:null,costUsd:null,scope:"Offline candidate grading on fixed fixtures; not live model accuracy",...result},null,2));
    if(!result.valid) process.exitCode=1;
    return result;
  } finally {await engine.close();}
}
if(isMain(import.meta.url)) {
  try {await main();} catch(error) {console.error(error.message);process.exitCode=1;}
}
