# pi-codemode-bench

An **implementation-neutral benchmark for the latency and correctness of codemode-compatible tools**. No tool name, host, or language runtime is mandatory. Pi's `codemode` and `codemode_o` are optional targets, not defaults.

The shared corpus contains **76 cases across 10 suites**, independent output and tool-call checks, and cold/warmup/warm reports. [Project provenance](docs/PROVENANCE.md)

## Architecture

```text
Shared corpus / fixtures / oracles
                 |
       Explicit target configuration
                 |
        Host-specific client adapter
                 |
        Actual code-execution tool
```

No execution target is selected automatically. A missing or failed tool never silently falls back to another runtime.

## Installation

Requires **Node 22.19 or later**. Choose a source checkout or a locally built npm tarball. The package is still `private: true` and is **not published to npm**; do not assume `npm install pi-codemode-bench` is available.

### Option A: run from source

```sh
git clone https://github.com/hyein-cbio/pi-codemode-bench.git
cd pi-codemode-bench
npm run bench:list
npm run bench:demo
npm run test:core
```

These commands need no Pi/OpenCode dependencies. The demo calls a local `run_script` tool to check the adapter contract; it is **not an external product performance result**.

Only if you want the optional Pi/OpenCode comparisons and full integration tests:

```sh
npm ci
npm test
```

Pi SDK, OpenCode CodeMode, and Effect are pinned development dependencies. `pi-opencode-mode` and other target interpreters are **not** installed automatically.

### Option B: install into another project

From the source checkout, build a tarball without publishing:

```sh
mkdir -p results/dist
npm pack --ignore-scripts --pack-destination=results/dist
```

Then, from your consumer project, install that file using its absolute path:

```sh
npm install --ignore-scripts /absolute/path/to/pi-codemode-bench/results/dist/pi-codemode-bench-0.1.0.tgz
npx --no-install codemode-bench --help
```

Replace the path with the tarball you built. The installed command is **`codemode-bench`**. It writes default output to **your project's `cwd/results/`**, never inside `node_modules`. Installed packages include examples and public types, but not the development test suite.

## Connect a tool: a working consumer-project example

The following opt-in example connects a local Python tool through JSONL. It needs `python3` on PATH, but no Pi/OpenCode installation. It demonstrates **three cases**, not full Python language parity. The same target/client contract can connect your existing host instead.

Run these steps in the consumer project from Option B.

### 1. Copy the example backend

```sh
cp node_modules/pi-codemode-bench/examples/python-jsonl-server.py ./backend.py
```

This is a trusted-code demonstration, **not a sandbox**. Its tool name is `run_python`.

### 2. Create the connection adapter

Save as `my-tool-client.mjs`:

```js
import { createJsonlClient } from "pi-codemode-bench";
import { fileURLToPath } from "node:url";

const backend = fileURLToPath(new URL("./backend.py", import.meta.url));

export async function createToolClient({ options }) {
  const client = await createJsonlClient({
    command: options.command ?? "python3",
    args: ["-I", "-u", backend],
  });
  client.implementationFiles = [backend];
  return client;
}
```

For a different host, replace this adapter with its actual connection. Return `callTool(name, input, {fixture, timeoutMs, signal})`, a normalized `{ok, value?, error?}` result, and `dispose()` for owned resources. Bind nested fixture requests to `fixture.call`; do not substitute real filesystem tools or compute answers in the host. Preserve warnings/truncation and distinguish guest errors from transport/decoding failures.

`createJsonlClient` is an optional ready-made transport, not a requirement for MCP, RPC or in-process clients. [Complete client and lifecycle contract](docs/TARGETS.md)

### 3. Register language sources

Save as `my-sources.mjs`:

```js
export function createSources() {
  return {
    language: "python",
    comment: { prefix: "#" },
    sources: {
      "even-squares-10": "return sum(n*n for n in range(1, 11) if n % 2 == 0)",
      "read-reduce":
        'raw = await tools.read({"path": "numbers.txt"})\n' +
        "return sum(int(n) for n in raw.split())",
      "parallel-context":
        'texts = await asyncio.gather(tools.read({"path": "src/api.ts"}), tools.read({"path": "src/user.ts"}))\n' +
        'return [sum("TODO" in line for line in text.splitlines()) for text in texts]',
    },
  };
}
```

Source plugins add programs without changing the installed corpus, fixture plans or independent oracles. Add variants incrementally for your own language and backend return convention. `comment` supplies fresh-source nonce syntax; block-comment languages can also specify `suffix`.

### 4. Configure the target

Save as `targets.json`:

```json
{
  "version": 1,
  "sources": ["./my-sources.mjs"],
  "targets": [
    {
      "id": "my-python",
      "kind": "tool",
      "tool": "run_python",
      "adapter": "./my-tool-client.mjs",
      "language": "python",
      "capabilities": ["tools"]
    }
  ]
}
```

`tool` is the exact name forwarded to your adapter; `id` is the result/selection label. Config paths resolve against the config file, not cwd. Nothing is auto-discovered, installed or silently replaced with a fallback. Declare only capabilities your target supports.

For an existing direct runtime adapter, use `{id:"my-runtime",kind:"runtime",adapter:"./runtime.mjs",options:{}}`; that module exports `createAdapter({options})` rather than `createToolClient`.

### 5. Check coverage, then benchmark

```sh
npx --no-install codemode-bench --config=targets.json --sets=all --check
npx --no-install codemode-bench --config=targets.json \
  --cases=even-squares-10,read-reduce,parallel-context \
  --source-mode=fresh --warmup=1 --samples=3
```

The check should show **3 eligible / 73 unsupported cases**. The benchmark command selects those three supported cases. Missing translations are reported as unsupported, not replaced by JavaScript or counted as speed wins. `--check` initializes trusted clients but executes no guest programs; zero eligible executions fail, and `--strict-coverage` also fails partial coverage.

From a source checkout, `node bench.mjs` accepts the same flags as the installed CLI. For the shipped **six-case** Python example, including guest errors and deadlines, use `--config=examples/targets/python.json`. [Integration guide and JSONL protocol](docs/EXTENDING.md)

## Use the typed ESM API

From your consumer project, save as `run-benchmark.mjs` and run `node run-benchmark.mjs`:

```js
import { runBenchmark } from "pi-codemode-bench";

const result = await runBenchmark([
  "--config=./targets.json",
  "--cases=even-squares-10,read-reduce,parallel-context",
  "--warmup=1",
  "--samples=3",
]);

if (result && "counts" in result) {
  console.log(result.counts);
  if (result.counts.invalid || result.sourceDrift) process.exitCode = 1;
}
```

The API returns a receipt without setting your process exit code. Pass `{signal, log}` as its second argument for cancellation or custom logging; `--check` returns a coverage report, while help/list/export return `undefined`. Public types include `ToolClient`, `RuntimeAdapter`, `SourceFactory` and `BenchmarkConfig`.

## Optional implementation bindings

These examples run from a **source checkout**, with `npm ci` completed for Pi/OpenCode targets. Adjust external extension paths before use; installing this benchmark does not install `pi-opencode-mode`.

- Registered Pi tool: `examples/targets/pi.json`
- Local `pi-opencode-mode` extension: `examples/targets/pi-opencode.json`
- Both registered Pi tools: `examples/targets/pi-comparison.json`
- Direct runtime controls: `--engines=pi,opencode,node`
- Another language/runtime: external source plugins plus `kind:"tool"` or `kind:"runtime", adapter:"./module.mjs"`
- Working Python JSONL tool bridge: `examples/targets/python.json` (6 conformance cases)

```sh
# Only when you choose the Pi binding
node bench.mjs --config=examples/targets/pi.json --sets=smoke,short

# Optional extension example: adjust its local path before use
node bench.mjs --config=examples/targets/pi-opencode.json --sets=smoke,short

# Direct runtimes, not registered-tool calls
node bench.mjs --engines=pi,opencode,node --sets=smoke,micro
```

Pi tool targets dispatch actual registered tools in isolated Pi sessions. Their path and clock differ from direct runtime controls and are identified in each receipt. [Pi binding details](docs/PI_TOOL_TARGETS.md)

## Example: native Pi `codemode` vs. `codemode_o`

This is **one optional implementation comparison**, not the purpose or default configuration of the benchmark. Here, “native Pi” means Pi's built-in QuickJS `codemode`, not a native-code VM or the separate Luau project. `codemode_o` is the actual tool registered by `pi-opencode-mode`, not a direct `@opencode/codemode` runtime alias.

<!-- comparison:start -->
Measured on **2026-10-23**, Apple M5 Pro / macOS arm64 / Node **26.12.1**. Both registered tools used Pi SDK **1.0.4**; `codemode_o` came from `pi-opencode-mode` **0.0.1**, pinned at revision `53b9dd9`, with OpenCode CodeMode **2.1.0**.

**20 warm samples**, 4 warmups, and one first-invocation control per eligible cell. All 76 cases were retained: **3,675 executions, 0 invalid, 75 expected-error checks, 5 unsupported cells**.

Benchmark source: clean commit [`484627b`](https://github.com/hyein-cbio/pi-codemode-bench/commit/484627b84d81873d487a116f20fd08da0f761439). Every published benchmark source hash matches that commit. The extension revision and package/lock hashes were captured before timing and verified at export. This release baseline is separate from the [historical pre-review result](benchmarks/results/pi-comparison.json); samples are never pooled.

The table is a preselected cross-section; values are **median / nearest-rank p95 in milliseconds**. It measures root tool execution, including guest runtime/bridge work but **excluding session setup and model generation**.

| Case | Pi codemode median / p95 (ms) | codemode_o median / p95 (ms) |
|---|---:|---:|
| even-squares-10 | 13.820 / 14.774 | 0.602 / 0.745 |
| read-reduce | 12.244 / 12.886 | 0.738 / 1.661 |
| parallel-context | 15.243 / 18.113 | 3.210 / 3.734 |
| cursor-pagination | 12.950 / 14.201 | 1.252 / 1.450 |
| retry-waves | 20.106 / 20.519 | 8.857 / 9.270 |
| fan-in-dag-64 | 23.789 / 25.372 | 13.023 / 14.313 |
| deep-roundtrip-64 | 18.095 / 18.984 | 7.224 / 8.971 |
| arithmetic-100000 | 15.961 / 16.942 | 211.648 / 226.553 |
| json-records-8k-x1 | 15.369 / 16.366 | 3.984 / 5.911 |
| json-strings-48k-x4 | 13.649 / 15.814 | 8.834 / 9.970 |

In this run, short orchestration cases had lower medians with `codemode_o`, while the arithmetic control had a lower median with Pi. This is **not a universal ranking**: one host, one run, synthetic fixtures, different runtime/security limits, no confidence intervals or production-frequency weights.

The five unsupported `codemode_o` cells remain visible: two 128-call cases exceed its 64-call quota; class syntax, depth-40 JSON, and per-call deadlines are not declared supported. Expected errors are validated checks, not performance wins. This is a pinned implementation snapshot, **not a claim about the latest extension revision**.

[All 76 cases](benchmarks/results/pi-comparison.release.json.md) · [Public JSON with every timing sample and source hashes](benchmarks/results/pi-comparison.release.json)
<!-- comparison:end -->

For the exact release baseline, use benchmark source commit `484627b84d81873d487a116f20fd08da0f761439` and sibling extension revision `53b9dd937ad53cd3558b086ab21e812780524d5a` in clean checkouts with their locked dependencies installed. The config uses the repository's pinned Pi SDK, not the globally installed Pi CLI. Newer extension revisions have different routing policies and are not interchangeable with this snapshot.

```sh
# In separate trusted checkouts; do not reset a dirty working tree.
git checkout --detach 484627b84d81873d487a116f20fd08da0f761439
git -C ../pi-opencode-mode checkout --detach 53b9dd937ad53cd3558b086ab21e812780524d5a
npm ci --ignore-scripts
npm ci --ignore-scripts --prefix ../pi-opencode-mode
# Confirm both checkouts are clean and check the extension path first.
npm run bench:example -- --out=results/my-pi-comparison.json
node scripts/publish-example.mjs results/my-pi-comparison.json benchmarks/results/my-pi-comparison.json
```

Use new output paths when rerunning: artifacts are not overwritten. The publication step is an explicit, sanitized export, not an upload. [Protocol, provenance, and all-case results](benchmarks/README.md)

## Corpus

| Suite | Tier | Cases | Workload |
|---|---:|---:|---|
| smoke | 0 | 1 | Small arithmetic startup control |
| micro | 1 | 4 | Loops, arrays, objects, strings |
| short | 1–2 | 11 | Reads, config projection, parallel context, optional failures, discovery, diagnostics, triage |
| workflow | 3 | 4 | Pagination, join/top-k, retries, ETL |
| apex | 4 | 3 | Version reconciliation, DAG, deep round trips |
| stress | 5 | 9 | Arithmetic, matrix multiplication, sorting, BFS, allocation, 128-call bridge |
| json-scale | Separate axis | 36 | 2–48 KiB × two shapes × 1/4/16 parse passes |
| source | Separate axis | 3 | Source size and parsing/compilation |
| capabilities | Separate axis | 3 | Classes, deep JSON, Unicode/null |
| limits | Separate axis | 2 | Error propagation and deadlines |

Tiers organize the corpus; they are not a runtime-cost ranking. The default case selection is smoke/micro/short/workflow, but **there is no default execution target**.

```sh
node bench.mjs --sets=all --list
node bench.mjs --sets=all --export=results/corpus.json
node bench.mjs --config=bench.config.local.json --tags=json --seed=719 --source-mode=fresh
npm run bench:all -- --config=bench.config.local.json --warmup=1 --samples=1
```

[Detailed cases and independent oracles](docs/CORPUS.md)

## Where are results recorded?

Every run writes a receipt, a readable report, and a streaming sample journal:

| Path | Contents |
|---|---|
| `results/run-<timestamp>.json` | Full local receipt, validation outcomes, timings, traces, configuration, hashes |
| `results/run-<timestamp>.json.md` | Human-readable per-case summary |
| `results/run-<timestamp>.json.samples.jsonl` | Samples appended during execution |
| `results/latest.json` | In the caller's working directory; latest completed default-path run; not necessarily the full corpus |
| `benchmarks/results/` | Deliberately sanitized, version-controlled public examples |

`results/` is git-ignored. Earlier local full sweeps are recorded in `results/final-validation-all.json` (direct runtimes) and `results/pi-tools-all.json` (registered Pi tools); they are historical smoke runs, not the repeated README example. See [the validation history](docs/VALIDATION.md).

`--out=path.json` selects a new path and refuses overwrites. Do not publish raw local receipts directly: they may include absolute paths, configuration, or tool traces. Only sanitized examples belong under `benchmarks/results/`.

## Interpretation

- Validate complete values, call arguments/counts/statuses, dependencies, and specified concurrency.
- Preserve failures from every phase; any failure makes the cell ineligible for performance comparison.
- Median/p95 use valid warm successes only. Expected errors and unsupported cases are not speed wins.
- `cold` means the first invocation of that case, **not process-cold**.
- Retain raw samples, source/fixture/config hashes, target versions, and timing boundaries.
- Generic clients time `callTool`; the Pi binding times root tool execution events. Do not pool incompatible lifecycle, transport, or security contracts into a universal speedup.

Nested tools are controlled in-memory fixtures, not real file I/O, production traffic, or LLM generation. Client modules are trusted host code; external effects, billing, and security depend on the chosen adapter.

[Methodology](docs/METHODOLOGY.md) · [Adapters](docs/ADAPTERS.md) · [Validation](docs/VALIDATION.md)

## Optional source-generation tasks

`npm run tasks` prints eight prompts without solutions. The existing `tasks.mjs` offline grader is an optional Pi/OpenCode utility, not a requirement for generic benchmarks. It makes no model requests and records generation time, tokens, and cost as `null`. [Task contract](docs/TASKS.md)

## Contribution and release policy

Distribution files are explicitly allowlisted; tests and CI configuration are not included. `npm test` also packs and extracts the real tarball, then executes all demo cases without dependencies or a lockfile. A missing bundled lockfile is recorded as a null hash, not silently treated as pinned dependencies. Use a source checkout and `npm ci` for locked Pi/OpenCode studies. Package publication remains disabled by `private: true` pending an explicit release decision.

See [CONTRIBUTING.md](CONTRIBUTING.md) for development checks, [SECURITY.md](SECURITY.md) for trust boundaries and private reporting, [CHANGELOG.md](CHANGELOG.md) for release notes, and [the release checklist](docs/RELEASING.md) for maintainer-only publication steps.

All repository content must be in English, including documentation, comments, examples, fixtures, and public artifacts. Run `npm run check:language` before submitting changes. The automated gate detects Hangul; English-language review is still required.

The Pi SDK's transitive `brace-expansion` is explicitly overridden to **5.0.12** to address the previously disclosed denial-of-service advisories. Pi SDK is now pinned to **1.0.4**, whose package does not ship the override-blocking shrinkwrap from 1.0.0. Its coordinated Pi packages are also overridden to **1.0.4** to avoid incompatible caret-range upgrades; OpenCode CodeMode and Effect remain pinned at their earlier versions. Historical timings retain their original dependency hashes; new measurements are separate snapshots. Run `npm audit` for current advisories, and never expose these trusted-code integrations as a general-purpose service.

CI publishes only an allowlisted numeric demo-validation summary. Raw `results/` receipts are never uploaded as Actions artifacts.
