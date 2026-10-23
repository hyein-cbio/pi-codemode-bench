// Optional language-neutral adapter example: trusted pure-compute Python only.
// No tools/concurrency support is claimed. Requires python3 on PATH.
import { spawnSync } from "node:child_process";
export async function createAdapter() {
  const version=spawnSync("python3",["--version"],{encoding:"utf8"});
  if(version.status!==0) throw new Error("python3 is required");
  return {
    name:"python",language:"python",version:version.stdout.trim(),capabilities:[],
    lifecycle:"Fresh isolated-mode Python process per call, including process startup; trusted code only",
    async execute(code,{timeoutMs}) {
      const start=performance.now();
      const result=spawnSync("python3",["-I","-c",
        'import json,sys\nsource=json.load(sys.stdin)["code"]\nscope={}\nexec(source,scope)\nprint(json.dumps(scope["result"],allow_nan=False))'],
        {input:JSON.stringify({code}),encoding:"utf8",timeout:timeoutMs,maxBuffer:1024*1024});
      const ms=performance.now()-start;
      if(result.error || result.status!==0) return {ok:false,error:result.error?.message??result.stderr,ms};
      try {return {ok:true,value:JSON.parse(result.stdout),ms};}
      catch(error) {return {ok:false,error:error.message,ms};}
    },
  };
}
