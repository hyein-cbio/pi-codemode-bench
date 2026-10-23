import { equal, valueHash } from "./values.mjs";

// Shared by live execution and public receipt consistency checks.
export function validateOutcome(item, result) {
  const reasons = [];
  const timingValid = Number.isFinite(result?.ms) && result.ms >= 0;
  const expectedError = item.expectedOutcome === "error";
  const answerCorrect = expectedError
    ? result?.ok === false && !result.transportError && new RegExp(item.errorPattern, "i").test(result.error ?? "")
    : result?.ok === true && equal(result.value, item.expected);
  if (!answerCorrect) reasons.push(expectedError ? "unexpected-error-outcome" : result?.ok ? "wrong-answer" : "execution-error");
  if (result?.transportError) reasons.push("adapter-exception");
  if (!timingValid) reasons.push("invalid-timing");
  if (result?.truncated) reasons.push("truncated");
  if (result?.warnings?.length) reasons.push("runtime-warning");
  let outputHash = null;
  if (result?.ok) {
    try { outputHash = valueHash(result.value); }
    catch { reasons.push("non-json-output"); }
  }
  return { reasons, answerCorrect, ms: timingValid ? result.ms : null, error: result?.error ?? null,
    value: outputHash ? result.value : null, outputHash };
}

export function validateTrace(plan, trace, peak, { minPeak = 0, maxPeak = Infinity } = {}) {
  const reasons = [], seen = new Set();
  if (trace.length !== plan.length) reasons.push("call-count");
  for (const call of trace) {
    const expected = Number.isInteger(call.planIndex) ? plan[call.planIndex] : undefined;
    if (!expected || seen.has(call.planIndex) || !equal(call.args, expected.args) || call.name !== expected.name
      || call.status !== (expected.error ? "error" : "ok")
      || (expected.error ? call.error !== expected.error : call.replyHash !== valueHash(expected.value))) reasons.push("call-status");
    // Recorded order proves starts only. Live dispatch additionally checks completion.
    if (expected?.after?.some(index => !seen.has(index))) reasons.push("dependency-order");
    if (expected) seen.add(call.planIndex);
    if (call.status === "pending") reasons.push("unfinished-calls");
  }
  if (seen.size !== plan.length) reasons.push("missing-calls");
  if (!Number.isInteger(peak) || peak < minPeak || peak > maxPeak) reasons.push("concurrency");
  return [...new Set(reasons)];
}
