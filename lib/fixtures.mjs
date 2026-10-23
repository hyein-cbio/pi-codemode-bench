import { setTimeout as delay } from "node:timers/promises";
import { equal, valueHash } from "./values.mjs";
import { validateTrace } from "./validation.mjs";

// This is a closed, in-memory fixture service, NOT access to real files or APIs.
// The plan is an authorization allowlist as well as a post-execution oracle.
export function createFixture(plan = []) {
  const trace = [], claimed = new Set(), completed = new Set();
  let active = 0, peak = 0;
  return {
    names: [...new Set(plan.map(call => call.name))],
    trace,
    get peak() { return peak; },
    async call(name, args, signal) {
      const index = plan.findIndex((entry, i) => !claimed.has(i) && entry.name === name && equal(entry.args, args));
      const entry = plan[index];
      const record = { name, args: structuredClone(args), status: "pending", planIndex: index };
      trace.push(record);
      if (!entry || (entry.after ?? []).some(i => !completed.has(i))) {
        record.status = "denied";
        record.error = "Unplanned call or unsatisfied dependency";
        throw new Error(record.error);
      }
      claimed.add(index);
      active++;
      peak = Math.max(peak, active);
      const start = performance.now();
      try {
        signal?.throwIfAborted();
        if (entry.waitMs) await delay(entry.waitMs, undefined, { signal });
        if (entry.error) throw new Error(entry.error);
        record.status = "ok";
        record.replyBytes = Buffer.byteLength(JSON.stringify(entry.value));
        record.replyHash = valueHash(entry.value);
        return structuredClone(entry.value);
      } catch (error) {
        record.status = signal?.aborted ? "cancelled" : "error";
        record.error = error.message;
        throw error;
      } finally {
        record.ms = performance.now() - start;
        active--;
        completed.add(index);
      }
    },
    validate(concurrency) {
      return validateTrace(plan, trace, peak, concurrency);
    },
  };
}
