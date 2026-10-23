# Changelog

## 0.0.1 - Initial release candidate

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
- Preserve the original pre-review timing snapshot as historical evidence; a separate release baseline is measured from committed source, never pooled with old samples.

This is a release candidate, not a statement that an npm package or GitHub Release has been published. See [RELEASING.md](docs/RELEASING.md).
