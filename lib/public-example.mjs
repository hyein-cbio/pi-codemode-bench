import { buildCases } from "../corpus/index.mjs";
import { eligibility, sourceFor } from "./runner.mjs";
import { equal, hash, valueHash, summarize } from "./values.mjs";
import { validateOutcome, validateTrace } from "./validation.mjs";

// Selected by workload shape before the example run, not by observed winners.
export const readmeCases = ["even-squares-10", "read-reduce", "parallel-context", "cursor-pagination", "retry-waves",
  "fan-in-dag-64", "deep-roundtrip-64", "arithmetic-100000", "json-records-8k-x1", "json-strings-48k-x4"];
const need = (condition, message) => { if (!condition) throw new Error("Cannot publish example: " + message); };
const select = (object, keys) => Object.fromEntries(keys.map(key => [key, object[key]]));

export function publicExample(receipt, { sourceReceiptSha256, extension }) {
  need(receipt.format === 2 && receipt.complete === true && receipt.sourceDrift === false, "incomplete or drifted receipt");
  const { warmup, samples, seed, sourceMode } = receipt.config;
  need(Number.isSafeInteger(warmup) && warmup >= 0 && Number.isSafeInteger(samples) && samples > 0, "invalid sample schedule");
  need(["reused", "fresh"].includes(sourceMode), "invalid source mode");
  const specs = buildCases({ seed });
  need(equal(receipt.cases.map(c => c.name), specs.map(c => c.name)), "example must retain the entire corpus in catalog order");
  need(equal(receipt.engines.map(e => e.name), ["codemode", "codemode_o"]), "expected the two registered tools, in order");
  need(receipt.engines.every(e => e.kind === "pi-tool" && e.toolName === e.name), "not a registered-tool comparison");
  need(/^[a-f0-9]{64}$/.test(sourceReceiptSha256), "missing source receipt hash");
  need(/^[a-f0-9]{64}$/.test(extension.entrySha256), "missing extension entry hash");
  need(Object.values(receipt.engines[1].extensionHashes).includes(extension.entrySha256), "extension identity mismatch");
  const expectedExecutions = specs.reduce((n, spec) => n + receipt.engines.filter(e => !eligibility(spec, e)).length * (1 + warmup + samples), 0);
  const expectedUnsupported = specs.length * 2 - expectedExecutions / (1 + warmup + samples);
  need(receipt.rows.length === expectedExecutions + expectedUnsupported, "missing or extra rows");
  let expectedErrors = 0;
  const cases = specs.map((spec, caseIndex) => {
    const recorded = receipt.cases[caseIndex];
    need(recorded.fixtureHash === valueHash(spec.plan), "fixture hash mismatch: " + spec.name);
    const expectedHash = spec.expectedOutcome === "success" ? valueHash(spec.expected) : null;
    need(recorded.expectedHash === expectedHash, "oracle hash mismatch: " + spec.name);
    const engines = Object.fromEntries(receipt.engines.map(engine => {
      const rows = receipt.rows.filter(r => r.case === spec.name && r.engine === engine.name);
      const unsupported = eligibility(spec, engine);
      if (unsupported) {
        need(rows.length === 1 && rows[0].phase === "eligibility" && rows[0].status === "unsupported" && rows[0].reason === unsupported,
          "incorrect unsupported cell: " + spec.name + "/" + engine.name);
        return [engine.name, { unsupported, ...summarize([]), eligibleForTiming: false, validatedExecutions: 0, samplesMs: { cold: [], warmup: [], warm: [] } }];
      }
      need(rows.length === 1 + warmup + samples, "sample count: " + spec.name + "/" + engine.name);
      const slots = new Set();
      const signatures = new Set(), sources = new Set(), outputs = new Set();
      for (const row of rows) {
        const slot = row.phase + ":" + row.sample;
        need(!slots.has(slot), "duplicate sample slot"); slots.add(slot);
        const expectedStatus = spec.expectedOutcome === "error" ? "expected-error" : "success";
        need(row.valid === true && row.status === expectedStatus && row.reasons?.length === 0 && row.answerCorrect === true, "invalid sample");
        const outcome = validateOutcome(spec, { ok: row.status === "success", ms: row.ms, error: row.error, value: row.value });
        need(outcome.reasons.length === 0 && row.outputHash === outcome.outputHash, "sample outcome mismatch");
        need(validateTrace(spec.plan, row.trace ?? [], row.peak, spec.concurrency).length === 0, "call contract");
        need(row.toolAudit?.toolName === engine.name && row.toolAudit.liveModelRequests === 0, "missing actual tool audit");
        const code = sourceFor(spec, engine, sourceMode, row.sourceNonce);
        need(row.sourceHash === hash(code), "executed source mismatch");
        sources.add(row.sourceHash);
        if (expectedHash) outputs.add(row.outputHash);
        else expectedErrors++;
        const trace = row.trace.map(({ name, args, status, planIndex }) => ({ name, args, status, planIndex }));
        signatures.add(valueHash(trace));
      }
      const phases = { cold: 1, warmup, warm: samples };
      const samplesMs = {};
      for (const [phase, count] of Object.entries(phases)) {
        const phaseRows = rows.filter(r => r.phase === phase).sort((a, b) => a.sample - b.sample);
        need(phaseRows.length === count && phaseRows.every((r, i) => r.sample === (phase === "cold" ? -1 : i)), "phase coverage");
        samplesMs[phase] = phaseRows.map(r => r.ms);
      }
      const stats = summarize(expectedHash ? samplesMs.warm : []);
      const summary = recorded.engines[engine.name];
      need(equal(select(summary, Object.keys(stats)), stats) && summary.invalid === 0 && summary.eligibleForTiming === Boolean(expectedHash), "summary differs from samples");
      return [engine.name, { ...stats, unsupported: null, eligibleForTiming: Boolean(expectedHash),
        validatedExecutions: rows.length, samplesMs, sourceHashes: [...sources], outputHashes: [...outputs],
        callSignatureHashes: [...signatures], observedPeak: { min: Math.min(...rows.map(r => r.peak)), max: Math.max(...rows.map(r => r.peak)) } }];
    }));
    return { name: spec.name, suite: spec.suite, tier: spec.tier, kind: spec.kind, calls: spec.plan.length,
      axes: spec.axes ?? {}, expectedOutcome: spec.expectedOutcome, fixtureHash: recorded.fixtureHash, expectedHash, engines };
  });
  const counts = { executions: expectedExecutions, invalid: 0, unsupported: expectedUnsupported, expectedErrors };
  need(equal(receipt.counts, counts), "receipt counts differ from validated rows");
  const implementations = receipt.engines.map(e => ({ name: e.name, kind: e.kind, toolName: e.toolName, sdkVersion: e.version,
    clock: e.clock, lifecycle: e.lifecycle, capabilities: e.capabilities, maxToolCalls: e.maxToolCalls,
    ...(e.name === "codemode_o" ? { extension: select(extension, ["repository", "revision", "packageVersion", "entrySha256",
      "measuredSourceDirty", "workingTreeDirty", "packageSha256", "lockSha256", "codeModeVersion", "effectVersion", "note"]) } : {}) }));
  // Allowlist, never recursively copy target config, raw values/traces/errors or local paths.
  const implementationHashes = Object.fromEntries(Object.entries(receipt.implementationHashes)
    .filter(([path]) => !path.startsWith("/") && !path.includes("..") && !path.includes(":") && !path.includes("\\")));
  return {
    format: "pi-codemode-bench.public-example.v1", createdAt: receipt.createdAt, sourceReceiptSha256,
    scope: "Optional registered-tool replay; synthetic host fixtures, scripted assistant turns, no live model requests.",
    method: { warmup, samples, seed, sourceMode, cold: "one first-invocation sample per case, not process-cold",
      clock: "root Pi tool_execution_start to tool_execution_end; session setup and scripted turns excluded",
      order: "serial; starting engine rotates by case index, sample index and seed",
      caveat: "One host and one run; no confidence interval, production weights or universal speedup. Different product limits remain visible." },
    host: select(receipt.host, ["platform", "arch", "osRelease", "node", "cpu", "logicalCpus", "ramBytes", "loadAverageBefore", "loadAverageAfter"]),
    provenance: { benchmarkHead: receipt.git.head, workingTreeDirty: Boolean(receipt.git.status), implementationHashes,
      configSha256: receipt.targetConfig.sha256,
      policy: "Source hashes identify measured code. New publication requires a clean committed benchmark revision; historical exports may predate that gate. Absolute paths and private config are omitted." },
    implementations, counts, readmeCases, cases,
  };
}

export function comparisonTable(example, names = example.cases.map(c => c.name)) {
  const lines = ["| Case | Pi codemode median / p95 (ms) | codemode_o median / p95 (ms) |", "|---|---:|---:|"];
  for (const name of names) {
    const item = example.cases.find(c => c.name === name);
    if (!item) throw new Error("Unknown table case: " + name);
    const cell = engine => engine.unsupported ? "Unsupported: " + engine.unsupported
      : !engine.eligibleForTiming ? "Expected-error check; not timed for comparison"
      : engine.medianMs.toFixed(3) + " / " + engine.p95Ms.toFixed(3);
    lines.push("| " + name + " | " + cell(item.engines.codemode) + " | " + cell(item.engines.codemode_o) + " |");
  }
  return lines.join("\n");
}
