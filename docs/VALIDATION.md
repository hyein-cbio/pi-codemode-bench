# Local validation record

Validated on macOS arm64, Apple M5 Pro, Node **v26.12.1**. Pi **1.0.0**, OpenCode CodeMode **2.1.0**, Effect **4.0.1** remain pinned. The historical checkpoints below are correctness smoke observations. The separate repeated README example is linked below and must not be pooled with those checkpoints.

## Standalone and extension checkpoint

The package now exposes the installed `codemode-bench` CLI and a typed ESM API. Regression tests consume an actual npm tarball from an unrelated Git project, make the installation read-only, and verify cwd-relative output, null dependency-source Git metadata, public imports and external adapters/source plugins. No consumer files or commits are attributed to benchmark source.

`PI_BENCH_OPENCODE_EXTENSION=../pi-opencode-mode/index.js npm test` passed **47 tests, 0 failed, 0 skipped**, including Python callback/concurrency/error/deadline conformance. Core operation still needs no Pi/OpenCode installation. Python-specific tests require `python3`; they skip explicitly when it is absent. Public declarations and typed factory examples passed TypeScript **5.9.3** strict NodeNext checking using an existing offline npm cache; no compiler or new runtime dependency was added to this package.

Lifecycle tests verify normal subprocess disposal, API cancellation, CLI SIGINT exit status 130, incomplete interrupted receipts, cancellation of in-flight fixture callbacks, backend restart and error reporting for failed cleanup. The runtime watchdog remains an invalid outcome and has a bounded cooperative-disposal grace period before hard worker termination.

A fresh-source mixed run is recorded locally at `results/validation-sdk-mixed.json` with its Markdown and JSONL companions. Its explicit config is `results/validation-sdk-mixed.config.json`: registered Pi `codemode`, registered `codemode_o`, and the Python JSONL client. Over all **76 cases**, the run recorded **612 executions, 0 invalid, 20 expected-error checks, 75 unsupported cells, sourceDrift:false**. The unsupported matrix is deliberate: 70 untranslated Python cases plus the 5 extension capability/quota gaps. Python supports 6 conformance cases, not full language parity. These are correctness observations, not additional public speed samples.

CodeRabbit completed a focused review of the new standalone/extension interfaces with **0 additional findings**. The prior public README comparison remains unchanged and still identifies its original source snapshot. Publication stays disabled by `private:true`; no package publication, commit or push was performed. See [EXTENDING.md](EXTENDING.md) for the public integration contract.

## Review-fix checkpoint

The four reproduced issues are corrected: npm tarballs no longer require a bundled lockfile; Pi structured results are read from the root execution event; decoding/cancellation failures cannot pass guest-error probes; mixed/custom targets no longer receive blanket offline or credential-free claims.

`PI_BENCH_OPENCODE_EXTENSION=../pi-opencode-mode/index.js npm test` passed **38 tests, 0 failed, 0 skipped**. This includes real Pi structured/nested/error dispatch, rejection of malformed output containing an expected-error sentinel, and receipt/report scope checks. The packaging test creates the actual npm tarball, extracts it without dependencies, and runs **76 cases / 152 executions with 0 invalid and 0 unsupported**. It also checks absent-lock provenance, lock appearance as source drift, and failure on a missing executable source.

`node bench.mjs --config=examples/targets/pi-comparison.json --sets=all --warmup=1 --samples=2 --out=results/review-fixes-pi-tools.json` dispatched both real registered tools over all **76 cases / 588 executions, 0 invalid, 5 unsupported, 12 expected-error checks**. This is a correctness validation run, not a replacement for the repeated README measurement snapshot. Its receipt, Markdown report and JSONL journal are local under ignored `results/`.

The obsolete pre-release `measure`/`receiptFrom` path and duplicate script alias were removed. Live execution and public export now share outcome/trace validators; common target fields share one normalization function. The public timing artifact remains unchanged. CodeRabbit completed an isolated full-source snapshot review with **0 additional findings**; the working repository was not staged for that review. English-only and whitespace checks passed. No package publication or repository push was performed.

## Public README example

The optional registered-tool comparison is now documented in the [README](../README.md#example-native-pi-codemode-vs-codemode_o), with [sanitized public evidence](../benchmarks/README.md). It covers all 76 cases with 4 warmups, 20 warm samples and one first-invocation control per eligible cell: **3,675 executions, 0 invalid, 75 expected-error checks, 5 unsupported cells**.

Full local evidence: `results/readme-pi-comparison.json`, its `.md` report and `.samples.jsonl` journal. Public evidence: `benchmarks/results/pi-comparison.json` and `benchmarks/results/pi-comparison.json.md`. Local receipts are git-ignored; the public derivative removes private paths/configuration and retains timing arrays plus provenance hashes.

Unicode fixture data was changed to accented Latin/emoji before this run to satisfy the English-only repository policy. It is a new snapshot, not a relabeling of the earlier receipts.

Final checks for this example: **36 tests passed** with the optional local extension test enabled; `npm run check:language` passed for all 59 repository files. Tests recompute every published median/p95 from timing arrays and check the README table against the artifact. `npm pack --dry-run --ignore-scripts` confirmed that root `results/` receipts are excluded while `benchmarks/results/` is included. No package publication or repository push was performed.

## Implementation-neutral checkpoint

The current `bench.config.example.json` selects a dependency-free local **demo tool client**, not Pi or `pi-opencode-mode`. No target is automatically selected by the CLI. Pi/OpenCode packages are now development dependencies; their locked versions/integrities did not change.

`npm run test:core` passed **13 tests**. One test copies the harness to an isolated directory with no `node_modules` or sibling extension and runs all **76 cases / 152 executions, 0 invalid, 0 unsupported** through the generic tool-client contract. Other tests verify arbitrary tool names/input keys/options, actual fixture calls and harness-owned call latency. This is protocol/correctness evidence, not a performance claim about an external product.

`npm run bench:demo` now runs the dependency-free demonstration. Pi and pi-opencode-mode configurations are separate opt-in files in `examples/targets/`.

## Initial direct-runtime checkpoint

| Command | Observation |
|---|---|
| `npm test` | 19 tests passed, 0 failed |
| `node bench.mjs --sets=all --engines=pi,opencode,node --warmup=1 --samples=1 --out=results/final-validation-all.json` | 76 cases, 678 executions, 0 invalid, 2 unsupported cells, 18 expected-error checks |
| `npm run bench:smoke` | 12 cases, 72 executions, 0 invalid, 0 unsupported |
| `node bench.mjs --sets=workflow,apex --engines=pi,opencode,node --seed=719 --source-mode=fresh --warmup=0 --samples=1 --out=results/validation-fresh-seed719.json` | 7 cases, 42 executions, 0 invalid |
| `node bench.mjs --cases=even-squares-10 --engines=none --adapter=./examples/python-adapter.mjs --warmup=1 --samples=2 --source-mode=fresh --out=results/final-validation-python.json` | 1 case, 4 Python executions, 0 invalid |
| `git diff --check` | Clean |

The final full-corpus receipt was created at **2026-10-22T22:22:43.323Z**. It reports `sourceDrift:false`. Its 678 executions comprise 660 valid workloads and 18 expected-error checks. OpenCode's declared class/deep-JSON gaps are the two unsupported cells, not failed or timed workloads.

Raw JSON, Markdown and JSONL artifacts are local under ignored `results/`; they are not silently committed or presented as upstream historical results. Reruns need a new `--out` path, because artifact overwrites are refused. Use `npm ci` and the same code/lock hashes from a receipt to reproduce a particular snapshot. Documentation added after a run is not retroactively included in that run's source provenance.

## Configured Pi-tool checkpoint

At this historical checkpoint, `bench.config.example.json` contained both Pi targets (its contents have since been replaced by the neutral demo; use the recorded receipt config to reproduce it). The command `node bench.mjs --config=bench.config.example.json --sets=all --warmup=1 --samples=1 --out=results/pi-tools-all.json` dispatched the actual registered `codemode` and `codemode_o` tools through isolated Pi **1.0.0** AgentSessions. The existing sibling `pi-opencode-mode/index.js` was loaded explicitly, not installed globally or replaced with the direct runtime.

Observed: **441 executions, 0 invalid, 5 unsupported cells** over all 76 cases. The extension-specific skips are two 128-call cases (64-call product limit), class syntax, depth-40 JSON and the per-call deadline probe. The receipt includes root tool IDs/names, Pi nested-call audits, config and extension hashes. This result is distinct from the earlier 678-execution direct-runtime run.

`PI_BENCH_OPENCODE_EXTENSION=../pi-opencode-mode/index.js npm test` passed **27 tests, 0 failed, 0 skipped**. Without that optional environment variable, the actual external-extension test is skipped; the remaining 26 tests are self-contained.

The target tests additionally cover config-relative paths, unknown keys/IDs, remote-spec refusal, real dispatch of arbitrary tool names/input keys, missing-tool rejection without fallback, strict output decoding and CLI target selection. Run the optional actual-extension integration test with `PI_BENCH_OPENCODE_EXTENSION=../pi-opencode-mode/index.js npm run test:targets`. It is not installed automatically in CI.

## Test coverage

- Complete 76-case catalog, all ten lanes, deterministic seeds and exact source/fixture metadata.
- All 226 eligible case/engine combinations on the real Pi/OpenCode/Node executors.
- Changed-seed workflow, DAG/reconciliation and all JSON-scale cases.
- Independent JSON equality, safe numeric values, statistics and rotating execution schedule.
- Unknown/duplicate/empty CLI selections, export without execution, overwrite refusal.
- Full call allowlist, dependency enforcement, duplicate/missing/unplanned calls and mutation isolation.
- Partial failures, cancellation and measured concurrency.
- Correct constant answers that omit mandatory calls; wrong answers after valid calls.
- Non-JSON output, invalid durations, truncation and runtime warnings rejected.
- Parent watchdog termination, incomplete trace disclosure and subsequent worker recovery.
- All-phase failure gating, expected errors without speed statistics and strict coverage exit status.
- Prompt exports without solutions and candidate grading with null generation/token/cost fields.

A GitHub Actions matrix for Linux/macOS with Node 22 is added in `.github/workflows/ci.yml`. **Remote CI has not been run in this local task**; Node 22/Linux compatibility is not inferred from the local Node 26/macOS pass. Python is an optional local example and not a CI prerequisite.

## Known dependency warning

`npm audit --json` reports **one high-severity transitive dependency**, `brace-expansion` under the pinned Pi package, with brace-expansion denial-of-service advisories. The fixed replay does not invoke real glob tools. Runtime/lock versions were deliberately not upgraded during benchmark implementation; this is a disclosed outstanding dependency issue, not a clean security audit. Evaluate a separate dependency update and rebaseline its timings before exposing any general-purpose service.
