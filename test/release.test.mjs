import test from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdtemp, writeFile, rm, mkdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifyBenchmarkSource, verifyExtensionSource } from "../scripts/publish-example.mjs";
import { captureExtensionSource } from "../lib/provenance.mjs";
import { hash } from "../lib/values.mjs";
import { ciSummary } from "../scripts/ci-summary.mjs";

const root = new URL("../", import.meta.url);
const receipt = () => ({ format: 2, complete: true, sourceDrift: false,
  counts: { executions: 24, invalid: 0, unsupported: 0, expectedErrors: 2 } });

test("CI summary exposes only fixed text and validation counts", () => {
  const input = { ...receipt(), secret: "do-not-publish", config: { token: "do-not-publish" },
    rows: [{ error: "do-not-publish", trace: ["do-not-publish"] }] };
  input.counts.extra = "do-not-publish";
  const output = ciSummary(input);
  assert.match(output, /\| executions \| 24 \|/);
  assert.equal(output.includes("do-not-publish"), false);
  for (const mutate of [
    r => r.complete = false, r => r.sourceDrift = true, r => r.format = 1,
    r => r.counts.invalid = 1, r => r.counts.executions = 0,
    r => r.counts.unsupported = "do-not-publish", r => r.counts.expectedErrors = -1,
    r => r.counts.executions = 1.5, r => delete r.counts,
  ]) {
    const bad = receipt(); mutate(bad);
    assert.throws(() => ciSummary(bad), /CI demo receipt/);
  }
});

test("public comparisons require source hashes available at a clean recorded commit", async () => {
  const repository = await mkdtemp(join(tmpdir(), "benchmark-provenance-"));
  const dir = join(repository, "package");
  await mkdir(dir);
  const git = (...args) => execFileSync("git", args, { cwd: dir, encoding: "utf8" }).trim();
  try {
    git("init", "-q", repository);
    await writeFile(join(dir, "bench.mjs"), "// committed source\n");
    git("add", "bench.mjs");
    git("-c", "user.name=Test", "-c", "user.email=test@example.invalid", "-c", "commit.gpgsign=false", "commit", "-qm", "Fixture");
    const input = { git: { head: git("rev-parse", "HEAD"), status: "" },
      implementationHashes: { "bench.mjs": hash("// committed source\n") } };
    assert.doesNotThrow(() => verifyBenchmarkSource(input, dir));
    await writeFile(join(dir, "bench.mjs"), "// dirty exporter source\n");
    assert.throws(() => verifyBenchmarkSource(input, dir), /Export checkout/);
    await writeFile(join(dir, "bench.mjs"), "// committed source\n");
    for (const mutate of [
      r => r.git.status = " M bench.mjs", r => r.git.head = null,
      r => r.implementationHashes["bench.mjs"] = hash("uncommitted source"),
      r => r.implementationHashes["missing.mjs"] = hash("missing"),
      r => r.implementationHashes["../unsafe"] = hash("unsafe"),
      r => r.implementationHashes["package-lock.json"] = null,
      r => r.implementationHashes = {},
    ]) {
      const bad = structuredClone(input); mutate(bad);
      assert.throws(() => verifyBenchmarkSource(bad, dir), /source|identity|revision/);
    }
  } finally { await rm(repository, { recursive: true, force: true }); }
});

test("extension package or lock commits after measurement cannot relabel dependencies", async () => {
  const repository = await mkdtemp(join(tmpdir(), "extension-provenance-"));
  const dir = join(repository, "package");
  await mkdir(dir);
  const entry = join(dir, "index.js");
  const git = (...args) => execFileSync("git", args, { cwd: dir, encoding: "utf8" }).trim();
  const commit = () => {
    git("add", ".");
    git("-c", "user.name=Test", "-c", "user.email=test@example.invalid", "-c", "commit.gpgsign=false", "commit", "-qm", "Fixture");
  };
  try {
    git("init", "-q", repository);
    await writeFile(entry, "// unchanged entry\n");
    await writeFile(join(dir, "package.json"), '{"version":"1.0.0"}\n');
    await writeFile(join(dir, "package-lock.json"), "{}\n");
    commit();
    const measured = await captureExtensionSource(entry);
    await assert.doesNotReject(verifyExtensionSource(entry, measured));
    await assert.rejects(verifyExtensionSource(entry, undefined), /Missing clean measured/);
    await writeFile(join(dir, "package.json"), '{"version":"1.0.1"}\n');
    await assert.rejects(verifyExtensionSource(entry, measured), /changed since measurement/);
    commit();
    await assert.rejects(verifyExtensionSource(entry, measured), /changed since measurement/);
    const updated = await captureExtensionSource(entry);
    await writeFile(join(dir, "package-lock.json"), '{"changed":true}\n');
    commit();
    await assert.rejects(verifyExtensionSource(entry, updated), /changed since measurement/);
  } finally { await rm(repository, { recursive: true, force: true }); }
});

test("release metadata identifies the repository and CI never uploads raw receipts", async () => {
  const pkg = JSON.parse(await readFile(new URL("package.json", root), "utf8"));
  assert.equal(pkg.devDependencies["@earendil-works/pi-coding-agent"], "1.0.4");
  for (const name of ["chord", "pi-agent-core", "pi-ai", "pi-codemode", "pi-mcp", "pi-tui"]) {
    assert.equal(pkg.overrides["@earendil-works/" + name], "1.0.4");
  }
  assert.equal(pkg.repository.url, "git+https://github.com/hyein-cbio/pi-codemode-bench.git");
  assert.equal(pkg.bugs.url, "https://github.com/hyein-cbio/pi-codemode-bench/issues");
  assert.equal(pkg.overrides["brace-expansion"], "5.0.12");
  const workflow = await readFile(new URL(".github/workflows/ci.yml", root), "utf8");
  assert.equal(workflow.includes("actions/upload-artifact"), false);
  assert.match(workflow, /fetch-depth: 0/);
  assert.match(workflow, /ci-summary\.mjs results\/ci-demo\.json >> "\$GITHUB_STEP_SUMMARY"/);
  for (const path of ["SECURITY.md", "CONTRIBUTING.md", "CHANGELOG.md", "docs/RELEASING.md"]) {
    assert.ok((await readFile(new URL(path, root), "utf8")).length > 0);
  }
});
