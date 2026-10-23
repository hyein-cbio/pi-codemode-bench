import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, rm, cp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { normalizeTargets } from "../lib/targets.mjs";
import { Engine } from "../lib/engine.mjs";
import { buildCases } from "../corpus/index.mjs";
import { readConfig } from "../lib/config.mjs";

const exec = promisify(execFile);
const root = fileURLToPath(new URL("../", import.meta.url));

test("there are no implicit Pi/OpenCode target selections", async () => {
  assert.deepEqual(readConfig([]).engines, []);
  await assert.rejects(exec(process.execPath, [join(root, "bench.mjs"), "--sets=smoke"]), error => {
    assert.match(error.stderr, /No benchmark targets selected/);
    return true;
  });
  const listed = await exec(process.execPath, [join(root, "bench.mjs"), "--sets=all", "--list"]);
  assert.match(listed.stdout, /76 cases/);
});

test("host-neutral client gets the exact arbitrary tool name, source field, options and fixture", async () => {
  const dir = await mkdtemp(join(tmpdir(), "generic-codemode-"));
  const adapter = join(dir, "client.mjs");
  await writeFile(adapter, `export function createToolClient({options,toolName}) {
    if(options.marker!=="client-options") throw new Error("missing client options");
    return {version:"test-1",async callTool(name,input,{fixture}) {
      if(name!==toolName || name!=="vendor.run-code") throw new Error("wrong tool dispatched");
      if(input.program!=="reference-code" || input.mode!=="evaluate") throw new Error("input mismatch");
      const raw=await fixture.call("read",{path:"numbers.txt"});
      return {ok:true,value:raw.trim().split("\\n").map(Number).reduce((a,b)=>a+b,0),ms:-99};
    }};
  }`);
  const [target] = normalizeTargets({ version: 1, targets: [{
    id: "arbitrary-target", kind: "tool", tool: "vendor.run-code", adapter: "./client.mjs",
    inputKey: "program", input: { mode: "evaluate" }, options: { marker: "client-options" }, capabilities: ["tools"],
  }] }, dir);
  const engine = new Engine({ target });
  try {
    await engine.start();
    assert.equal(engine.metadata.kind, "tool");
    assert.equal(engine.metadata.toolName, "vendor.run-code");
    const result = await engine.run(buildCases().find(c => c.name === "read-reduce"), "reference-code");
    assert.equal(result.valid, true, JSON.stringify(result));
    assert.equal(result.toolAudit.toolName, "vendor.run-code");
    assert.ok(result.ms >= 0, "the harness measures call latency, not a client's claimed duration");
    assert.equal(result.trace.length, 1);
    assert.equal(result.toolAudit.liveModelRequests, undefined, "generic transports make no invented model-usage claims");
  } finally { await engine.close(); await rm(dir, { recursive: true, force: true }); }
});

test("generic target validation never silently selects a Pi adapter", () => {
  const valid = { version: 1, targets: [{ id: "custom", kind: "tool", tool: "any_name", adapter: "./client.mjs" }] };
  const [target] = normalizeTargets(valid, root);
  assert.equal(target.sdk, undefined);
  assert.deepEqual(target.capabilities, []);
  for (const field of ["extensions", "sdk", "engine", "resultFormat"]) {
    const data = structuredClone(valid); data.targets[0][field] = "not-allowed";
    assert.throws(() => normalizeTargets(data, root));
  }
  for (const adapter of [undefined, "npm:client", "https://example.test/client.mjs"]) {
    const data = structuredClone(valid); data.targets[0].adapter = adapter;
    assert.throws(() => normalizeTargets(data, root));
  }
});

test("the default demo runs all cases without node_modules or any sibling extension", { timeout: 30000 }, async () => {
  const dir = await mkdtemp(join(tmpdir(), "standalone-codemode-"));
  try {
    for (const path of ["bench.mjs", "index.mjs", "cases.mjs", "package.json", "package-lock.json", "bench.config.example.json",
      "lib", "corpus", "adapters", "examples"]) {
      await cp(join(root, path), join(dir, path), { recursive: true });
    }
    const out = join(dir, "results", "standalone.json");
    await exec(process.execPath, [join(dir, "bench.mjs"), "--config=" + join(dir, "bench.config.example.json"),
      "--sets=all", "--warmup=0", "--samples=1", "--out=" + out], { cwd: dir, timeout: 25000 });
    const receipt = JSON.parse(await readFile(out, "utf8"));
    assert.equal(receipt.cases.length, 76);
    assert.equal(receipt.counts.executions, 152);
    assert.equal(receipt.counts.invalid, 0);
    assert.equal(receipt.counts.unsupported, 0);
    assert.equal(receipt.engines[0].kind, "tool");
    assert.equal(receipt.engines[0].toolName, "run_script");
    assert.equal(receipt.engines[0].version, process.version);
    assert.ok(Object.keys(receipt.implementationHashes).some(path => path.endsWith("examples/node-tool-client.mjs")));
  } finally { await rm(dir, { recursive: true, force: true }); }
});
