import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, rm, writeFile, mkdir, chmod, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const exec = promisify(execFile);
const root = fileURLToPath(new URL("../", import.meta.url));

test("the real npm tarball executes the full demo without dependencies or a lockfile", { timeout: 60000 }, async () => {
  const dir = await mkdtemp(join(tmpdir(), "codemode-package-"));
  try {
    const packed = await exec("npm", ["pack", "--json", "--ignore-scripts", "--pack-destination=" + dir], { cwd: root, timeout: 30000 });
    const [pkg] = JSON.parse(packed.stdout);
    const paths = pkg.files.map(f => f.path);
    assert.ok(paths.includes("benchmarks/results/pi-comparison.json"));
    assert.ok(paths.includes("benchmarks/results/pi-comparison.release.json"));
    assert.ok(paths.includes("scripts/publish-example.mjs"));
    for (const file of ["SECURITY.md", "CONTRIBUTING.md", "CHANGELOG.md", "docs/RELEASING.md"]) assert.ok(paths.includes(file));
    assert.equal(paths.some(p => /^(results|test|node_modules|\.github)\//.test(p)), false);
    assert.equal(paths.includes("AGENTS.md"), false);
    assert.equal(paths.includes("package-lock.json"), false);
    await exec("tar", ["-xzf", join(dir, pkg.filename), "-C", dir]);
    const cwd = join(dir, "package"), out = join(dir, "receipt.json");
    await exec(process.execPath, ["bench.mjs", "--config=bench.config.example.json", "--sets=all",
      "--warmup=0", "--samples=1", "--out=" + out], { cwd, timeout: 25000 });
    const receipt = JSON.parse(await readFile(out, "utf8"));
    assert.equal(receipt.complete, true);
    assert.equal(receipt.sourceDrift, false);
    assert.equal(receipt.cases.length, 76);
    assert.equal(receipt.counts.executions, 152);
    assert.equal(receipt.counts.invalid, 0);
    assert.equal(receipt.counts.unsupported, 0);
    assert.equal(receipt.implementationHashes["package-lock.json"], null);
    assert.match(receipt.implementationHashes["lib/validation.mjs"], /^[a-f0-9]{64}$/);
    const listing = await exec(process.execPath, ["tasks.mjs", "--list"], { cwd });
    assert.equal(JSON.parse(listing.stdout).tasks.length, 8);
    // Consume the actual package from an unrelated Git project, through npm's
    // installed bin and public API, with the installation itself read-only.
    const app = join(dir, "consumer"); await mkdir(app);
    await writeFile(join(app, "package.json"), JSON.stringify({name:"consumer",version:"1.0.0",private:true,type:"module"}));
    await writeFile(join(app, ".gitignore"), "node_modules/\\nresults/\\n");
    await exec("git", ["init","-q","-b","main"], {cwd:app});
    await exec("git", ["-c","user.name=Test","-c","user.email=test@example.invalid","-c","commit.gpgsign=false","commit","--allow-empty","-qm","Consumer commit"], {cwd:app});
    const consumerHead = (await exec("git", ["rev-parse","HEAD"], {cwd:app})).stdout.trim();
    await exec("npm", ["install","--offline","--ignore-scripts","--omit=dev","--no-audit","--no-fund","--package-lock=false",join(dir,pkg.filename)], {cwd:app});
    const installed = join(app,"node_modules","pi-codemode-bench");
    await writeFile(join(app,"api.mjs"), 'import {runBenchmark,buildCases} from "pi-codemode-bench"; if(buildCases().length!==76)throw new Error("corpus"); const r=await runBenchmark(["--config="+process.argv[2],"--sets=smoke","--warmup=0","--samples=1","--out="+process.argv[3]],{log:()=>{}});if(r.counts.invalid||process.exitCode)throw new Error("API side effect");');
    await chmod(installed, 0o555);
    try {
      await exec(join(app,"node_modules",".bin","codemode-bench"), ["--config="+join(installed,"bench.config.example.json"),
        "--sets=smoke","--warmup=0","--samples=1"], {cwd:app});
      const latest = JSON.parse(await readFile(join(app,"results","latest.json"),"utf8"));
      assert.deepEqual(latest.git,{head:null,status:null});
      assert.notEqual(latest.git.head,consumerHead);
      assert.equal(latest.counts.invalid,0);
      await assert.rejects(access(join(installed,"results")));
      await exec(process.execPath,["api.mjs",join(installed,"bench.config.example.json"),join(app,"api-result.json")],{cwd:app});
      const api = JSON.parse(await readFile(join(app,"api-result.json"),"utf8"));
      assert.equal(api.counts.executions,2);
      const declaration = await readFile(join(installed,"index.d.ts"),"utf8");
      assert.match(declaration,/interface ToolClient/);
      // External adapters can import the package inside a worker without
      // recursively starting the CLI, and source files resolve from config.
      await writeFile(join(app,"external.mjs"), 'import {createFixture} from "pi-codemode-bench";export function createToolClient(){if(createFixture().names.length)throw new Error("fixture");return {callTool:async(name,input)=>({ok:true,value:input.code.endsWith("custom program")?220:0})}}');
      await writeFile(join(app,"sources.mjs"), 'export function createSources(){return {language:"external",comment:{prefix:"#"},sources:{"even-squares-10":"custom program"}}}');
      await writeFile(join(app,"targets.json"),JSON.stringify({version:1,sources:["./sources.mjs"],targets:[{kind:"tool",tool:"external",adapter:"./external.mjs",language:"external"}]}));
      await exec(join(app,"node_modules",".bin","codemode-bench"),["--config=targets.json","--sets=smoke","--source-mode=fresh","--warmup=0","--samples=1","--out=external-result.json"],{cwd:app});
      assert.equal(JSON.parse(await readFile(join(app,"external-result.json"),"utf8")).counts.invalid,0);
    } finally { await chmod(installed,0o755); }
    // An absent lock is allowed, but its appearance must still invalidate timing.
    const client = join(dir, "lock-client.mjs"), config = join(dir, "lock-config.json"), driftOut = join(dir, "drift.json");
    await writeFile(client, 'import {writeFile} from "node:fs/promises"; export function createToolClient(){return {async callTool(){await writeFile("package-lock.json","{}");return {ok:true,value:220}}}}');
    await writeFile(config, JSON.stringify({version:1,targets:[{kind:"tool",tool:"run",adapter:client}]}));
    await assert.rejects(exec(process.execPath, ["bench.mjs", "--config=" + config, "--sets=smoke",
      "--warmup=0", "--samples=1", "--out=" + driftOut], {cwd}));
    const drift = JSON.parse(await readFile(driftOut, "utf8"));
    assert.equal(drift.sourceDrift, true);
    assert.equal(drift.cases[0].engines.run.eligibleForTiming, false);
    await rm(join(cwd, "adapters", "pi-tool.mjs"));
    await assert.rejects(exec(process.execPath, ["bench.mjs", "--config=bench.config.example.json", "--sets=smoke",
      "--warmup=0", "--samples=1", "--out=" + join(dir, "missing.json")], {cwd}), /ENOENT.*pi-tool\.mjs/s);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
