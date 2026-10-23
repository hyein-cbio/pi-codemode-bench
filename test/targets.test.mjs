import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { normalizeTargets, loadTargets } from "../lib/targets.mjs";
import { readConfig } from "../lib/config.mjs";
import { decodeToolResult } from "../adapters/pi-tool.mjs";
import { Engine } from "../lib/engine.mjs";
import { buildCases } from "../corpus/index.mjs";
import { eligibility } from "../lib/runner.mjs";

const exec = promisify(execFile);
const root = fileURLToPath(new URL("../", import.meta.url));
const fixturePath = fileURLToPath(new URL("./fixtures/configured-tool.mjs", import.meta.url));
const data = () => ({ version: 1, targets: [{ tool: "configured_script", extensions: [fixturePath],
  inputKey: "program", input: { marker: "config-input" } }] });

test("target config resolves paths against the config, not the process cwd", async () => {
  const dir = await mkdtemp(join(tmpdir(), "bench-config-"));
  try {
    const config = join(dir, "targets.json");
    await writeFile(join(dir, "extension.mjs"), "throw new Error('must not load on --list-targets');");
    await writeFile(config, JSON.stringify({ version: 1, targets: [{ tool: "codemode_o", extensions: ["./extension.mjs"] }] }));
    const loaded = await loadTargets(readConfig(["--config=" + config]));
    assert.equal(loaded.targets[0].extensions[0], join(dir, "extension.mjs"));
    assert.equal(loaded.specs.length, 1);
    assert.equal(loaded.sha256.length, 64);
    const listed = await exec(process.execPath, [join(root, "bench.mjs"), "--config=" + config, "--list-targets"], { cwd: tmpdir() });
    assert.equal(JSON.parse(listed.stdout).targets[0].tool, "codemode_o");
    await assert.rejects(loadTargets(readConfig(["--config=" + config, "--targets=missing"])), /Unknown target/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test("strict target schema rejects ambiguous dispatch and implicit installation", () => {
  for (const argv of [["--config=a", "--engines=pi"], ["--config=a", "--adapter=b"], ["--targets=a"],
    ["--list-targets"], ["--config=a", "--list-targets", "--list"]]) assert.throws(() => readConfig(argv));
  for (const mutate of [
    d => d.version = 2,
    d => d.unknown = true,
    d => d.targets.push(d.targets[0]),
    d => d.targets[0].resultFormat = "guess",
    d => d.targets[0].extensions = ["npm:pi-opencode-mode"],
    d => d.targets[0].extensions = ["https://example.com/extension.js"],
    d => d.targets[0].input.program = "override",
    d => d.targets[0].maxToolCalls = 0,
    d => d.targets[0].capabilities = ["tools", "tools"],
    d => d.targets[0].kind = "fallback",
  ]) {
    const invalid = data(); mutate(invalid);
    assert.throws(() => normalizeTargets(invalid, root));
  }
  const builtin = normalizeTargets({ version: 1, targets: [{ tool: "codemode" }] }, root)[0];
  assert.equal(builtin.resultFormat, "pi-codemode");
  assert.equal(builtin.sourceOptions, true);
  assert.deepEqual(normalizeTargets({ version: 1, targets: [{ id: "raw", kind: "runtime", engine: "opencode" }] }, root),
    [{ id: "raw", kind: "runtime", engine: "opencode" }]);
});
test("tool result codecs do not silently discard logs, warnings, truncation or error status", () => {
  const result = text => ({ content: [{ type: "text", text }] });
  assert.deepEqual(decodeToolResult(result('"220"'), "json-text").value, "220");
  assert.equal(decodeToolResult(result("log\n220"), "json-text").ok, false);
  assert.equal(decodeToolResult(result("BENCH_EXPECTED"), "json-text").transportError, true);
  assert.equal(decodeToolResult({ ...result("220"), isError: true }, "json-text").ok, false);
  assert.equal(decodeToolResult({ ...result("220"), details: { truncated: true } }, "json-text").truncated, true);
  assert.equal(decodeToolResult({ ...result("220"), details: { warnings: ["problem"] } }, "json-text").warnings.length, 1);
  assert.equal(decodeToolResult({ content: [], structuredContent: { ok: true } }, "structured").value.ok, true);
  assert.equal(decodeToolResult(result("220"), "structured").ok, false);
  assert.equal(decodeToolResult(result("220"), "pi-codemode").ok, false);
});
test("registered nonstandard tool name and input key execute through actual Pi nested calls", { timeout: 30000 }, async () => {
  const target = normalizeTargets(data(), root)[0], engine = new Engine({ target });
  try {
    await engine.start();
    assert.equal(engine.metadata.kind, "pi-tool");
    assert.equal(engine.metadata.toolName, "configured_script");
    assert.ok(engine.metadata.extensionHashes[fixturePath]);
    for (const name of ["even-squares-10", "read-reduce", "parallel-context", "optional-context"]) {
      const item = buildCases().find(c => c.name === name);
      const result = await engine.run(item, item.code);
      assert.equal(result.valid, true, name + JSON.stringify(result));
      assert.equal(result.toolAudit.toolName, "configured_script");
      assert.equal(result.toolAudit.liveModelRequests, 0);
      assert.equal(result.toolAudit.scriptedTurns, 2);
      if (item.plan.length) {
        assert.equal(result.toolAudit.nestedCalls.complete, true);
        assert.equal(result.toolAudit.nestedCalls.calls.length, item.plan.length);
      }
    }
  } finally { await engine.close(); }
});

test("structured results survive real Pi dispatch, including nested calls and guest errors", async () => {
  const d = data();
  d.targets[0].resultFormat = "structured";
  d.targets[0].input.marker = "structured";
  const engine = new Engine({ target: normalizeTargets(d, root)[0] });
  try {
    for (const name of ["even-squares-10", "read-reduce", "parallel-context", "explicit-error"]) {
      const item = buildCases().find(c => c.name === name);
      const result = await engine.run(item, item.code);
      assert.equal(result.valid, true, name + JSON.stringify(result));
      if (item.plan.length) assert.equal(result.toolAudit.nestedCalls.calls.length, item.plan.length);
      if (item.expectedOutcome === "error") assert.equal(result.status, "expected-error");
    }
  } finally { await engine.close(); }
});
test("Pi decoding failures cannot pass expected guest-error probes", async () => {
  const d = data(); d.targets[0].input.marker = "malformed";
  const engine = new Engine({ target: normalizeTargets(d, root)[0] });
  try {
    const item = buildCases().find(c => c.name === "explicit-error");
    const result = await engine.run(item, item.code);
    assert.equal(result.valid, false);
    assert.equal(result.status, "invalid");
    assert.equal(result.answerCorrect, false);
    assert.ok(result.reasons.includes("adapter-exception"));
    assert.match(result.error, /Invalid tool output/);
  } finally { await engine.close(); }
});

test("a missing configured tool fails instead of falling back to the direct OpenCode runtime", async () => {
  const d = data(); d.targets[0].tool = "codemode_o";
  const engine = new Engine({ target: normalizeTargets(d, root)[0] });
  try { await assert.rejects(engine.start(), /codemode_o.*no runtime fallback/); }
  finally { await engine.close(); }
});
test("registered builtin codemode and declared product limits are distinct from runtime aliases", async () => {
  const target = normalizeTargets({ version: 1, targets: [{ tool: "codemode" }] }, root)[0];
  const engine = new Engine({ target });
  try {
    await engine.start();
    const item = buildCases().find(c => c.name === "read-reduce");
    const result = await engine.run(item, item.code);
    assert.equal(result.valid, true, JSON.stringify(result));
    assert.equal(result.toolAudit.toolName, "codemode");
    assert.equal(result.toolAudit.nestedCalls.calls[0].name, "read");
    const bridge = buildCases().find(c => c.name === "bridge-128-width-1");
    assert.equal(eligibility(bridge, { ...engine.metadata, maxToolCalls: 64 }), "tool-call-budget:128>64");
    const deadline = buildCases().find(c => c.name === "deadline-loop");
    assert.equal(eligibility(deadline, { ...engine.metadata, capabilities: ["tools"] }), "missing-capabilities:per-call-deadline");
  } finally { await engine.close(); }
});
test("CLI config selects only requested targets and receipts identify dispatch", async () => {
  const dir = await mkdtemp(join(tmpdir(), "bench-target-cli-"));
  try {
    const config = join(dir, "config.json"), out = join(dir, "receipt.json");
    const d = data();
    d.targets.push({ id: "runtime-control", kind: "runtime", engine: "node" });
    await writeFile(config, JSON.stringify(d));
    await exec(process.execPath, [join(root, "bench.mjs"), "--config=" + config, "--targets=configured_script",
      "--cases=read-reduce", "--samples=1", "--warmup=0", "--out=" + out], { timeout: 30000 });
    const receipt = JSON.parse(await readFile(out, "utf8"));
    assert.equal(receipt.engines.length, 1);
    assert.equal(receipt.engines[0].kind, "pi-tool");
    assert.equal(receipt.targetConfig.targets[0].tool, "configured_script");
    assert.equal(receipt.counts.invalid, 0);
    assert.ok(receipt.scope.includes("AgentSessions"));
    assert.ok(receipt.implementationHashes[fixturePath] || receipt.implementationHashes["test/fixtures/configured-tool.mjs"]);
    assert.equal(receipt.rows[0].toolAudit.toolName, "configured_script");
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test("optional installed pi-opencode-mode is a real tool, not the raw-runtime comparator", {
  skip: !process.env.PI_BENCH_OPENCODE_EXTENSION && "Set PI_BENCH_OPENCODE_EXTENSION to an existing local extension file",
  timeout: 30000,
}, async () => {
  const target = normalizeTargets({ version: 1, targets: [{ tool: "codemode_o",
    extensions: [process.env.PI_BENCH_OPENCODE_EXTENSION], maxToolCalls: 64 }] }, root)[0];
  const engine = new Engine({ target });
  try {
    await engine.start();
    for (const name of ["even-squares-10", "read-reduce", "retry-waves", "fan-in-dag-64"]) {
      const item = buildCases().find(c => c.name === name);
      const result = await engine.run(item, item.code);
      assert.equal(result.valid, true, name + JSON.stringify(result));
      assert.equal(result.toolAudit.toolName, "codemode_o");
      assert.equal(engine.metadata.kind, "pi-tool");
    }
  } finally { await engine.close(); }
});
