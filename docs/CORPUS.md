# Corpus and difficulty axes

The registry is `corpus/index.mjs`; `node bench.mjs --sets=all --list` is the authoritative list. Every case has a stable name, suite, optional tier, source variants, expected value or expected error, fixture plan, seed, deadline, tags and provenance. Export exact inputs with `--export`.

## Main ladder

- **smoke (0)**: `even-squares-10`. A zero-call startup control, paired JavaScript/Python/Luau sources.
- **micro (1)**: the four remaining original arithmetic/array/object/string cases in `cases.mjs`.
- **short (1–2)**: `read-reduce`, `config-summary`, `parallel-context`, `optional-context`, `find-then-read`, `context-triage`; diagnostics at 8/64/256 rows with zero wait, plus 8-row 20/100ms wait controls. The last two deliberately isolate host waiting, not CPU.
- **workflow (3)**:
  - `cursor-pagination`: 37 records, five dependent pages, null terminal cursor, active-record filtering.
  - `join-topk`: two input tables, orphan foreign key, equal totals with explicit ID tie-breaking.
  - `retry-waves`: three four-wide waves, transient and permanent failures, selective single retries. Full args include attempt numbers.
  - `multi-file-etl`: dependent discovery, three reads, one malformed JSON file, complete aggregation of successful inputs.
- **apex (4)**:
  - `versioned-reconciliation`: 192 out-of-order events over 48 entities in 12 pages; highest-version selection and tombstones.
  - `fan-in-dag-64`: eight levels × eight nodes; each level consumes the entire previous level and cannot dispatch early.
  - `deep-roundtrip-64`: 64 dependent host round trips, nested data, accented Latin/emoji, null, empty arrays and false values.
- **stress (5)**: 100K/1M arithmetic; 12/32-dimensional matrix multiplication; 2,000-record stable sort; 256-node BFS; 40 generations × 100 allocated objects; 128 host calls at width 1/32.

These are deliberately bounded development-scale ceilings. They do **not** reproduce the reference repository's 100M loops, 878-call DAG, 300K sort or OS memory-pressure experiments.

## Orthogonal lanes

### JSON scale: 36 cells

Two shapes: small records (8-character filler) and string-heavy rows (512-character filler), both with unique ID prefixes. Six target payload sizes: 2/8/16/24/32/48 KiB. Only complete records fit; receipts contain actual bytes, UTF-16 units and row counts. Each case reads once, then parses the same string 1/4/16 times.

Every parse contributes to row count, active count, amount sum, all-note length and all eight sorted groups. The host oracle independently selects each group and uses BigInt summation for totals. Repeated parsing is a controlled load axis, **not a recommended optimization strategy**. Payloads are generated deterministically, not checked-in copies of upstream JSON files.

### Source size: 3 cells

`source-128`, `source-4096`, `source-32768` vary declarations and the final expression. Names are nominal construction targets, **not exact resulting byte lengths**. Actual source bytes, UTF-16 units, line counts and SHA-256 are reported. The oracle is a closed-form sum.

`--source-mode=fresh` adds unique comments and records each executed source hash. It tests source identity changes, not naturally generated model-source distributions.

### Capabilities: 3 cells

- `class-method`: native class syntax.
- `json-depth-40`: output nesting beyond OpenCode's documented 32-level data boundary.
- `unicode-json`: Accented Latin/emoji, null, false, zero and empty array preservation.

Pi/Node declare class/deep-JSON capabilities. OpenCode does not; those cells are preflight **unsupported**, not measured rejections. This is a declared eligibility matrix, not a complete language conformance suite.

### Limits: 2 cells

- `explicit-error`: exact benchmark error sentinel propagated.
- `deadline-loop`: infinite CPU loop with a 100ms runtime deadline; requires declared `per-call-deadline` support. A fixed-timeout tool extension is ineligible unless it supports this requested policy.

Expected error messages must match and all planned calls must still satisfy their contracts. Runtime errors here are successful *checks*, not successful workloads. No median/p95 is computed for them. The independent parent watchdog kills a non-cooperative worker at deadline + 2s and always marks it invalid.

No OOM probes, OS sandbox certification, 129-call product quota claims, actual MCP traffic, output-limit sweep or full AgentSession timing are implemented. Keep those as separate future lanes, rather than implying coverage from these two checks.

## Oracle and fixture separation

Guest algorithms are authored scripts; host oracles are computed before timing. Arithmetic/matrix use formulae, BFS uses a host dynamic program, reconciliation selects each entity independently, and JSON aggregation selects each group independently. Sorting necessarily uses a host sort with explicit key/ID ordering. Fixed fixture agreement is not proof for every input; multiple seeds add coverage but are not exhaustive property testing.

All fixture requests are allowlisted by exact name and JSON args. `after` indices encode completion dependencies; independent requests need not complete in a fixed wall-clock order. Fixture state resets for **every** cold, warmup and warm invocation.
