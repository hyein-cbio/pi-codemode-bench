import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { containsHangul, checkRepository } from "../scripts/check-language.mjs";

test("language gate detects Hangul without requiring ASCII-only fixtures", () => {
  assert.equal(containsHangul("English documentation; Unicode fixture Aé🙂"), false);
  assert.equal(containsHangul(String.fromCodePoint(0xac00)), true);
  assert.equal(containsHangul(String.fromCodePoint(0x1100)), true);
});
test("all tracked and publishable untracked repository content follows the English-only policy", async () => {
  const result = await checkRepository(fileURLToPath(new URL("../", import.meta.url)));
  assert.deepEqual(result.violations, []);
});
