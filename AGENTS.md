# Repository policy

- All committed content must be written in English: documentation, code comments, examples, fixture labels, reports, and public result artifacts.
- Do not add Hangul text, including in Unicode test fixtures. Use other Unicode characters when testing encoding behavior.
- Run `npm run check:language` before proposing changes. This mechanical check detects Hangul; it does not replace English-language review.
- Keep the benchmark implementation-neutral. No tool or vendor is an implicit execution target.
- Keep local receipts under ignored `results/`. Do not publish those files directly: they may contain absolute paths, configuration, and tool traces.
- Publish only deliberately sanitized artifacts under `benchmarks/results/`, with source provenance, validation outcomes, raw timing samples, and measurement limitations.
- Do not publish a package or push a repository without explicit authorization.
