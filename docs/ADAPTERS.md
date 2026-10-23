# Connection and runtime adapters

The registry and oracle are language-neutral JSON. Sources are language-specific. No adapter or tool is selected automatically.

## Generic tool clients — primary integration

Use `kind:"tool"` in config and provide a local module exporting `createToolClient`. The core forwards the exact configured tool name and input to `callTool`, measures its duration, and applies the shared correctness gates. This path does not import Pi/OpenCode packages. See [the host-neutral client contract](TARGETS.md).

## Optional Pi host binding

Use `kind:"pi-tool"` only for tools registered inside Pi. Specify `tool`, explicit local `extensions`, and input/result/capability fields. No extension installation or runtime fallback is performed. See [Pi binding details](PI_TOOL_TARGETS.md). `pi-opencode-mode` is one optional example, not a requirement.

## Direct-runtime controls

Built-in controls are selected explicitly with `--engines=pi,opencode,node`. All campaigns use `Engine`, `runCases` and `summarizeRows`; the duplicated pre-release `measure`/`receiptFrom` API has been removed. Runtime factories remain in `adapters/builtin.mjs`. Pi/OpenCode imports are lazy and their packages are development dependencies. `adapters/node-vm.mjs` has no vendor dependencies. The ESM interface below is for runtime integrations without a registered-tool API.

## ESM interface

Pass a **trusted local** module with `--adapter=./my-adapter.mjs`. It exports:

```js
export async function createAdapter({ options }) {
  return {
    name: "unique-engine-name",
    language: "javascript", // key in case.sources
    version: "pinned version",
    capabilities: ["tools"], // optionally "classes", "deep-json", "per-call-deadline"
    lifecycle: "Describe reuse, startup and security boundaries",
    async execute(code, { fixture, timeoutMs, signal }) {
      // Bind each name in fixture.names to:
      //   args => fixture.call(name, args, abortSignal)
      // Measure runtime setup + execution, not oracle validation.
      return { ok: true, value: 123, ms: 1.0 };
      // Guest error: { ok: false, error: "runtime diagnostic", ms: 1.0 }
      // Throw for transport/decoding failures, or return transportError: true.
      // Optional: truncated: boolean, warnings: array
    },
  };
}
```

The runner owns the fixture. It supplies only this case's authorized tools; no host filesystem/network tools are inherited. Tool args/results must be JSON-safe copies. A rejection must become a guest exception rather than a plausible value. Bind real runtime cancellation to the fixture's AbortSignal. The host oracle validates all dispatched calls, so returning a known answer without required calls fails.

The module is loaded once inside a dedicated worker; each execution receives a new fixture. Built-in adapters create fresh guest runtimes per call. Custom adapters must disclose their own policy. Adapters must keep executions isolated, clean up their resources and return a finite nonnegative millisecond duration. Implement `dispose()` for owned resources; normal/cooperative shutdown awaits it for up to 1 second before terminating the worker. Host cancellation is delivered through `signal`; runtime deadlines remain the adapter\'s own responsibility. Parent watchdog termination cannot promise to kill arbitrary adapter-owned subprocess trees.

No source for a language, or a missing declared capability, yields an explicit unsupported cell. Tools are an implicit requirement for any nonempty fixture plan. No fallback to a different engine/source is performed. Duplicate adapter names are rejected.

For another language, provide a source plugin with equivalent programs and optional fresh-source comment syntax. Preserve all calls and output semantics; do not move guest aggregation into the host. No core/corpus edits are required. JSON config accepts custom runtime modules via `kind:"runtime", adapter:"./runtime.mjs"` as well as tool clients. See [the external integration guide](EXTENDING.md).

## Python examples

The complete callback example is `examples/targets/python.json`, with 6 source variants, a real JSONL bridge, concurrent fixture calls, error propagation and cancellation/deadline handling. Its reusable transport and wire protocol are documented in [EXTENDING.md](EXTENDING.md). This is a conformance subset, not full Python parity.

The older pure-compute control remains available:

```sh
node bench.mjs --cases=even-squares-10 --engines=none \
  --adapter=./examples/python-adapter.mjs --samples=3 --warmup=1
```

Requires `python3` on PATH. Uses Python isolated mode and JSON stdin/stdout, a subprocess timeout and bounded output. It supports only pure computation; the example has no host tool bridge. The corpus also contains an illustrative Python read-reduce source, but this adapter cannot run it and declares it unsupported. A Luau arithmetic source is provided as a starting point; **no Luau runtime binary is bundled or claimed tested here**.

Python isolated mode and Node VM are not OS sandboxes. Only run trusted fixed sources on them. The Pi/OpenCode adapters expose only controlled fixtures, but their inclusion here is not independent certification of their sandbox security.

## Adding a case

1. Add a factory in `corpus/` using `define`, stable name and suite.
2. Build deterministic input from the recorded seed; calculate an independent oracle outside the guest.
3. List exact tool signatures and raw responses in `plan`. Use `after:[indices]` for dependencies, `error` for planned failures and `waitMs` only as an explicitly labelled wait control.
4. Provide a reference source per supported language, not a translated result or host aggregation shortcut.
5. Specify concurrency bounds only when the case has enough host wait to make overlap observable.
6. Add golden/metamorphic/negative checks. Run all eligible adapters; retain unsupported cells.
7. Update counts/documentation and run `npm test`.

In-memory fixtures intentionally avoid repository writes and personal config. A future actual-I/O adapter should be a separate measured lane with explicit snapshot, authorization, cleanup and timing contracts.
