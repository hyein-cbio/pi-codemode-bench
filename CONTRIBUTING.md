# Contributing

Keep the benchmark implementation-neutral: targets are explicit, and unsupported workloads are not speed wins. See [the extension guide](docs/EXTENDING.md) before adding adapters or language sources.

## Development checks

Requires Node 22.19 or later. The Python example tests also use `python3` when available.

```sh
npm ci --ignore-scripts
npm run check:language
npm test
npm audit
npm run bench:demo
git diff --check
```

The actual `pi-opencode-mode` integration is opt-in and requires a trusted sibling checkout with its dependencies installed:

```sh
PI_BENCH_OPENCODE_EXTENSION=../pi-opencode-mode/index.js npm test
```

A skipped optional integration is not evidence that the external target passed. Keep correctness checks, expected-error outcomes, capability gaps and timing limitations explicit.

## Pull requests and evidence

- Write documentation, code comments, examples, fixture labels and reports in English. The language check detects Hangul, not all non-English writing.
- Add regression tests for behavior changes. Do not weaken independent value, call-trace, dependency or concurrency validation to make a target pass.
- Keep raw receipts under ignored `results/`; never attach them to public issues or CI artifacts without reviewing and sanitizing them.
- Retain all timing samples, source provenance and validation outcomes in deliberately sanitized public examples. Never pool runs across dependency/source changes.
- Do not overwrite historical results or retroactively change their source hashes.
- Report security issues through [SECURITY.md](SECURITY.md), not public defect reports.

The project uses the [MIT license](LICENSE). See [the release checklist](docs/RELEASING.md) for maintainer-only publication steps.
