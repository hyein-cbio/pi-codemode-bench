import { relative } from "node:path";

// Publish only relative test-file identities, ordinal labels and timing.
// Failure stacks, stdout, return values and raw benchmark receipts stay local.
export default async function* junitReporter(events) {
  const ordinals = new Map();
  yield '<?xml version="1.0" encoding="UTF-8"?>\n<testsuites>\n<testsuite name="node tests">\n';
  for await (const { type, data } of events) {
    if (!["test:pass", "test:fail"].includes(type) || data.details?.type === "suite") continue;
    const file = relative(process.cwd(), data.file ?? "").replaceAll("\\", "/");
    if (!/^test\/[a-zA-Z0-9_-]+\.test\.mjs$/.test(file)) {
      throw new Error("JUnit result has an unexpected test file");
    }
    const ordinal = (ordinals.get(file) ?? 0) + 1;
    ordinals.set(file, ordinal);
    const duration = data.details?.duration_ms;
    const seconds = Number.isFinite(duration) && duration >= 0 ? duration / 1000 : 0;
    yield `  <testcase name="test-${ordinal}" classname="${file}" file="${file}" time="${seconds}">`;
    if (type === "test:fail") yield '<failure message="Test failed">Inspect the CI job logs.</failure>';
    else if (data.skip || data.todo) yield "<skipped/>";
    yield "</testcase>\n";
  }
  yield "</testsuite>\n</testsuites>\n";
}
