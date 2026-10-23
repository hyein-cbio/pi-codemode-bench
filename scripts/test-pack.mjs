import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const exec = promisify(execFile);
const root = fileURLToPath(new URL("../", import.meta.url));
const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const dir = await mkdtemp(join(tmpdir(), "codemode-pack-"));
const run = (command, args, cwd) => exec(command, args, { cwd, timeout: 180000, maxBuffer: 8 * 1024 * 1024 });
let passed = 0;
try {
  const packed = await run("npm", ["pack", "--json", "--pack-destination=" + dir], root);
  const tarball = join(dir, JSON.parse(packed.stdout)[0].filename);
  for (const peers of [true, false]) {
    const app = join(dir, peers ? "with-peers" : "without-peers");
    await mkdir(app);
    await writeFile(join(app, "package.json"), JSON.stringify({ name: "pack-consumer", version: "1.0.0", private: true,
      ...(peers ? { overrides: pkg.overrides } : {}) }));
    await run("npm", ["install", "--no-audit", "--no-fund", tarball,
      ...(peers ? Object.entries(pkg.peerDependencies).map(([name, version]) => name + "@" + version) : [])], app);
    for (const engine of peers ? ["opencode", "pi", "node"] : ["opencode", "pi"]) {
      const args = ["--no-install", "codemode-bench", "--engines=" + engine, "--sets=smoke", "--samples=1", "--warmup=0"];
      if (peers) {
        await run("npx", args, app);
        const receipt = JSON.parse(await readFile(join(app, "results", "latest.json"), "utf8"));
        assert.ok(receipt.counts.executions > 0);
        assert.equal(receipt.counts.invalid, 0);
      } else {
        await assert.rejects(run("npx", args, app), error => {
          assert.equal(error.code, 1);
          const deps = engine === "pi" ? "@earendil-works/pi-coding-agent" : "@opencode/codemode effect";
          assert.equal(error.stderr.trim(), "Engine '" + engine + "' needs: npm i " + deps);
          return true;
        });
      }
      console.log("PASS packed " + engine + (peers ? " with peers" : " missing peers"));
      passed++;
    }
  }
  console.log("Tests: " + passed + " passed, 0 failed");
} finally { await rm(dir, { recursive: true, force: true }); }
