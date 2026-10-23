import { createHash } from "node:crypto";

export function canonical(value) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number" && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) {
    const items = [];
    for (let i = 0; i < value.length; i++) {
      if (!Object.hasOwn(value, i)) throw new TypeError("Sparse arrays are not JSON data");
      items.push(canonical(value[i]));
    }
    return "[" + items.join(",") + "]";
  }
  if (value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    return "{" + Object.keys(value).sort().map(key => JSON.stringify(key) + ":" + canonical(value[key])).join(",") + "}";
  }
  throw new TypeError("Benchmark values must be finite JSON data");
}
export const hash = value => createHash("sha256").update(value).digest("hex");
export const valueHash = value => hash(canonical(value));
export function equal(a, b) {
  try { return canonical(a) === canonical(b); } catch { return false; }
}
export function summarize(values) {
  if (!values.length) return { n: 0, medianMs: null, p95Ms: null, minMs: null, maxMs: null };
  const sorted = [...values].sort((a, b) => a - b), n = sorted.length;
  return { n, medianMs: n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2,
    p95Ms: sorted[Math.ceil(n * .95) - 1], minMs: sorted[0], maxMs: sorted[n - 1] };
}
