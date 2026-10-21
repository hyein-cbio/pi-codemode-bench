import { readFile, mkdir, writeFile } from "node:fs/promises";
import { arch, cpus, loadavg, platform, release, totalmem } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { CodeMode } from "@opencode/codemode";
import { Effect } from "effect";
import { cases as allCases } from "./cases.mjs";

const root = dirname(fileURLToPath(import.meta.url));

export function summarize(values) {
  if (!values.length) return { n: 0, medianMs: null, p95Ms: null, minMs: null, maxMs: null };
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const medianMs = n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
  return { n, medianMs, p95Ms: sorted[Math.ceil(n * 0.95) - 1], minMs: sorted[0], maxMs: sorted[n - 1] };
}

function readConfig(argv) {
  const config = { warmup: 4, samples: 20, cases: null };
  for (const arg of argv) {
    const count = /^--(warmup|samples)=(\d+)$/.exec(arg);
    const selected = /^--cases=(.+)$/.exec(arg);
    if (count) config[count[1]] = Number(count[2]);
    else if (selected) config.cases = selected[1].split(",").filter(Boolean);
    else throw new Error("Use --warmup=N --samples=N --cases=name,name");
  }
  if ([config.warmup, config.samples].some((n) => !Number.isSafeInteger(n) || n < 1 || n > 10000)) {
    throw new Error("Invalid sample count");
  }
  const selected = config.cases ? allCases.filter((item) => config.cases.includes(item.name)) : allCases;
  if (config.cases && selected.length !== config.cases.length) throw new Error("Unknown case name");
  return { ...config, selected };
}

export function openCodeMode() {
  const runtime = CodeMode.make();
  return {
    name: "codemode_o",
    async execute(code) {
      const started = performance.now();
      const result = await Effect.runPromise(runtime.execute(code));
      return { ok: result.ok === true, value: result.ok ? result.value : undefined, ms: performance.now() - started };
    },
  };
}

export async function openNativePi() {
  const packageJson = JSON.parse(await readFile(join(root, "node_modules/@earendil-works/pi-coding-agent/package.json"), "utf8"));
  const executeUrl = pathToFileURL(join(root, "node_modules/@earendil-works/pi-coding-agent/dist/extensions/codemode/execute.js"));
  const { executeCodemode } = await import(executeUrl);
  return {
    name: "codemode",
    version: packageJson.version,
    async execute(code) {
      const started = performance.now();
      const result = await executeCodemode("bench", { code }, undefined, undefined, undefined);
      const text = result.content?.findLast?.((block) => block.type === "text")?.text?.trim();
      let value;
      if (result.isError !== true && text !== undefined) {
        try { value = JSON.parse(text); } catch { value = text; }
      }
      return { ok: result.isError !== true && value !== undefined, value, ms: performance.now() - started };
    },
  };
}

export async function measure(engines, selected, config) {
  const rows = [];
  for (const item of selected) {
    for (const engine of engines) {
      const cold = await engine.execute(item.code);
      rows.push({ case: item.name, engine: engine.name, phase: "cold", valid: cold.ok && cold.value === item.expected, ms: cold.ms, value: cold.value ?? null });
    }
    for (let index = 0; index < config.warmup + config.samples; index++) {
      const phase = index < config.warmup ? "warmup" : "warm";
      const order = engines.map((_, offset) => engines[(index + offset) % engines.length]);
      for (const engine of order) {
        const result = await engine.execute(item.code);
        if (phase === "warm") {
          rows.push({
            case: item.name,
            engine: engine.name,
            phase,
            valid: result.ok && result.value === item.expected,
            ms: result.ms,
            value: result.value ?? null,
          });
        }
      }
    }
  }
  return rows;
}

export function receiptFrom(rows, engines, selected, config, versions) {
  const summary = selected.map((item) => {
    const row = { name: item.name, kind: item.kind, expected: item.expected };
    for (const engine of engines) {
      const warm = rows.filter((sample) => sample.case === item.name && sample.engine === engine.name && sample.phase === "warm");
      const valid = warm.filter((sample) => sample.valid);
      const cold = rows.find((sample) => sample.case === item.name && sample.engine === engine.name && sample.phase === "cold");
      row[engine.name] = {
        ...summarize(valid.map((sample) => sample.ms)),
        valid: valid.length,
        invalid: warm.length - valid.length,
        coldMs: cold?.ms ?? null,
        coldValid: cold?.valid === true,
      };
    }
    return row;
  });
  return {
    format: 1,
    createdAt: new Date().toISOString(),
    scope: "One-process execute timing of pinned Pi QuickJS codemode and OpenCode codemode_o. No model, network, tool call, or AgentSession.",
    protocol: {
      warmup: config.warmup,
      samples: config.samples,
      cold: 1,
      clock: "performance.now around one execute",
      order: "each warm index runs every engine; the starting engine rotates by index",
      summary: "median and nearest-rank p95 use valid warm samples only. The cold sample is reported separately.",
      notComparable: "Pi starts a fresh QuickJS sandbox per call. OpenCode reuses one runtime and includes parse plus tree-walk. Do not divide these medians or treat agreement as language parity or pure VM speed.",
    },
    versions,
    cases: summary,
  };
}

async function main() {
  const config = readConfig(process.argv.slice(2));
  const codemodePackage = JSON.parse(await readFile(join(root, "node_modules/@opencode/codemode/package.json"), "utf8"));
  const engines = [await openNativePi(), openCodeMode()];
  const loadBefore = loadavg();
  const rows = await measure(engines, config.selected, config);
  const receipt = receiptFrom(rows, engines, config.selected, config, {
    codemode: engines[0].version,
    codemode_o: codemodePackage.version,
  });
  receipt.host = {
    platform: platform(),
    arch: arch(),
    osRelease: release(),
    node: process.version,
    cpu: cpus()[0]?.model ?? null,
    logicalCpus: cpus().length,
    ramBytes: totalmem(),
    loadAverageBefore: loadBefore,
    loadAverageAfter: loadavg(),
  };
  const invalid = rows.filter((row) => row.phase === "warm" && !row.valid).length;
  await mkdir(join(root, "results"), { recursive: true });
  await writeFile(join(root, "results/latest.json"), JSON.stringify(receipt, null, 2));
  for (const item of receipt.cases) {
    const pi = item.codemode;
    const open = item.codemode_o;
    console.log(`${item.name} expected ${item.expected} codemode median/p95 ${pi.medianMs?.toFixed?.(3) ?? "n/a"}/${pi.p95Ms?.toFixed?.(3) ?? "n/a"} codemode_o ${open.medianMs?.toFixed?.(3) ?? "n/a"}/${open.p95Ms?.toFixed?.(3) ?? "n/a"} invalid ${pi.invalid + open.invalid}`);
  }
  if (invalid) process.exitCode = 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main();
