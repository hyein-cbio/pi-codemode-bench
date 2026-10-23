# Public benchmark examples

These artifacts are **optional implementation examples**, not mandatory benchmark targets or a universal ranking. Local raw receipts remain under ignored `results/`; only deliberately sanitized derivatives belong here.

## Pi codemode vs. codemode_o

- [Public receipt and all raw timing samples](results/pi-comparison.json)
- [Readable comparison of all 76 cases](results/pi-comparison.json.md)
- [Target configuration](../examples/targets/pi-comparison.json)
- [README cross-section](../README.md#example-native-pi-codemode-vs-codemode_o)

Run started **2026-10-22T23:01:18.128Z** on an Apple M5 Pro, macOS arm64, Node **26.12.1**. Both tools were dispatched through isolated Pi **1.0.0** SDK sessions.

Here, native Pi means the built-in **QuickJS codemode tool**, not a native-code VM or the Luau implementation. `codemode_o` was provided by the actual `pi-opencode-mode` **0.0.1** extension, using `@opencode/codemode` **2.1.0** and Effect **4.0.1**.

The extension was inspected at revision `53b9dd937ad53cd3558b086ab21e812780524d5a`. Its measured entry and package/lock sources were clean against that revision; unrelated working-tree changes existed. The extension entry hash was checked against the raw measured receipt during export. Dependency versions/lock metadata were inspected at export, not recursively fingerprinted during every invocation.

### Fixed protocol

- Entire 76-case corpus, seed 1, reused program sources.
- One first-invocation control, four warmups, twenty warm observations per eligible case/tool.
- Serial measurements; the starting tool rotates by case/sample index and seed.
- Clock: root Pi `tool_execution_start → tool_execution_end`.
- Includes guest runtime startup/parse/execute, nested bridge work and synthetic tool waits.
- Excludes session setup, extension loading, scripted assistant turns and shutdown.
- No real model, external tool server, actual file read, or user traffic in the measured workload.
- Complete outputs, exact tool signatures/statuses, dependencies and specified concurrency validated on every execution.

Results: **3,675 executions**, consisting of **3,600 successful workloads** and **75 expected-error checks**; **0 invalid executions**, **5 unsupported case/tool cells**.

Pi ran 76 cases; the extension ran 71. Its five skipped cases were the two 128-call controls, class syntax, depth-40 JSON and the per-call deadline control. These were declared eligibility gaps, not timed rejection wins.

The README selection was fixed by workload shape before timing in `lib/public-example.mjs`. The public artifact retains every case and every cold/warmup/warm duration, so the displayed selection cannot hide contrary results in the rest of the corpus.

### Interpretation and limitations

This is a single-host, single-run example. It does not establish statistical significance, stable tail latency, pure VM speed, language parity, production frequency or a universal winner. Twenty samples make p95 the nineteenth sorted warm observation. Host background load was not eliminated; load averages are included. No CPU/thermal isolation or confidence interval is claimed.

Both targets use the same registered-tool clock, but their lifecycle, interpreter, bridge and policy contracts differ. Do not treat the lower time of an unsupported or expected-error cell as successful execution. No aggregate score, weighted speedup or automatic routing rule is provided.

### Provenance and public export

The benchmark working tree was dirty during measurement; its recorded HEAD precedes this implementation. **Do not reproduce by checking out that HEAD alone.** The artifact's `provenance.implementationHashes` identify the measured benchmark files and lockfile; use a checkout with those hashes. The extension entry hash/revision and target config hash identify the external implementation and configuration.

The exporter:
1. Requires a completed, non-drifted full-corpus receipt.
2. Checks every sample slot and phase; reuses the live runner\'s outcome and trace validators for outputs, signatures, response hashes and concurrency bounds. Recorded call order must also respect dependency starts; actual dependency **completion** is enforced during live fixture dispatch, not reconstructed from static traces.
3. Recomputes statistics and refuses mismatched summaries.
4. Retains all timing arrays, capability gaps, expected-error checks, hashes and public host/version metadata.
5. Omits absolute local paths, private target configuration, raw return values, raw call traces, error text and credentials.

The public derivative does not contain complete raw traces or prove them cryptographically correct; it records the validation result and their normalized signature hashes. It includes the SHA-256 of the full local receipt. Exact dependency bytes beyond the recorded scope are not claimed.

### Reproduce

Install benchmark development dependencies with `npm ci`. Separately obtain a trusted `pi-opencode-mode` checkout at the recorded revision and install its locked dependencies. Nothing here downloads or installs that extension automatically. Adjust the local path in the comparison config if necessary; record any resulting config hash difference.

```sh
npm run bench:example -- --out=results/my-pi-comparison.json
node scripts/publish-example.mjs results/my-pi-comparison.json benchmarks/results/my-pi-comparison.json
```

The exporter is tailored to this registered Pi/extension example; it is not a generic claim that any target is safe to publish. It inspects the extension's local package and Git metadata, so use an existing checkout whose entry still matches the measured hash. Both output paths must be new. The script writes local files only; it does not upload, commit, push, or publish a package.

The current checked-in public example was exported from local `results/readme-pi-comparison.json`. It remains an immutable pre-review measurement snapshot; later result-handling and packaging fixes do not retroactively change those timings or their source hashes. Earlier full smoke receipts, including `results/pi-tools-all.json` and `results/final-validation-all.json`, remain separate historical observations. Their smaller sample counts and older fixture versions are not pooled with this example.
