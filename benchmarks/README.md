# Public benchmark examples

These artifacts are **optional implementation examples**, not mandatory benchmark targets or a universal ranking. Local raw receipts remain under ignored `results/`; only deliberately sanitized derivatives belong here.

## Release baseline: Pi codemode vs. codemode_o

- [Public receipt and all raw timing samples](results/pi-comparison.release.json)
- [Readable comparison of all 76 cases](results/pi-comparison.release.json.md)
- [Target configuration](../examples/targets/pi-comparison.json)
- [README cross-section](../README.md#example-native-pi-codemode-vs-codemode_o)

Run started **2026-10-23T11:38:02.261Z** on Apple M5 Pro, macOS arm64, Node **26.12.1**. Both tools used isolated Pi **1.0.4** SDK sessions with coordinated Pi packages overridden to **1.0.4** and `brace-expansion` **5.0.12**.

Benchmark source is clean commit [`484627b84d81873d487a116f20fd08da0f761439`](https://github.com/hyein-cbio/pi-codemode-bench/commit/484627b84d81873d487a116f20fd08da0f761439). Every published benchmark implementation/config hash matches a file at that revision. The later release commit adds these results and documentation; it does not change the measurement source.

“Native Pi” means the built-in **QuickJS codemode tool**, not a native-code VM or the Luau implementation. `codemode_o` was provided by the actual **0.0.1** extension pinned at revision `53b9dd937ad53cd3558b086ab21e812780524d5a`, using OpenCode CodeMode **2.1.0** and Effect **4.0.1**. Its entry/package/lock files match that clean revision. Revision and package/lock hashes were recorded before timing and verified at export. Installed dependency bytes are not recursively fingerprinted.

This is not a measurement of the latest extension. An initial clean run at extension revision `c147f14c3b2e4996939eeee8473f802d00409b87` produced **75 invalid executions**: its routing policy rejected `string-length-1000`, `source-4096` and `source-32768` in all 25 phases/samples. It was retained locally and refused public export. The release baseline deliberately returns to the original comparison's pinned extension revision; no source was rewritten, rejection was not timed as success, and samples were not pooled. A separate zero-invalid attempt with untracked Finder metadata in the extension checkout was also refused export. Only the final clean run is published here.

### Fixed protocol

- Entire 76-case corpus, seed 1, reused program sources.
- One first-invocation control, four warmups, twenty warm observations per eligible case/tool.
- Serial measurements; the starting tool rotates by case/sample index and seed.
- Clock: root Pi `tool_execution_start → tool_execution_end`.
- Includes guest runtime startup/parse/execute, nested bridge work and synthetic tool waits.
- Excludes session setup, extension loading, scripted assistant turns and shutdown.
- No real model, external tool server, actual file read, or user traffic in the measured workload.
- Complete outputs, exact tool signatures/statuses, dependencies and specified concurrency validated on every execution.

Results: **3,675 executions**, consisting of **3,600 successful workloads** and **75 expected-error checks**; **0 invalid executions**, **5 unsupported case/tool cells**, `sourceDrift:false`.

Pi ran 76 cases; the pinned extension ran 71. Its five unsupported cells were two 128-call controls, class syntax, depth-40 JSON and the per-call deadline control. These are declared eligibility gaps, not timed rejection wins. The README cross-section was selected by workload shape, not observed winners; every case and timing sample remains available.

### Interpretation and limitations

This is a single-host, single-run example. It does not establish statistical significance, stable tail latency, pure VM speed, language parity, production frequency or a universal winner. Twenty samples make nearest-rank p95 the nineteenth sorted warm observation. Host background load was not eliminated; load averages are included. No CPU/thermal isolation or confidence interval is claimed.

Both targets use the same registered-tool clock, but their lifecycle, interpreter, bridge and policy contracts differ. Expected errors and unsupported cells are not successful workload timings. No aggregate score, weighted speedup or automatic routing rule is provided. The new SDK/dependency baseline is separate from the historical snapshot below; differences between the runs are not a controlled causal estimate of the dependency update's effect.

### Provenance and public export

The exporter:

1. Requires a completed, non-drifted, full-corpus receipt.
2. Requires the same clean benchmark revision at measurement and export; verifies every retained source/config hash against committed bytes.
3. Compares measured extension revision/package/lock identity with the export checkout and verifies committed entry/package/lock bytes.
4. Checks every sample slot and phase using the live runner's output/trace validators; recomputes statistics and rejects mismatched summaries.
5. Retains all timing arrays, capability gaps, expected-error checks, hashes and public host/version metadata.
6. Omits absolute local paths, private target configuration, raw return values, raw call traces, error text and credentials.

The public derivative is not a cryptographic proof of execution and omits full raw traces. It records validation outcomes, normalized call signature hashes and the SHA-256 of the private source receipt. Dependency **completion** is enforced during live fixture dispatch, not reconstructed from static traces. Inspect every new export before publication.

### Reproduce

Use separate clean trusted checkouts with the benchmark and extension as siblings. Do not reset an existing dirty working tree.

```sh
# From the separate benchmark checkout:
git checkout --detach 484627b84d81873d487a116f20fd08da0f761439
git -C ../pi-opencode-mode checkout --detach 53b9dd937ad53cd3558b086ab21e812780524d5a
npm ci --ignore-scripts
npm ci --ignore-scripts --prefix ../pi-opencode-mode
npm run bench:example -- --out=results/my-pi-comparison.json
node scripts/publish-example.mjs results/my-pi-comparison.json benchmarks/results/my-pi-comparison.json
```

Check the config's local extension path and both Git statuses first. Use new output paths. The exporter writes local files only: it does not upload, commit, push, or publish a package. It is tailored to this comparison, not a generic guarantee that arbitrary target receipts are safe to share.

The release derivative came from local `results/release-comparison-clean.json`; raw JSON, Markdown and sample journal remain private.

## Historical pre-review snapshot

- [Original public JSON](results/pi-comparison.json)
- [Original all-case report](results/pi-comparison.json.md)

The original run started **2026-10-22T23:01:18.128Z**, using Pi SDK **1.0.0** and the same extension revision `53b9dd9`. Its **3,675 executions / 0 invalid / 75 expected-error checks / 5 unsupported cells** remain unchanged, including every original sample, hash and attribution field.

That benchmark working tree was dirty; its recorded HEAD `745dfc3` predates the measured implementation, and no available committed revision matches every recorded source hash. The artifact identifies the measured bytes but does **not** provide a recoverable source checkout. Treat it as historical evidence, not the reproducible release baseline. It also predates the dependency security update and stricter publication gates. Do not rewrite its hashes, pool its timings with the release baseline, or claim that checking out its HEAD reproduces it.

Earlier raw smoke receipts under local `results/` remain separate correctness observations described in [the validation history](../docs/VALIDATION.md).
