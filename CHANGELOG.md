# Changelog

## 0.1.2 - Pi installation and inline ESM fixes (2026-11-08)

### Fixed

- Allow file-backed benchmark workers to start from inline ESM and stdin entry points by excluding the parent's `--input-type` flag while retaining other execution flags.
- Use optional Pi SDK 1.5.0, whose companion dependencies are exactly pinned, instead of requiring consumers to copy root overrides for Pi 1.0.4. Adapt fixture tool schemas to avoid the removed `pi-ai` Type re-export.

### Added

- Regression tests for equals/separate `--input-type` options, eval/stdin API entry points, registered Pi tools, and worker preload/flag preservation.
- Packed-consumer checks for optional peers installed without overrides and inline ESM API execution.

The engine fixes originate from commit `c2152e7cb6a6ee485c7f126acdab677e1d6e12d5`. Historical Pi 1.0.4 benchmark artifacts and their source identities are unchanged; current Pi 1.5.0 runs are a different implementation snapshot.

## 0.1.1 - Optional engine package resolution (2026-10-23)

### Fixed

- Resolve optional engine packages from installed consumers so the CLI and runtime adapters work outside the repository checkout.
- Declare optional engine peer dependencies and report actionable installation instructions when they are missing.

### Added

- Packed-package smoke tests with and without optional engine peers, plus package resolution regression tests.
- Installation guidance for optional engine peers.

The engine resolution changes originate from commit `4a165fe24e4b657e64a1186d8288de403de67531`. Historical benchmark measurements and their source identities are unchanged.

## 0.1.0 - Initial release (2026-10-23)

### Added

- Implementation-neutral benchmark corpus: 76 cases across 10 suites with independent output, tool-call, dependency and concurrency validation.
- Explicit tool/runtime targets, external language sources, a typed ESM API and the `codemode-bench` CLI.
- Dependency-free demo, Python JSONL bridge and optional Pi/OpenCode integration bindings.
- Cold/warmup/warm receipts, raw timing samples, capability gaps and deliberately sanitized public comparisons.
- Security reporting guidance, contributor checks, package repository metadata and a maintainer release checklist.

### Security and reproducibility

- Update Pi SDK from 1.0.0 to 1.0.4 to remove its override-blocking shrinkwrap, and explicitly override transitive `brace-expansion` to 5.0.12. Coordinate Pi's companion packages at 1.0.4 rather than allowing incompatible caret-range upgrades. OpenCode CodeMode and Effect versions remain unchanged.
- Remove raw GitHub Actions artifact uploads; expose only allowlisted numeric demo-validation summaries.
- Require new public comparisons to be exported from their clean committed measurement revision, with extension revision and entry/package/lock identities bound to the measurement receipt.
- Preserve the original pre-review timing snapshot as historical evidence; add a [separate release baseline](benchmarks/results/pi-comparison.release.json) from clean source commit `484627b84d81873d487a116f20fd08da0f761439`, with the original extension pinned at `53b9dd937ad53cd3558b086ab21e812780524d5a`. All 76 cases are retained: 3,675 executions, 0 invalid, 75 expected-error checks and 5 unsupported cells. Samples are never pooled across runs.

The measurement baseline retains its original pre-release source identity; release metadata does not relabel historical timings. See [RELEASING.md](docs/RELEASING.md) for the publication procedure.
