# Measurement and evidence contract

## Scope

The bundled implementations replay deterministic sources against **real executors** and **synthetic in-memory tools**. Their workloads exclude LLM generation, interactive permission UI, network/MCP servers, real filesystem reads and production traffic. Direct-runtime mode bypasses AgentSession; `pi-tool` targets dispatch through isolated AgentSessions with scripted assistant turns. Fixture paths are in-memory keys. Arbitrary clients, adapters or extensions may perform their own external work; a mixed receipt never infers that every target is offline or credential-free.

No implementation is selected by default. A generic `kind:"tool"` target uses the explicitly configured client and exact tool name. Its external effects and transport behavior are adapter-defined; the harness does not infer that an arbitrary client is offline or has zero model costs. `bench.config.example.json` is only a dependency-free local protocol demo.

Optional adapters/controls:
- Pi `@earendil-works/pi-coding-agent@1.0.0`: direct internal `executeCodemode`, fresh QuickJS sandbox, minimal fixture context. This is a version-specific internal API, not a stable public SDK claim.
- `@opencode/codemode@2.1.0` with `effect@4.0.1`: fresh CodeMode configuration and interpreter each call. Schema wrapping, parse/tree-walk and execution are timed. This is the runtime package, **not the full OpenCode agent**.
- Node: fresh `node:vm` context, host Node version recorded. Trusted reference control only.
- Optional Python: new Python process per call; process startup included. One pure-compute source supported by the example.
- Configured `pi-tool`: actual registered tool from explicit local extensions, fresh isolated SDK session each call. Default SDK is pinned Pi 1.0.0; an explicit `sdk` path can select another installed version. This is not an alias for a direct runtime. See [target configuration](TARGETS.md).

The original five-case scheme reused one OpenCode runtime. New receipts use format 2 and fresh configurations; do not merge format-1 and format-2 timings.

## Schedule and clock

An engine's host worker is created once outside the clock; runtime imports are excluded. Measurements run serially across engines, not concurrently. For every case:
1. One first-invocation (`cold`) observation per eligible engine.
2. Configured warmups, retained and validated.
3. Configured warm samples, retained and validated.

The starting engine rotates by case index, sample index and seed; this is deterministic counterbalancing, not random sampling. There is no process-cold claim and OS caches are not cleared.

Direct-runtime clock: adapter `performance.now()` around per-call setup and execute. It includes runtime creation, fixture bridge transport/serialization, synthetic host wait, output handling and cleanup performed by that adapter. It excludes corpus construction, independent oracle/fixture preparation, validation, worker initialization, receipt writing and package installation. Fixture trace timings overlap and must **not** be summed and subtracted as a precise CPU estimate.

For `pi-tool`, the clock is the root `tool_execution_start` to `tool_execution_end` interval. Session creation, extension loading, scripted assistant turns and session shutdown are outside it. Actual tool schema validation/hooks/nested dispatch are supplied by Pi, not mocked contexts. The receipt identifies the clock per engine. Do not silently mix these observations with direct-runtime timing.

For generic `tool` targets, the core measures the awaited `client.callTool(name, input, {fixture, timeoutMs})` interval. Client initialization is excluded; a client-supplied timing field cannot override this clock. Dispatch names and input hashes are recorded. This boundary is host-neutral but still includes whatever transport/setup the client performs per call. Clients must disclose lifecycle differences, not call them pure VM speed.

## Correctness before speed

Each invocation checks:
- Full JSON-safe value, canonical object-key order, array order preserved.
- Exact call names/args/counts and status/error sentinel.
- Dependency completion and, where specified, min/max peak in-flight tool calls.
- No pending work, truncation or runtime warnings.
- Finite nonnegative measured duration.

Numeric results here use exact integers within the safe range. The harness does not silently apply approximate floating-point tolerances. An arbitrary adapter must supply finite JSON output; undefined, NaN, Infinity and other data types fail.

Every all-phase failure disables `eligibleForTiming` for that case/engine. A summary may retain valid-only descriptive statistics to diagnose failures, but those statistics are **not an eligible comparison**. Expected error checks and preflight unsupported cases have no performance statistics. Partial unsupported coverage exits zero unless `--strict-coverage`; a run with zero eligible executions always exits nonzero while retaining its receipt; invalid cells always exit nonzero. Source drift also exits nonzero and disables all timing eligibility.

The parent worker watchdog is a fail-safe, not a measured runtime timeout. A kill loses in-worker partial trace; the row explicitly records `traceComplete:false`, null duration and an invalid outcome. Before hard termination the host requests cooperative cancellation/disposal with a bounded 1-second grace period; this extra cleanup time is outside sample timing. The next invocation starts a new worker. Such a cell is ineligible regardless of subsequent success.

## Artifacts

Default artifacts are written under the caller\'s cwd/results. Source Git metadata is null for installed dependency files not tracked in their containing repository; consumer commits are not reported as benchmark commits. Source plugins supply programs only, preserve fixture/oracle contracts, and participate in source drift checks. Explicit client `implementationFiles` extend the entry-file provenance scope.

- `*.json`: format, completeness, command config, git HEAD/dirty status, host metadata, adapter metadata, benchmark source/lock hashes, case/source/fixture/oracle hashes, full values/traces and summaries.
- `*.json.samples.jsonl`: append-only per-invocation records written during execution; contains eligibility rows too.
- `*.json.md`: readable descriptive summary.

Output paths are reserved without overwrite before timing. An interrupted run leaves an incomplete receipt and its sample journal. `complete:true` means the schedule finished, **not** that all correctness gates passed. Check counts and per-cell eligibility. Existing default `latest.json` remains the previous completed run until another default-path run finishes.

Fixture exports include full inputs, planned responses/errors/dependencies, source variants and expected outputs. Runtime receipts keep fixture hashes and full call traces; reproduce fixture contents from the seed and matching implementation, or export them first.

The implementation and available lockfile hashes are compared before/after a campaign. npm omits `package-lock.json` from tarballs, so its hash is explicitly `null` when absent; missing executable source files still fail. Lockfile appearance or disappearance during execution is source drift. Use a source checkout with its recorded lockfile for pinned dependency studies. Configured target JSON and resolved extension entry files are also hashed; imported extension submodules are not recursively fingerprinted. This is not a hash of every transitive package's installed bytes or the OS kernel. Package versions and the lockfile identify dependencies; reinstall with `npm ci` for a clean reproduction. Dirty runs are labelled, not claimed to be contained in their git HEAD.

## Interpretation

Use paired case-level results with identical inputs and capable runtimes. No workload-frequency weights, aggregate league table, auto-routing crossover, causal attribution or speedup ratio is supplied. Differences include lifecycle, parser, bridge, data contract and policy—not just VM instructions.

Nearest-rank p95 at low n is often the maximum. Smoke runs verify execution only, not statistical superiority. For a publication study add independent rounds/process-cold measurements, host power/thermal controls, uncertainty analysis and a measured target workload distribution. Memory profiling must be a separate lane so observers do not contaminate latency.

Expected-error probes are not a security audit. Trusted custom adapters execute unrestricted host ESM. Node VM and the Python example are not safe for hostile code.
