import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { packageRoot } from "../lib/packages.mjs";

test("package roots resolve entries even when package.json is not exported", () => {
  for (const name of ["effect", "@opencode/codemode", "@earendil-works/pi-coding-agent"]) {
    assert.equal(JSON.parse(readFileSync(join(packageRoot(name, "test"), "package.json"), "utf8")).name, name);
  }
});

test("missing packages report the complete engine install command", () => {
  for (const name of ["missing-benchmark-peer", "@missing-benchmark/peer"]) {
    assert.throws(() => packageRoot(name, "opencode", ["@opencode/codemode", "effect"]), {
      code: "MISSING_ENGINE_DEPENDENCY", message: "Engine 'opencode' needs: npm i @opencode/codemode effect",
    });
  }
});
