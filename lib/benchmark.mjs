import { readFile, mkdir, writeFile, appendFile } from "node:fs/promises";
import { arch, cpus, loadavg, platform, release, totalmem } from "node:os";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { buildCases, selectCases } from "../corpus/index.mjs";
import { readConfig, help } from "./config.mjs";
import { hash, equal } from "./values.mjs";
import { Engine } from "./engine.mjs";
import { loadTargets } from "./targets.mjs";
import { loadSources } from "./sources.mjs";
import { captureExtensionSource } from "./provenance.mjs";
import { eligibility, sourceFor, runCases, summarizeRows, markdownReport } from "./runner.mjs";

const root = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));

function git(...args) {
  try { return execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); }
  catch { return null; }
}
function benchmarkGit() {
  // A dependency installed under another repository must not inherit its HEAD.
  if (git("ls-files", "--error-unmatch", "--", "bench.mjs", "package.json") === null) return { head: null, status: null };
  return { head: git("rev-parse", "HEAD"), status: git("status", "--short", "--", ".") };
}
async function implementationHashes(adapters) {
  const paths = ["bench.mjs", "index.mjs", "lib/benchmark.mjs", "lib/sources.mjs", "lib/jsonl-client.mjs", "cases.mjs", "package.json", "package-lock.json",
    "corpus/index.mjs", "corpus/helpers.mjs", "corpus/short.mjs", "corpus/workflow.mjs", "corpus/scale.mjs",
    "lib/main.mjs", "lib/config.mjs", "lib/provenance.mjs", "lib/targets.mjs", "lib/engine.mjs", "lib/worker.mjs", "lib/fixtures.mjs", "lib/runner.mjs", "lib/values.mjs", "lib/validation.mjs", "adapters/builtin.mjs", "adapters/pi-tool.mjs", "adapters/tool.mjs", "adapters/node-vm.mjs"];
  return Object.fromEntries(await Promise.all([...paths.map(p => resolve(root, p)), ...adapters].map(async path =>
    [path.startsWith(root + "/") ? path.slice(root.length + 1) : path, await readFile(path).then(hash).catch(error => {
      // npm never includes package-lock.json. Preserve its absence explicitly;
      // missing executable sources must still fail, and lock appearance is drift.
      if (path === resolve(root, "package-lock.json") && error.code === "ENOENT") return null;
      throw error;
    })])));
}
export async function runBenchmark(argv = [], { log = console.log, signal } = {}) {
  signal?.throwIfAborted();
  const config = readConfig(argv);
  if (config.help) { log(help); return; }
  const targetConfig = await loadTargets(config);
  if (config["list-targets"]) { log(JSON.stringify(targetConfig, null, 2)); return; }
  const sourceConfig = await loadSources(targetConfig.sourcePaths, buildCases(config), config.seed);
  const selected = selectCases(sourceConfig.cases, config);
  if (config.list) {
    for (const item of selected) log(`${item.name}\t${item.suite}\ttier=${item.tier ?? "orthogonal"}\tcalls=${item.plan.length}\t${item.tags.join(",")}`);
    log(`${selected.length} cases`); return;
  }
  if (config.export) {
    const path = resolve(config.export);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify({ format: 1, seed: config.seed, cases: selected }, null, 2), { flag: "wx" });
    log(path); return;
  }
  if (!targetConfig.specs.length) throw new Error("No benchmark targets selected. Use --config=your-config.json, --engines=..., or --adapter=...; no tool is selected automatically.");
  const adapters = targetConfig.specs.filter(s => s.module).map(s => s.module);
  const engines = targetConfig.specs.map(spec => new Engine(spec));
  const output = resolve(config.out ?? join(process.cwd(), "results", "run-" + new Date().toISOString().replaceAll(":", "-") + ".json"));
  const journal = output + ".samples.jsonl", report = output + ".md";
  try {
    signal?.throwIfAborted();
    for (const engine of engines) {
      await engine.start();
      signal?.throwIfAborted();
      if (sourceConfig.comments[engine.metadata.language]) engine.metadata.sourceComment = sourceConfig.comments[engine.metadata.language];
    }
    const names = engines.map(e => e.metadata.name);
    if (new Set(names).size !== names.length) throw new Error("Adapter names must be unique");
    const coverage = engines.map(engine => ({ id: engine.metadata.name, language: engine.metadata.language,
      eligible: selected.filter(item => !eligibility(item, engine.metadata)).length,
      unsupported: selected.filter(item => eligibility(item, engine.metadata)).map(item => ({ case: item.name, reason: eligibility(item, engine.metadata) })) }));
    if (config.sourceMode === "fresh") for (const engine of engines) for (const item of selected) {
      if (!eligibility(item, engine.metadata)) sourceFor(item, engine.metadata, "fresh", 0);
    }
    if (config.check) {
      const report = { mode: "check", ok: coverage.some(t => t.eligible > 0) &&
        (!config["strict-coverage"] || coverage.every(t => !t.unsupported.length)), targets: coverage };
      log(JSON.stringify(report, null, 2)); return report;
    }
    await mkdir(dirname(output), { recursive: true });
    // Reserve all artifacts before timing; interrupted campaigns remain visibly incomplete.
    await writeFile(output, JSON.stringify({ format: 2, complete: false, journal }), { flag: "wx" });
    await writeFile(journal, "", { flag: "wx" });
    await writeFile(report, "# Run incomplete\n", { flag: "wx" });
    const extensionSources = async () => Object.fromEntries(await Promise.all(engines.map(async engine =>
      [engine.metadata.name, Object.fromEntries(await Promise.all(Object.keys(engine.metadata.extensionHashes).map(async entry =>
        [entry, await captureExtensionSource(entry)])))])));
    const extensionSourcesBefore = await extensionSources();
    for (const engine of engines) engine.metadata.extensionSources = extensionSourcesBefore[engine.metadata.name];
    const measuredFiles = [...adapters, ...sourceConfig.files.map(f => f.file), ...(targetConfig.file ? [targetConfig.file] : []),
      ...engines.flatMap(engine => Object.entries(engine.metadata.extensionSources).flatMap(([entry, source]) =>
        [entry, ...(source.packageSha256 ? [join(dirname(entry), "package.json")] : []),
          ...(source.lockSha256 ? [join(dirname(entry), "package-lock.json")] : [])]))];
    const hashesBefore = await implementationHashes(measuredFiles);
    if (!equal(extensionSourcesBefore, await extensionSources())) throw new Error("Extension metadata changed during initialization");
    for (const plugin of sourceConfig.files) if (hash(await readFile(plugin.file)) !== plugin.sha256) throw new Error("Source plugin changed during initialization");
    if (targetConfig.file && hash(await readFile(targetConfig.file)) !== targetConfig.sha256) throw new Error("Target config changed during initialization");
    for (const engine of engines) for (const [path, expected] of Object.entries(engine.metadata.extensionHashes)) {
      if (hash(await readFile(path)) !== expected) throw new Error("Extension changed during initialization: " + path);
    }
    const pkg = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
    const metadata = {
      benchmark: { name: pkg.name, version: pkg.version },
      createdAt: new Date().toISOString(), git: benchmarkGit(),
      host: { platform: platform(), arch: arch(), osRelease: release(), node: process.version,
        cpu: cpus()[0]?.model ?? null, logicalCpus: cpus().length, ramBytes: totalmem(), loadAverageBefore: loadavg() },
      engines: engines.map(e => e.metadata), targetConfig, sourceConfig: { files: sourceConfig.files, comments: sourceConfig.comments }, implementationHashes: hashesBefore,
    };
    const rows = await runCases(engines, selected, config, async row => {
      await appendFile(journal, JSON.stringify(row) + "\n");
      if (row.status === "invalid") console.error(`${row.case} / ${row.engine} / ${row.phase}: ${row.reasons.join(", ")}`);
    }, { signal });
    const hashesAfter = await implementationHashes(measuredFiles);
    const drift = !equal(hashesBefore, hashesAfter) || !equal(extensionSourcesBefore, await extensionSources());
    const receipt = {
      format: 2, complete: true, ...metadata, config, sourceDrift: drift,
      scope: "Controlled source replay against synthetic fixtures. See engines[] for target kind, clock and lifecycle. Pi AgentSessions use scripted assistant turns; model, network, credentials and other external effects of trusted adapters/extensions are not inferred.",
      protocol: {
        clock: "See engines[].clock: tool clients time awaited callTool; direct runtimes time setup+execute; pi-tool targets time root tool execution events. Initialization and fixture/oracle construction are excluded.",
        cold: "first invocation per case in a reused engine worker; NOT process-cold; imports excluded",
        order: "serial engine execution; starting engine rotates by case, sample and seed",
        summary: "median and nearest-rank p95 of valid warm success samples only; warmup/cold failures invalidate timing eligibility",
        notComparable: "Different lifecycle and security contracts. No pooled score or automatic speedup. Small-n p95 is descriptive, often the maximum.",
        fixturePolicy: "Fresh allowlisted in-memory fixture service per invocation; full args/status/dependency/peak validation; synthetic waits explicitly tagged",
      },
      cases: summarizeRows(rows, selected, engines), rows,
      counts: { executions: rows.filter(r => r.phase !== "eligibility").length,
        invalid: rows.filter(r => r.status === "invalid").length, unsupported: rows.filter(r => r.status === "unsupported").length,
        expectedErrors: rows.filter(r => r.status === "expected-error").length },
    };
    receipt.host.loadAverageAfter = loadavg();
    if (drift) for (const item of receipt.cases) for (const result of Object.values(item.engines)) result.eligibleForTiming = false;
    await writeFile(output, JSON.stringify(receipt, null, 2));
    await writeFile(report, markdownReport(receipt));
    if (!config.out) await writeFile(join(dirname(output), "latest.json"), JSON.stringify(receipt, null, 2));
    if (!receipt.counts.executions) log("No eligible cases. Add source variants with --sources or inspect --check.");
    log(`${selected.length} cases; ${receipt.counts.executions} executions; ${receipt.counts.invalid} invalid; ${receipt.counts.unsupported} unsupported`);
    log(`Receipt: ${output}\nReport: ${report}\nSamples: ${journal}`);
    return receipt;
  } finally {
    const closed = await Promise.allSettled(engines.map(engine => engine.close()));
    const errors = closed.filter(r => r.status === "rejected").map(r => r.reason);
    if (errors.length) throw new AggregateError(errors, "Adapter cleanup failed: " + errors.map(error => error.message).join("; "));
  }
}
