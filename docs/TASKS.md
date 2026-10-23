# Offline source-generation tasks

Eight prompts in `corpus/tasks.mjs` are derived from the same registry as replay benchmarks:

| Task | Case | Required work |
|---|---|---|
| compute | even-squares-10 | zero-call integer reduction |
| read-reduce | read-reduce | one read, signed integer reduction |
| config-summary | config-summary | one read, JSON projection |
| parallel-context | parallel-context | two overlapping reads, TODO line counts |
| find-then-read | find-then-read | discover → choose sorted path → read |
| optional-context | optional-context | three reads, one missing, no retry |
| json-summary | json-records-8k-x1 | one read/parse, complete eight-group aggregation |
| context-triage | context-triage | two reads, classify and prioritize line findings |

`node tasks.mjs --list` or `--export=path.json` emits prompts and the public tool contract, **without reference scripts or expected outputs**. Export parent directories must exist. The benchmark corpus export is different: it intentionally includes solutions/oracles for reproducibility; do not provide that export to a model you are evaluating.

Generate a JavaScript async-function body separately, save it locally, then grade:

```sh
node tasks.mjs --task=config-summary --candidate=answer.js --engine=pi
node tasks.mjs --task=config-summary --candidate=answer.js --engine=opencode
```

No Markdown fences. Return one JSON-safe value; do not print console/text output. `tools.read({path})` returns string fixture content, `tools.list({glob})` returns paths. Calls outside the planned exact allowlist reject. No real filesystem access is granted.

The grader uses the **same output and call contracts**, deadline and parent watchdog as replay. A correct constant answer with missing reads fails. Exit code is nonzero on invalid source/execution/output/calls. It prints source hash, runtime metadata, output, trace and execution timing.

`generationMs`, `tokens` and `costUsd` are **null**, not zero-cost live measurements. This repository does not call a model, read auth, retry generation or estimate usage. Prompt delivery/provider billing/repair policy are the caller's responsibility and are not implemented here.

## Limits of grading

Fixed-input correctness is not hidden-test generalization, model hallucination attribution or autonomous task completion. Internal parse count cannot be proven from the host call trace; the reference parses once and the prompt asks for it, but an arbitrary candidate's internal algorithm is not instrumented. Likewise output-only checks cannot prove a candidate's reasoning.

Runtime time excludes model generation, prompt setup and report writing. Compare model-generated programs only after separately retaining model/config/prompt versions, each attempt, generation/repair latency, usage and costs exactly once. Do not pass replay reference scripts as model output and claim live accuracy.

Only Pi/OpenCode are accepted by the candidate grader. Node/Python trusted reference controls are intentionally not exposed to arbitrary generated source through this CLI. This restriction is a safety boundary, not a security certification of either interpreter.
