import vm from "node:vm";
import { createFixture } from "../lib/fixtures.mjs";

export function openNodeVm() {
  return {
    name:"node-vm",language:"javascript",version:process.version,capabilities:["tools","classes","deep-json","per-call-deadline"],
    lifecycle:"Fresh node:vm context per invocation; trusted reference control, NOT a security sandbox",
    async execute(code,{fixture=createFixture(),timeoutMs=10000}={}) {
      const started=performance.now();
      const controller=new AbortController();
      const timer=setTimeout(()=>controller.abort(new Error("deadline exceeded")),timeoutMs);
      try {
        const tools=Object.fromEntries(fixture.names.map(name=>[name,args=>fixture.call(name,JSON.parse(JSON.stringify(args)),controller.signal)]));
        const context=vm.createContext({tools});
        const value=await new vm.Script("(async()=>{\n"+code+"\n})()").runInContext(context,{timeout:timeoutMs});
        return {ok:true,value:JSON.parse(JSON.stringify(value)),ms:performance.now()-started};
      } catch(error) {
        return {ok:false,error:error.message,ms:performance.now()-started};
      } finally {clearTimeout(timer);controller.abort();}
    },
  };
}
