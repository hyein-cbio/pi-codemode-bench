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
const [version, ...extraArgs] = process.argv.slice(2);
if (extraArgs.length || (version !== undefined && !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version))) {
  throw new Error("Usage: npm run test:pack -- [exact npm version]");
}
const registryArgs = version ? ["--registry=https://registry.npmjs.org/"] : [];
const dir = await mkdtemp(join(tmpdir(), "codemode-pack-"));
const run = (command, args, cwd) => exec(command, args, { cwd, timeout: 180000, maxBuffer: 8 * 1024 * 1024 });
let passed = 0;
try {
  let spec;
  if (version) {
    spec = pkg.name + "@" + version;
  } else {
    const packed = await run("npm", ["pack", "--json", "--pack-destination=" + dir], root);
    spec = join(dir, JSON.parse(packed.stdout)[0].filename);
  }
  const origin = version ? "registry " + spec : "local tarball";
  let installed;
  for (const peers of [false, true]) {
    const app = join(dir, peers ? "with-peers" : "without-peers");
    await mkdir(app);
    await writeFile(join(app, "package.json"), JSON.stringify({ name: "pack-consumer", version: "1.0.0", private: true,
      ...(peers ? { overrides: installed.overrides } : {}) }));
    await run("npm", ["install", "--no-audit", "--no-fund", ...registryArgs, spec,
      ...(peers ? Object.entries(installed.peerDependencies).map(([name, pin]) => name + "@" + pin) : [])], app);
    if (!peers) {
      installed = JSON.parse(await readFile(join(app, "node_modules", pkg.name, "package.json"), "utf8"));
      assert.equal(installed.version, version ?? pkg.version);
      await writeFile(join(app, "consumer.mts"), `
import { runBenchmark } from ${JSON.stringify(pkg.name)};
import type { BenchmarkReceipt, CoverageReport, ToolClient } from ${JSON.stringify(pkg.name)};
const result: BenchmarkReceipt | CoverageReport | undefined = await runBenchmark(["--help"]);
const client: ToolClient | undefined = undefined;
// @ts-expect-error CLI arguments are strings
void runBenchmark([123]);
void [result, client];
`);
      await run("npm", ["exec", "--yes", ...registryArgs, "--package=typescript@5.9.3", "--", "tsc",
        "--strict", "--noEmit", "--module", "NodeNext", "consumer.mts"], app);
      console.log("PASS " + origin + " TypeScript declarations");
      passed++;
    }
    for (const engine of peers ? ["opencode", "pi"] : ["node", "opencode", "pi"]) {
      const args = ["--no-install", "codemode-bench", "--engines=" + engine, "--sets=smoke", "--samples=1", "--warmup=0"];
      if (peers || engine === "node") {
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
      console.log("PASS " + origin + " " + engine + (peers ? " with peers" : " without peers"));
      passed++;
    }
  }
  console.log("Tests: " + passed + " passed, 0 failed");
} finally { await rm(dir, { recursive: true, force: true }); }
