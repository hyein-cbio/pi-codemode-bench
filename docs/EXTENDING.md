# Standalone use and foreign-language integrations

The host requires Node 22.19+. Pi/OpenCode and the target interpreter are not bundled runtime requirements of the generic core. Install your own interpreter or trusted backend separately. For the 0.1.0 registry release, install `pi-codemode-bench@0.1.0`. A locally produced npm tarball is an alternative.

## Consume from another project

In the consumer project:

```sh
npm install pi-codemode-bench@0.1.0
# Or create a tarball from a source checkout with npm pack --ignore-scripts,
# then install its actual path instead:
# npm install /path/to/pi-codemode-bench-0.1.0.tgz
npx --no-install codemode-bench --config=./targets.json --sets=all --check
npx --no-install codemode-bench --config=./targets.json --sets=short
```

The installed CLI is `codemode-bench`. Default receipts and `latest.json` live under **the caller's cwd/results**, never inside the installed package. `--out` remains an explicit override. The package's own source Git metadata is recorded only when its source files are tracked; an unrelated consumer repository is not used as the benchmark revision. `benchmark.name/version` and implementation hashes still identify tarball runs.

Use the public ESM API without process exit-code side effects:

```js
import { runBenchmark } from "pi-codemode-bench";

const controller = new AbortController();
const result = await runBenchmark([
  "--config=./targets.json", "--sets=short", "--warmup=1", "--samples=3"
], { signal: controller.signal, log: console.log });
// Inspect result.counts and result.sourceDrift for a completed receipt.
// --check returns a CoverageReport; listing/export/help return undefined.
```

No settings, credentials, interpreters or adapters are auto-discovered. `--check` initializes the selected clients to inspect metadata but executes no guest programs. Extensions and source factories are trusted host code and can have side effects even during preflight. Check output includes eligible counts and all unsupported reasons. A run with zero eligible executions exits nonzero, while preserving its unsupported receipt. `--strict-coverage` additionally fails partial coverage.

## Register sources without forking

A root config `sources` array resolves against the config file. Repeated `--sources=./file.mjs` paths resolve against cwd and are added to that list.

```json
{
  "version": 1,
  "sources": ["./ruby-sources.mjs"],
  "targets": [{
    "id": "ruby-tool", "kind": "tool", "tool": "run_ruby",
    "adapter": "./ruby-client.mjs", "language": "ruby", "capabilities": ["tools"]
  }]
}
```

```js
// ruby-sources.mjs
export function createSources({ seed, caseNames }) {
  return {
    language: "ruby",
    comment: { prefix: "#" },
    sources: {
      "even-squares-10": "(1..10).select(&:even?).sum { |n| n*n }"
    }
  };
}
```

Programs must follow your tool's own return convention. The example above supplies source only; it is not a bundled Ruby runtime or a claim of Ruby parity. Add variants incrementally and inspect coverage.

A factory may be async. It receives the deterministic seed and known case names, not mutable plans or oracles. It returns only `language`, `sources` and optional `comment`. Variants may replace bundled sources for that language, but duplicate assignments across plugins and unknown case names are errors. Nonempty code is required. Expected values, requirements, fixture responses and call plans cannot be changed through this interface. Plugin entry hashes and actual executed source hashes are retained; imported helper files are not recursively fingerprinted.

For fresh-source runs, `comment: {prefix, suffix?}` wraps the nonce before the original program. For example `{prefix:"/*", suffix:" */"}` supports block-comment languages. Newline characters in the wrapper are rejected. Bundled JS/Python/Luau defaults remain available. Unknown fresh syntax is rejected before sample reservation, rather than halfway through a campaign.

## Two host adapter interfaces

- A registered tool client exports `createToolClient({options, toolName})` and returns `callTool(name, input, {fixture, timeoutMs, signal})`.
- A direct runtime exports `createAdapter({options})` and returns `execute(code, context)`, including its measured `ms`. Add it to the same config as `{id:"my-runtime",kind:"runtime",adapter:"./runtime.mjs",options:{}}`. Do not specify both `engine` and `adapter`.

Both interfaces may implement async `dispose()`. The core awaits it on normal completion, API/CLI cancellation and cooperative watchdog shutdown. Cleanup is outside the sample clock and has a **1-second grace period** before worker termination; failure/timeout is not a successful clean shutdown. A worker that is synchronously stuck cannot run cleanup. There is no promise to reap arbitrary unmanaged grandchildren, remote jobs or independent side effects.

`signal` means **host cancellation**, not a successful guest deadline. Implement the requested runtime deadline using `timeoutMs`; never turn adapter cancellation or decoding failure into an expected guest-error pass. Throw for transport/decoding failures or set `transportError:true`. Preserve truncation and warnings. Finish/cancel fixture callbacks before returning. See [targets](TARGETS.md) and [runtime adapters](ADAPTERS.md).

Clients can declare absolute local `implementationFiles` paths for additional bridge/backend sources. These files participate in preflight and before/after drift checks, along with the adapter entry. This is explicit provenance, not automatic dependency-tree discovery. The Python example records its server file this way.

Public declarations in `index.d.ts` include `ToolClient`, `RuntimeAdapter`, their factory contexts, `SourceFactory`, `BenchmarkConfig`, `ExecutionContext`, coverage reports and receipt types. No TypeScript compiler or build step is needed at runtime.

## Working Python callback bridge

```sh
node bench.mjs --config=examples/targets/python.json --sets=all --check
node bench.mjs --config=examples/targets/python.json \
  --cases=even-squares-10,read-reduce,parallel-context,optional-context,explicit-error,deadline-loop \
  --source-mode=fresh --warmup=1 --samples=3
```

Requires `python3` on PATH; the Node core remains dependency-free. The example supports **6 cases**, not all 76: arithmetic, a real fixture read/reduction, overlapping reads, partial failure, guest error and a requested runtime deadline. Tests verify output, exact calls, actual overlap, error sentinels, deadline restart, cancellation and child-process disposal.

The reusable `createJsonlClient({command,args,maxRecordBytes?})` starts a trusted local subprocess. Initially its ready handshake is outside timing. Calls are serial; fixture callbacks within a call can overlap. A failed/deadline-killed backend is replaced on the next call, and that restart belongs to that call's clock. Restarted versions must match. The transport bounds each record (default 1 MiB), backend startup (5 seconds), and captured stderr; these are transport controls, not an OS sandbox.

Wire messages are newline-delimited JSON on stdin/stdout:

| Direction | Message |
|---|---|
| Backend → host | `{type:"ready",version:"backend version"}` once per process |
| Host → backend | `{type:"execute",executionId,name,input,tools}` where `tools` lists allowed fixture names |
| Backend → host | `{type:"tool",executionId,id,name,args}` with unique string callback IDs |
| Host → backend | `{type:"tool-result",executionId,id,ok,value?,error?}` |
| Backend → host | `{type:"result",executionId,ok,value?,error?,warnings?,truncated?}` |

Use the execute message\'s `tools` names to register backend bindings when your runtime lacks dynamic proxies; no oracle values or fixture responses are sent in advance. The host routes tool requests to the current allowlisted `fixture.call`, never to the real filesystem. IDs must match the active execution. Protocol failures are transport errors. Host cancellation aborts fixture callbacks and kills/reaps the owned backend; a runtime deadline is distinct. Do not write unframed guest logs to stdout. The Python server uses an async guest function, concurrent futures for callbacks, and JSON-safe values. It runs **trusted code only**, with host OS permissions.
