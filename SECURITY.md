# Security policy

## Supported versions

Security fixes are developed on `main` and included in the latest 0.1.x release. Older snapshots and historical benchmark results are not maintained execution environments. No response-time guarantee is offered.

## Reporting a vulnerability

Do not post credentials, exploit details or private receipts in public issues. Prefer [GitHub private vulnerability reporting](https://github.com/hyein-cbio/pi-codemode-bench/security/advisories/new) when the repository offers it. If that form is unavailable, use the contact options on the [maintainer's GitHub profile](https://github.com/hyein-cbio) to arrange a private channel; a public request for a contact channel must omit technical details.

Include the affected revision, Node/platform versions, a minimal reproduction without secrets, expected behavior and security impact. Report vulnerabilities in external runtimes to their maintainers as well.

## Trust boundaries

- This benchmark is not a sandbox or a hosted code-execution service. Run only trusted adapters, source plugins, extensions and example backends.
- Target configuration can execute host code, start processes, access credentials or incur external charges. No offline or credential-free guarantee applies to arbitrary targets.
- Worker cancellation and deadlines are correctness/lifecycle controls, not security isolation.
- Raw `results/` receipts can contain absolute paths, configuration, return values, errors and tool traces. Keep them private. CI publishes only fixed-label numeric validation summaries, never raw artifacts.
- Only deliberately sanitized derivatives belong under `benchmarks/results/`. Inspect new exports before committing or sharing them.

## Dependencies

Use `npm ci --ignore-scripts` for the locked development environment and `npm audit` to check current advisories. The Pi SDK, OpenCode CodeMode and Effect versions are pinned for measurement provenance. Pi SDK 1.0.4 removes the nested shrinkwrap shipped by 1.0.0, allowing an explicit override of Pi's transitive `brace-expansion` to 5.0.12 to address the previously disclosed denial-of-service advisories. Coordinated Pi packages are overridden to 1.0.4 to avoid incompatible caret-range upgrades. Dependency changes require tests and a separate measurement snapshot; old timings must not be relabeled.
