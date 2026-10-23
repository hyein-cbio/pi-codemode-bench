# Project ownership and provenance

[pi-codemode-bench](https://github.com/hyein-cbio/pi-codemode-bench) is the canonical source for the benchmark implementation, corpus, fixtures, independent oracles and public result examples.

## First-party project history

The earlier `pi-codemode-luau` project belongs to the same maintainer. Its design ideas were carried forward as first-party project history, not as an external third-party dependency. That earlier repository is not required to install, run or extend this package.

This repository owns the current workload definitions and validation contracts:

- [Corpus](CORPUS.md): the difficulty ladder, workflows, scale sweeps and capability/error probes.
- [Methodology](METHODOLOGY.md): correctness gates, timing boundaries, scheduling and provenance hashes.
- [Extension contract](EXTENDING.md): external language sources, tool clients and runtime adapters.
- [Public examples](../benchmarks/README.md): measured snapshots with explicit scope and reproducibility limitations.

No predecessor runtime binaries, private conversations, production-frequency datasets or historical speed measurements are imported as current results. The retained public benchmark snapshot and earlier local receipts remain historical records; their original hashes and attribution metadata are not rewritten.

## License and external dependencies

The project is covered by its root [MIT license](../LICENSE). There is no separate third-party notice for the maintainer's predecessor project.

External runtime and development dependencies retain their respective licenses and notices. This documentation change does not alter their license terms or the project's existing copyright notice.
