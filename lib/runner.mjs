import { hash, valueHash, summarize } from "./values.mjs";

export function eligibility(item, metadata) {
  if (!item.sources[metadata.language]) return "no-source:" + metadata.language;
  const required = [...item.requires, ...(item.plan.length ? ["tools"] : [])];
  if (metadata.maxToolCalls != null && item.plan.length > metadata.maxToolCalls) return "tool-call-budget:" + item.plan.length + ">" + metadata.maxToolCalls;
  const missing = required.filter(c => !metadata.capabilities.includes(c));
  return missing.length ? "missing-capabilities:" + missing.join(",") : null;
}
export function sourceFor(item, metadata, mode, nonce) {
  const source = item.sources[metadata.language];
  if (mode !== "fresh") return source;
  const comment = metadata.sourceComment ?? { prefix: { javascript: "//", python: "#", luau: "--" }[metadata.language], suffix: "" };
  if (!comment.prefix) throw new Error("Fresh source comments not defined for " + metadata.language + "; declare comment in its source plugin");
  return comment.prefix + " benchmark nonce " + nonce + (comment.suffix ?? "") + "\n" + source;
}
export function describeCase(item) {
  return {
    name: item.name, suite: item.suite, tier: item.tier, kind: item.kind, seed: item.seed, tags: item.tags,
    axes: item.axes ?? {}, requires: item.requires, expectedOutcome: item.expectedOutcome,
    expected: item.expected ?? null, errorPattern: item.errorPattern ?? null,
    expectedHash: item.expectedOutcome === "success" ? valueHash(item.expected) : null,
    fixtureHash: valueHash(item.plan), calls: item.plan.length,
    replyBytes: item.plan.reduce((n,c) => n + (c.error ? 0 : Buffer.byteLength(JSON.stringify(c.value))), 0),
    artificialWaitMs: item.plan.reduce((n,c) => n + (c.waitMs ?? 0), 0),
    timeoutMs: item.timeoutMs, concurrency: item.concurrency ?? null,
    sources: Object.fromEntries(Object.entries(item.sources).map(([language, code]) => [language, {
      sha256: hash(code), bytes: Buffer.byteLength(code), utf16Units: code.length, lines: code.split("\n").length,
    }])), provenance: item.provenance,
  };
}
export async function runCases(engines, selected, config, onRow = async () => {}, { signal } = {}) {
  const rows = [];
  let nonce = 0;
  const emit = async row => { rows.push(row); await onRow(row); };
  for (let caseIndex = 0; caseIndex < selected.length; caseIndex++) {
    signal?.throwIfAborted();
    const item = selected[caseIndex];
    const eligible = [];
    for (const engine of engines) {
      const reason = eligibility(item, engine.metadata);
      if (reason) await emit({ case: item.name, engine: engine.metadata.name, phase: "eligibility", status: "unsupported", valid: false, reason, ms: null });
      else eligible.push(engine);
    }
    for (let sample = -1; sample < config.warmup + config.samples; sample++) {
      const phase = sample === -1 ? "cold" : sample < config.warmup ? "warmup" : "warm";
      for (let offset = 0; offset < eligible.length; offset++) {
        const engine = eligible[(caseIndex + sample + 1 + offset + config.seed) % eligible.length];
        const code = sourceFor(item, engine.metadata, config.sourceMode, ++nonce);
        signal?.throwIfAborted();
        const result = await engine.run(item, code, { signal });
        await emit({ case: item.name, engine: engine.metadata.name, phase,
          sample: phase === "warm" ? sample - config.warmup : sample,
          order: offset, sourceHash: hash(code), sourceBytes: Buffer.byteLength(code),
          sourceUtf16Units: code.length, sourceLines: code.split("\n").length,
          sourceNonce: config.sourceMode === "fresh" ? nonce : null, ...result });
        signal?.throwIfAborted();
      }
    }
  }
  return rows;
}
export function summarizeRows(rows, selected, engines) {
  return selected.map(item => ({ ...describeCase(item), engines: Object.fromEntries(engines.map(engine => {
    const name = engine.metadata.name;
    const samples = rows.filter(r => r.case === item.name && r.engine === name);
    const unsupported = samples.find(r => r.status === "unsupported");
    const warm = samples.filter(r => r.phase === "warm");
    const successful = warm.filter(r => r.valid && r.status === "success");
    const invalid = samples.filter(r => r.status === "invalid");
    return [name, {
      ...summarize(successful.map(r => r.ms)), warmSamples: warm.length,
      invalid: invalid.length, valid: warm.filter(r => r.valid).length,
      expectedErrors: samples.filter(r => r.status === "expected-error").length,
      unsupported: unsupported?.reason ?? null,
      coldMs: samples.find(r => r.phase === "cold")?.ms ?? null,
      coldValid: samples.find(r => r.phase === "cold")?.valid ?? null,
      eligibleForTiming: !unsupported && invalid.length === 0 && warm.length > 0 && successful.length === warm.length,
    }];
  })) }));
}
export function markdownReport(receipt) {
  const lines = ["# Codemode benchmark", "", receipt.scope ?? "Controlled replay; external target effects are not inferred.", "",
    "Cold = first invocation for this case in a reused host worker; NOT process-cold.",
    "No aggregate speedup: runtimes have different startup and security contracts.", "",
    "| Case | Suite | Engine | Warm n | Median ms | p95 ms | Invalid (all phases) | Coverage |",
    "|---|---|---|---:|---:|---:|---:|---|"];
  for (const item of receipt.cases) for (const [name, result] of Object.entries(item.engines)) {
    const label = result.unsupported ?? (item.expectedOutcome === "error" ? "expected-error probe" : result.eligibleForTiming ? "valid" : "INVALID; not comparable");
    lines.push(`| ${item.name} | ${item.suite} | ${name} | ${result.n} | ${result.medianMs?.toFixed(3) ?? "—"} | ${result.p95Ms?.toFixed(3) ?? "—"} | ${result.invalid} | ${label} |`);
  }
  return lines.join("\n") + "\n";
}
