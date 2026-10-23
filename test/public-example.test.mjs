import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildCases } from "../corpus/index.mjs";
import { runCases, summarizeRows } from "../lib/runner.mjs";
import { publicExample, comparisonTable } from "../lib/public-example.mjs";
import { valueHash, summarize } from "../lib/values.mjs";

async function syntheticReceipt() {
  const specs = buildCases(), config = { warmup: 1, samples: 3, seed: 1, sourceMode: "reused" };
  let tick = 0;
  const engines = [
    { name: "codemode", capabilities: ["tools", "classes", "deep-json", "per-call-deadline"], maxToolCalls: null },
    { name: "codemode_o", capabilities: ["tools"], maxToolCalls: 64 },
  ].map(meta => ({
    metadata: { ...meta, kind: "pi-tool", toolName: meta.name, language: "javascript", version: "test-sdk",
      clock: "test clock", lifecycle: "synthetic test, not measured results",
      extensionHashes: meta.name === "codemode_o" ? { "/Users/private/extension.js": "a".repeat(64) } : {},
      target: { sdk: "/Users/private/sdk", credential: "do-not-publish" } },
    async run(item) {
      const success = item.expectedOutcome === "success";
      return { valid: true, status: success ? "success" : "expected-error", answerCorrect: true, reasons: [],
        ms: ++tick / 10, value: success ? item.expected : null, outputHash: success ? valueHash(item.expected) : null,
        error: success ? null : item.errorPattern, peak: item.concurrency?.minPeak ?? (item.plan.length ? 1 : 0),
        trace: item.plan.map((p, i) => ({ name: p.name, args: p.args, status: p.error ? "error" : "ok", error: p.error,
          planIndex: i, replyHash: p.error ? undefined : valueHash(p.value) })),
        toolAudit: { toolName: meta.name, liveModelRequests: 0 },
      };
    },
  }));
  const rows = await runCases(engines, specs, config);
  return { format: 2, complete: true, sourceDrift: false, createdAt: "synthetic",
    config: { ...config, out: "/Users/private/results.json" }, engines: engines.map(e => e.metadata),
    cases: summarizeRows(rows, specs, engines), rows,
    counts: { executions: 735, unsupported: 5, invalid: 0, expectedErrors: 15 },
    host: { platform: "test", arch: "test", node: "test", cpu: "test", secretPath: "/Users/private" },
    git: { head: "b".repeat(40), status: " M /Users/private/file" },
    implementationHashes: { "bench.mjs": "c".repeat(64), "/Users/private/extension.js": "a".repeat(64) },
    targetConfig: { sha256: "d".repeat(64), file: "/Users/private/config.json" },
  };
}
const provenance = { sourceReceiptSha256: "e".repeat(64), extension: { entrySha256: "a".repeat(64), privatePath: "/Users/private" } };

test("checked-in public evidence reproduces its statistics and README table", async () => {
  const text = await readFile(new URL("../benchmarks/results/pi-comparison.json", import.meta.url), "utf8");
  const example = JSON.parse(text);
  assert.equal(example.cases.length, 76);
  assert.equal(example.method.samples, 20);
  assert.equal(example.method.warmup, 4);
  let executions = 0, unsupported = 0, expectedErrors = 0;
  for (const item of example.cases) for (const engine of Object.values(item.engines)) {
    if (engine.unsupported) { unsupported++; assert.equal(engine.eligibleForTiming, false); continue; }
    const { cold, warmup, warm } = engine.samplesMs;
    assert.equal(cold.length, 1);
    assert.equal(warmup.length, example.method.warmup);
    assert.equal(warm.length, example.method.samples);
    assert.ok([...cold, ...warmup, ...warm].every(ms => Number.isFinite(ms) && ms >= 0));
    executions += cold.length + warmup.length + warm.length;
    if (item.expectedOutcome === "error") {
      expectedErrors += cold.length + warmup.length + warm.length;
      assert.equal(engine.medianMs, null);
      assert.equal(engine.n, 0);
    } else {
      const stats = summarize(warm);
      for (const key of Object.keys(stats)) assert.equal(engine[key], stats[key]);
      assert.deepEqual(engine.outputHashes, [item.expectedHash]);
    }
  }
  assert.deepEqual(example.counts, { executions, unsupported, invalid: 0, expectedErrors });
  assert.equal(executions, 3675);
  assert.equal(unsupported, 5);
  assert.equal(expectedErrors, 75);
  assert.equal(/\/(?:Users|home|private|var\/folders)\//.test(text), false);
  const readme = await readFile(new URL("../README.md", import.meta.url), "utf8");
  assert.ok(readme.includes(comparisonTable(example, example.readmeCases)));
  const report = await readFile(new URL("../benchmarks/results/pi-comparison.json.md", import.meta.url), "utf8");
  assert.ok(report.includes(comparisonTable(example)));
});


test("public example preserves all timing samples and omits private paths/config/traces", async () => {
  const receipt = await syntheticReceipt(), exported = publicExample(receipt, provenance);
  assert.equal(exported.cases.length, 76);
  assert.deepEqual(exported.counts, receipt.counts);
  assert.equal(exported.cases[0].engines.codemode.samplesMs.warm.length, 3);
  assert.equal(exported.cases[0].engines.codemode.samplesMs.warmup.length, 1);
  assert.equal(exported.cases[0].engines.codemode.samplesMs.cold.length, 1);
  const json = JSON.stringify(exported);
  assert.equal(json.includes("/Users/private"), false);
  assert.equal(json.includes("do-not-publish"), false);
  assert.equal(json.includes('"trace":'), false);
  const error = exported.cases.find(c => c.name === "explicit-error");
  assert.equal(error.engines.codemode.medianMs, null);
  assert.equal(error.engines.codemode.eligibleForTiming, false);
  assert.match(comparisonTable(exported), /tool-call-budget:128>64/);
  assert.equal(comparisonTable(exported, exported.readmeCases).split("\n").length, 12);
});

test("publication refuses drift, invalid outcomes, missing/duplicate samples and tampered summaries", async () => {
  const original = await syntheticReceipt();
  for (const mutate of [
    r => r.complete = false,
    r => r.sourceDrift = true,
    r => r.rows.pop(),
    r => r.rows[1] = r.rows[0],
    r => r.rows.find(row => row.phase === "warm").valid = false,
    r => r.rows.find(row => row.phase === "warm").outputHash = "incorrect",
    r => r.rows.find(row => row.case === "cursor-pagination" && row.phase === "warm").trace.reverse(),
    r => r.rows.find(row => row.case === "join-topk" && row.phase === "warm").trace[0].planIndex = "0",
    r => r.cases[0].engines.codemode.medianMs = -1,
    r => r.cases[0].fixtureHash = "incorrect",
    r => r.counts.invalid = 1,
    r => r.engines[1].kind = "runtime",
  ]) {
    const receipt = structuredClone(original); mutate(receipt);
    assert.throws(() => publicExample(receipt, provenance), /Cannot publish example/);
  }
});
