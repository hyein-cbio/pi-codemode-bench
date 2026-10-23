# Implementation-neutral codemode targets

The benchmark measures **configured code-execution tools**, not a mandatory Pi or OpenCode implementation. A compatible target accepts a program, can bind the required fixture calls, and returns an evaluable result. The corpus, oracle, call trace, schedule and report do not choose a vendor.

No execution target is selected automatically. Use `--config`, an explicit `--engines` control, or `--adapter`. Listing/exporting the corpus does not need an execution target.

## Three target kinds

| Kind | Connection | Purpose |
|---|---|---|
| `tool` | Local module implementing `createToolClient` / `callTool` | Host-neutral connection to any compatible tool |
| `pi-tool` | Explicit Pi SDK and local extensions | Optional binding for tools registered inside Pi |
| `runtime` | Explicit `pi`/`opencode`/`node` control or local `adapter` module | Direct runtime control, not a tool invocation |

The common client is not an automatic MCP/RPC implementation. A client module must actually connect to the chosen host, bind fixtures and normalize its response. This makes unsupported integration work explicit instead of silently substituting a local runtime.

## Generic config

```json
{
  "version": 1,
  "targets": [
    {
      "id": "implementation-a",
      "kind": "tool",
      "tool": "my_codemode",
      "adapter": "./my-tool-client.mjs",
      "language": "javascript",
      "capabilities": ["tools"],
      "inputKey": "code",
      "input": {},
      "options": {}
    }
  ]
}
```

- `id`: unique receipt/selection identifier; defaults to the tool name when it is a valid ID.
- `tool`: exact name forwarded to the client. No names, including `codemode_o`, are reserved or automatically routed.
- `adapter`: trusted local ESM file exporting `createToolClient`.
- `language`: source variant, default `javascript`.
- `capabilities`: explicitly supported requirements; defaults to **empty**, not inferred from the tool's name. Add `tools`, `classes`, `deep-json`, `per-call-deadline` only when supported.
- `inputKey`: source argument, default `code`. Fixed `input` fields are forwarded alongside it, and must not override it.
- `options`: JSON configuration passed to the client factory, not to the tool. Do not put secrets here: the config is retained in receipts. A trusted client may resolve credentials independently with explicit authorization.
- `maxToolCalls`: optional declared quota for preflight eligibility. It does not alter a tool's actual policy, and there is **no default 64-call limit**.

Relative paths resolve against the config file, not cwd. Unknown keys, duplicate IDs, URLs/package specs in local adapter paths and missing files are rejected. Nothing is installed or discovered automatically.

```sh
node bench.mjs --config=bench.config.local.json --list-targets
node bench.mjs --config=bench.config.local.json --targets=implementation-a --sets=workflow
```

`--config` and `--engines`/`--adapter` are alternative selectors and cannot be mixed. Put multiple `tool`, `pi-tool` or `runtime` targets in one JSON file when a comparison needs multiple paths.

Root `sources` entries add external language variants without editing the corpus. Runtime modules can also be configured as `{id:"runtime-a",kind:"runtime",adapter:"./runtime.mjs",options:{}}`. See [the extension walkthrough](EXTENDING.md).

## Client interface

```js
export async function createToolClient({ options, toolName }) {
  // Initialize the explicitly selected host connection outside the sample clock.
  // Return dispose() as well when the client owns resources.
  return {
    version: "actual backend version",
    lifecycle: "Describe reuse, sandbox and per-call startup",
    async callTool(name, input, { fixture, timeoutMs, signal }) {
      // Dispatch name + input through your host's actual tool API.
      // Bind fixture.names to (args, signal) => fixture.call(name, args, signal).
      // Preserve guest failures and cancellation; do not compute answers in the host.
      return { ok: true, value: /* complete JSON-safe result */ 123 };
      // Guest error: { ok: false, error: "runtime diagnostic" }
      // Also preserve truncated: boolean and warnings: array when present.
      // Throw for adapter/transport/decoding failures (always invalid),
      // or return { ok: false, transportError: true, error: "diagnostic" }.
    },
  };
}
```

The core measures `performance.now()` around the awaited `callTool`; a client's claimed `ms` is not trusted. The call receives the exact configured name, fixed args and generated source. Receipts retain tool name, argument hash, client module hash, target configuration and lifecycle. Generic clients do **not** imply zero external/model usage; that depends on the connection you implement.

The fixture is fresh per sample. All mandatory calls, statuses, dependencies and concurrency bounds must pass, in addition to the full output oracle. An external tool unable to bind fixture tools can run zero-call cases only; it must not claim `tools` capability. There is no fallback to another runtime if a dispatch fails.

A worker hosts one client; calls are serial. Host cancellation arrives through `signal`; optional `dispose()` is awaited on normal/cooperative shutdown outside timing, with a 1-second grace period before forced worker termination. Finish/cancel fixture work before returning. Synchronous hangs and unmanaged remote/grandchild resources cannot be guaranteed clean by the watchdog. Declare lifecycle boundaries and any extra absolute `implementationFiles` for drift checks. See [the lifecycle and JSONL contracts](EXTENDING.md).

## Dependency-free demonstration

`bench.config.example.json` uses `examples/node-tool-client.mjs`, a local registry containing the tool `run_script`. This demonstrates the protocol using a trusted Node VM; it is **not a claim to measure an external product**, nor a security sandbox.

```sh
npm run bench:demo
npm run test:core
```

Both work without Pi/OpenCode packages or `pi-opencode-mode`. Tests additionally copy the source to an isolated directory without `node_modules` and execute all 76 cases there. Replace the demo adapter/tool with your actual connection before drawing product performance conclusions.

Pi, OpenCode and Effect packages are development dependencies for optional integration tests and comparison adapters. Their versions remain pinned. Importing the generic harness does not load them.

## Optional implementation examples

- `examples/targets/pi.json`: Pi's registered `codemode`.
- `examples/targets/pi-opencode.json`: `codemode_o` from an explicitly installed local extension. Its path and quota are properties of **that example only**.
- [Pi binding details](PI_TOOL_TARGETS.md): SDK isolation, root tool-event timing, result formats and extension loading.
- [Direct ESM runtime adapters](ADAPTERS.md): language runtime integration without a registered tool.
- `--engines=pi,opencode,node`: explicit runtime controls; not interchangeable with tool-path measurements.

No optional example changes the core's workload definition or becomes an implicit target.
