#!/usr/bin/env node
import { runBenchmark } from "./lib/benchmark.mjs";
import { isMain } from "./lib/main.mjs";

if (isMain(import.meta.url)) {
  const controller = new AbortController();
  let interruptCode;
  const interrupt = signal => { interruptCode = signal === "SIGINT" ? 130 : 143; controller.abort(new Error("Benchmark interrupted")); };
  const onInt = () => interrupt("SIGINT"), onTerm = () => interrupt("SIGTERM");
  process.once("SIGINT", onInt); process.once("SIGTERM", onTerm);
  try {
    const result = await runBenchmark(process.argv.slice(2), { signal: controller.signal });
    if (interruptCode) process.exitCode = interruptCode;
    else if (result?.mode === "check" ? !result.ok : result && (!result.counts.executions || result.counts.invalid || result.sourceDrift ||
      (result.config["strict-coverage"] && result.counts.unsupported))) process.exitCode = 1;
  } catch (error) { console.error(error.code === "MISSING_ENGINE_DEPENDENCY" ? error.message : error.stack ?? error); process.exitCode = interruptCode ?? 1; }
  finally { process.off("SIGINT", onInt); process.off("SIGTERM", onTerm); }
}
