# Optional Pi-hosted tool targets

This is one optional host binding of the [implementation-neutral target contract](TARGETS.md). Use `kind:"pi-tool"` to select **actual registered Pi tools**, not names assigned to direct runtime comparators.

`examples/targets/pi.json` selects built-in `codemode`. The separate optional `examples/targets/pi-opencode.json` selects `codemode_o` from an existing sibling `pi-opencode-mode/index.js`. This does not install the extension into Pi. A local checkout with installed dependencies is sufficient. No personal Pi settings, global package list, auth or context files are automatically loaded.

## Config schema (version 1)

```json
{
  "version": 1,
  "targets": [
    {
      "id": "codemode_o",
      "kind": "pi-tool",
      "tool": "codemode_o",
      "extensions": ["../pi-opencode-mode/index.js"],
      "language": "javascript",
      "capabilities": ["tools"],
      "inputKey": "code",
      "input": {},
      "resultFormat": "json-text",
      "sourceOptions": false,
      "maxToolCalls": 64
    }
  ]
}
```

| Field | Meaning/default |
|---|---|
| `id` | Unique receipt/selection ID; defaults to `tool`. It does not rename the registered tool. |
| `kind` | Use `pi-tool` explicitly. Legacy configs without `kind`/`adapter` still infer this variant. |
| `tool` | Exact registered tool name to dispatch, e.g. `codemode_o`. No fallback. |
| `extensions` | Explicit local extension entry files or package directories. `builtin:codemode` is the only special built-in token. At least one is required. |
| `sdk` | Optional local Pi SDK package directory (containing `package.json` and `dist/index.js`). Defaults to the repo's pinned Pi **1.0.0**, not the globally installed Pi CLI. |
| `language` | Case source key, default `javascript`. |
| `capabilities` | Declared eligibility, default `["tools"]`. Include `classes`, `deep-json`, `per-call-deadline` only when supported. |
| `inputKey` | Property receiving source code, default `code`. |
| `input` | Additional fixed JSON arguments. Must not contain `inputKey`. |
| `resultFormat` | `json-text` (default), `pi-codemode`, or `structured`. |
| `sourceOptions` | Prepend Pi's `// @options: {"timeout_ms":N}` line. Default false; requires JavaScript. Only use for a tool supporting this convention. |
| `maxToolCalls` | Optional declared product quota; cases with a larger required plan are unsupported, not truncated or rerun. This does **not** override runtime limits. |

For `tool:"codemode"` with `builtin:codemode`, defaults specialize to the Pi result format, source options, and supported capabilities. No other tool name gets special dispatch logic.

Relative extension and SDK paths resolve against the **config file's directory**, regardless of shell cwd. Absolute local paths are also allowed. Package specs (`npm:`, `git:`), URLs and `~` are rejected to avoid implicit installation/ambiguous expansion. Provide resolved paths to already-installed packages. Unknown keys, duplicate IDs, missing paths and conflicting CLI selection mechanisms fail early.

A direct-runtime control can be declared explicitly:

```json
{ "id": "raw-opencode", "kind": "runtime", "engine": "opencode" }
```

Built-in engines are `pi`, `opencode`, or `node`. Alternatively use `{id:"custom",kind:"runtime",adapter:"./runtime.mjs",options:{}}` for a local ESM runtime. Specify an engine or adapter, never both. These controls do not call registered Pi tools.

## CLI behavior

- No engines or tools are selected by default. `--config=...` selects explicit targets; combining it with `--engines` or `--adapter` is an error.
- `--targets=codemode_o` selects IDs from the config. Omit it to run every configured target. Unknown/duplicate IDs fail.
- `--list-targets` prints normalized config and paths **without loading or executing extensions**.
- Existing case/set/tier/tag/seed/warmup/sample/source-mode/output flags still apply.
- No config is auto-discovered. The user must explicitly opt into loading these trusted local extensions.
- `bench.config.local.json` is ignored by git for machine-local paths.

## Actual tool path and clock

The adapter loads the requested SDK, creates a disposable directory, uses in-memory session/settings and an offline model descriptor, and loads **only explicit extensions** plus fixture tools. It checks that exactly one loaded extension owns the requested root tool, and that the tool is active.

A scripted assistant message requests that exact tool with the configured input. Pi performs the real top-level dispatch, schema validation, hooks, nested `ctx.executeTool` calls and result creation. A second scripted message ends the turn. A third unexpected continuation is refused. There is no real model call and no direct-runtime fallback.

Each invocation creates and disposes a fresh session; personal resources are never discovered. Only the root `tool_execution_start → tool_execution_end` interval is timed. Session preparation, extension loading, scripted model turns and shutdown are excluded. Compare this clock separately from direct-runtime setup+execute timings.

Receipts identify `engines[].kind:"pi-tool"`, `toolName`, target config, SDK version, extension entry hashes and `clock`. Each completed row includes `toolAudit`: root ID/name, actual input hash (including any added options), scripted-turn count, zero live-model requests and Pi's nested-call audit. The independent fixture trace remains the full correctness gate; Pi's own audit may be bounded.

Config bytes and resolved extension entry files participate in before/after drift checks. Hashes do not recursively fingerprint all files imported by extensions or every SDK dependency. Keep extension lockfiles/revisions fixed for reproducible studies. The full-corpus result from the direct-runtime mode does not certify a tool extension with a different quota.

## Output and deadline contracts

- `json-text`: concatenate text blocks and parse **one complete JSON value**. Logs mixed with data fail parsing; quoted strings remain strings.
- `pi-codemode`: require the standard Pi completion header and exactly one returned text item; parse JSON when possible, otherwise retain text. Pi's plain string rendering cannot distinguish all JSON-looking string values; use a structured wrapper for such future cases.
- `structured`: require top-level `structuredContent` from the root `tool_execution_end` result. Transcript messages omit that field, so they are used only for the nested-call audit.
- Decode failures and caller cancellation are adapter failures, never expected guest-error passes, even if their diagnostic happens to match an expected error pattern.
- `isError`, `details.ok:false`, truncation and warnings are retained; warnings/truncation invalidate speed eligibility.
- The adapter requests session cancellation shortly after the case deadline if the root has not finished. Such a caller abort is **not** a successful product deadline test.
- The parent watchdog still kills an unresponsive worker and marks it invalid. Session setup is outside the measured root interval but inside the watchdog allowance; excessively slow setup can therefore invalidate a run.
- Trusted extension code can open files/network/processes independently of fixture tools. This harness is **not an OS sandbox**, and it cannot guarantee cleanup of arbitrary extension subprocesses when the worker must be killed.

## pi-opencode-mode eligibility

The inspected local extension uses fresh OpenCode runtimes, a 30s product interruption timeout, 64 tool calls and a 65,536-byte final-output cap. The example declares only the supported capabilities and call budget; it does not mutate those limits.

For all 76 cases, the optional configured built-in `codemode` is eligible for 76 and the optional configured `codemode_o` for 71. The five unsupported extension cells are class syntax, depth-40 JSON, two 128-call cases and the per-call deadline control. Failures of other eligible cases remain invalid outcomes rather than being converted to skips.

## Tests

```sh
npm run test:targets
PI_BENCH_OPENCODE_EXTENSION=../pi-opencode-mode/index.js npm run test:targets
```

The normal suite uses a test-only extension to verify arbitrary tool names, input keys, real nested-call audit, missing-tool failures, config-relative paths, strict decoding and CLI selection. The unrestricted evaluator in that test fixture is **not** a production adapter. The optional test loads an explicitly supplied existing `pi-opencode-mode`; it never installs or discovers one automatically.
