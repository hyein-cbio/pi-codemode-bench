import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const exec = promisify(execFile);
const api = new URL("../index.mjs", import.meta.url).href;
const engineModule = new URL("../lib/engine.mjs", import.meta.url).href;
const corpus = new URL("../corpus/index.mjs", import.meta.url).href;
const piConfig = new URL("../examples/targets/pi.json", import.meta.url);

const entryModes = [
  { name: "eval, equals option", flags: ["--input-type=module"], eval: true },
  { name: "eval, separate option", flags: ["--input-type", "module"], eval: true },
  { name: "stdin, equals option", flags: ["--input-type=module"] },
  { name: "stdin, separate option", flags: ["--input-type", "module"] },
];

for (const mode of entryModes) {
  test("public API runs real engines from " + mode.name, { timeout: 30000 }, async () => {
    const dir = await mkdtemp(join(tmpdir(), "bench-inline-"));
    try {
      const code = `import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { runBenchmark } from ${JSON.stringify(api)};
for (const [name, selection] of [
  ["runtimes", ["--engines=node,pi,opencode"]],
  ["registered-pi", ["--config=" + fileURLToPath(${JSON.stringify(piConfig.href)})]],
]) {
  const result = await runBenchmark([...selection, "--cases=even-squares-10,read-reduce",
    "--warmup=0", "--samples=1", "--out=" + name + ".json"], { log: () => {} });
  assert.equal(result.complete, true);
  assert.equal(result.counts.invalid, 0);
  assert.equal(result.counts.executions, name === "runtimes" ? 12 : 4);
}`;
      const execution = exec(process.execPath, [...mode.flags, ...(mode.eval ? ["--eval", code] : [])],
        { cwd: dir, timeout: 25000 });
      execution.child.stdin.end(mode.eval ? undefined : code);
      await execution;
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
}

test("inline entry removes only input-type and preserves worker preloads and other flags", async () => {
  const dir = await mkdtemp(join(tmpdir(), "bench-worker-flags-"));
  try {
    const adapter = join(dir, "adapter.mjs");
    await writeFile(adapter, `export function createAdapter() {
  return { name: "flags", language: "javascript", capabilities: [], async execute() {
    const valid = globalThis.benchmarkPreload === true && process.execArgv.includes("--no-warnings")
      && !process.execArgv.some(arg => arg.startsWith("--input-type"));
    return { ok: true, value: valid ? 220 : 0, ms: 1 };
  } };
}`);
    const code = `import assert from "node:assert/strict";
import { Engine } from ${JSON.stringify(engineModule)};
import { buildCases } from ${JSON.stringify(corpus)};
const engine = new Engine({ module: ${JSON.stringify(adapter)} });
try {
  const item = buildCases()[0];
  assert.equal((await engine.run(item, item.code)).valid, true);
  assert.ok(process.execArgv.includes("--input-type"));
} finally { await engine.close(); }`;
    await exec(process.execPath, ["--no-warnings", "--import=data:text/javascript,globalThis.benchmarkPreload=true",
      "--input-type", "module", "--eval", code], { cwd: dir, timeout: 10000 });
  } finally { await rm(dir, { recursive: true, force: true }); }
});
