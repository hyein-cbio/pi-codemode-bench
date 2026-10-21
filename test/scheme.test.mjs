import assert from "node:assert/strict";
import test from "node:test";
import { cases } from "../cases.mjs";
import { measure, openCodeMode, openNativePi, receiptFrom, summarize } from "../bench.mjs";

test("summary uses warm samples only", () => {
  assert.deepEqual(summarize([4, 1, 3, 2]), { n: 4, medianMs: 2.5, p95Ms: 4, minMs: 1, maxMs: 4 });
  assert.equal(summarize([]).n, 0);
});

test("case names are unique and both engines agree on one short case", async () => {
  assert.equal(new Set(cases.map((item) => item.name)).size, cases.length);
  const selected = cases.filter((item) => item.name === "even-squares-10");
  const engines = [await openNativePi(), openCodeMode()];
  const rows = await measure(engines, selected, { warmup: 1, samples: 1 });
  const receipt = receiptFrom(rows, engines, selected, { warmup: 1, samples: 1 }, { codemode: engines[0].version, codemode_o: "2.1.0" });
  const row = receipt.cases[0];
  assert.equal(row.codemode.valid, 1);
  assert.equal(row.codemode_o.valid, 1);
  assert.equal(row.codemode.invalid, 0);
  assert.equal(row.codemode.n, 1);
  assert.equal(receipt.protocol.summary.includes("warm"), true);
});
