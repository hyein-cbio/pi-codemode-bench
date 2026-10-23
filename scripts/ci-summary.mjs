import { readFile } from "node:fs/promises";
import { isMain } from "../lib/main.mjs";

// Only fixed labels and validated integers may leave a raw CI receipt.
export function ciSummary(receipt) {
  if (receipt.format !== 2 || receipt.complete !== true || receipt.sourceDrift !== false) {
    throw new Error("CI demo receipt is incomplete or drifted");
  }
  const keys = ["executions", "invalid", "unsupported", "expectedErrors"];
  const counts = keys.map(key => receipt.counts?.[key]);
  if (!counts.every(value => Number.isSafeInteger(value) && value >= 0) || counts[0] === 0 || counts[1] !== 0) {
    throw new Error("CI demo receipt has invalid validation counts");
  }
  return ["## Benchmark demo validation", "", "| Check | Count |", "|---|---:|",
    ...keys.map((key, index) => `| ${key} | ${counts[index]} |`), "",
    "Dependency-free adapter conformance only; not an external product performance result.",
    "Raw receipts, paths, configuration, return values and traces are not uploaded.", ""].join("\n");
}

if (isMain(import.meta.url)) {
  try {
    if (process.argv.length !== 3) throw new Error("Usage: node scripts/ci-summary.mjs <local-receipt.json>");
    console.log(ciSummary(JSON.parse(await readFile(process.argv[2], "utf8"))));
  } catch {
    // Do not echo parser errors or untrusted receipt fields into public CI logs.
    console.error("Cannot generate CI summary: expected a completed, non-drifted demo receipt with valid counts.");
    process.exitCode = 1;
  }
}
