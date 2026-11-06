import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import junitReporter from "../ci/junit-reporter.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const python = spawnSync("python3", ["--version"]).status === 0;

test("Modal dispatcher offline regression tests", { skip: !python && "Requires python3", timeout: 30000 }, () => {
  const result = spawnSync("python3", ["-m", "unittest", "discover", "-s", "ci", "-p", "test_*.py"],
    { cwd: root, encoding: "utf8", timeout: 25000 });
  assert.equal(result.status, 0, result.stderr || result.error?.message);
});

test("CI JUnit includes test-file atoms but no private payloads or absolute paths", async () => {
  const data = { file: join(root, "test/fixtures.test.mjs"), name: "do-not-publish",
    details: { duration_ms: 12, error: new Error("do-not-publish") } };
  const events = [
    { type: "test:stdout", data: { message: "do-not-publish" } },
    { type: "test:pass", data },
    { type: "test:fail", data },
    { type: "test:pass", data: { ...data, skip: "do-not-publish" } },
    { type: "test:pass", data: { ...data, details: { type: "suite" } } },
  ];
  let xml = "";
  for await (const chunk of junitReporter(events)) xml += chunk;
  assert.match(xml, /<testsuites>\n<testsuite name="node tests">/);
  assert.match(xml, /<\/testsuite>\n<\/testsuites>/);
  assert.equal((xml.match(/<testcase /g) ?? []).length, 3);
  assert.match(xml, /file="test\/fixtures.test.mjs"/);
  assert.match(xml, /name="test-2"/);
  assert.match(xml, /time="0.012"/);
  assert.match(xml, /<failure message="Test failed">/);
  assert.match(xml, /<skipped\/>/);
  assert.equal(xml.includes(root), false);
  assert.equal(xml.includes("do-not-publish"), false);
});

test("CI JUnit rejects results outside the discovered test-file domain", async () => {
  await assert.rejects(async () => {
    for await (const chunk of junitReporter([{ type: "test:pass",
      data: { file: "/tmp/private.mjs", details: {} } }])) void chunk;
  }, /unexpected test file/);
});

test("CI event policy selects main pushes, own PR lifecycle events and manual runs", async () => {
  const workflow = await readFile(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
  assert.match(workflow, /on:\n  push:\n    branches: \[main\]\n  pull_request:\n    types: \[opened, synchronize, reopened\]\n  workflow_dispatch:/);
  const githubCondition = workflow.match(/^    if: (.+)$/m)[1];
  assert.equal(githubCondition, "github.event_name != 'pull_request' || github.event.pull_request.head.repo.full_name == github.repository");
  for (const own of [true, false]) {
    for (const action of ["opened", "synchronize", "reopened"]) {
      const github = { event_name: "pull_request", repository: "owner/repo",
        event: { action, pull_request: { head: { repo: { full_name: own ? "owner/repo" : "fork/repo" } } } } };
      assert.equal(runInNewContext(githubCondition, { github }), own, `${action}: own=${own}`);
    }
  }
  const circle = await readFile(new URL("../.circleci/config.yml", import.meta.url), "utf8");
  const expression = circle.match(/    when: >-\n((?:      .*\n)+)    jobs:/)[1].trim().replace(/\s+/g, " ");
  assert.equal(expression, 'pipeline.event.name == "api" or (pipeline.event.name == "push" and pipeline.event.github.ref == "refs/heads/main") or (pipeline.event.name == "pull_request" and (pipeline.event.action == "opened" or pipeline.event.action == "synchronize" or pipeline.event.action == "reopened"))');
  // This expression uses only string comparisons, conjunctions and disjunctions.
  // Check its truth table locally; CircleCI validation checks the real grammar.
  const predicate = expression.replace(/\band\b/g, "&&").replace(/\bor\b/g, "||");
  for (const [event, action, ref, expected] of [
    ["push", "push", "refs/heads/main", true],
    ["push", "push", "refs/heads/feature", false],
    ["push", "push", "refs/tags/v1", false],
    ["push", "push", "refs/tags/main", false],
    ["push", "push", "", false],
    ["pull_request", "opened", undefined, true],
    ["pull_request", "synchronize", undefined, true],
    ["pull_request", "reopened", undefined, true],
    ["pull_request", "closed", undefined, false],
    ["pull_request", "ready_for_review", undefined, false],
    ["api", "api", undefined, true],
    ["schedule", "schedule", undefined, false],
  ]) {
    // Do not assume a branch checkout gives an empty string for pipeline.git.tag.
    // Real push compilation skipped main with the old checkout-metadata guard.
    const pipeline = { event: { name: event, action, github: { ref } } };
    assert.equal(runInNewContext(predicate, { pipeline }), expected, JSON.stringify(pipeline));
  }
  // Fork PR events never reach GitHub App pipelines; that integration guarantee
  // is separate from the workflow expression and cannot be simulated locally.
});

test("CI routing preserves macOS-only CircleCI and credential-scoped Modal dispatch", async () => {
  const workflow = await readFile(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
  assert.match(workflow, /persist-credentials: false/);
  assert.match(workflow, /head.repo.full_name == github.repository/);
  assert.match(workflow, /python ci\/modal_ci.py/);
  assert.equal(workflow.includes("actions/setup-node"), false);
  assert.equal(workflow.includes("- run: npm"), false);
  const circle = await readFile(new URL("../.circleci/config.yml", import.meta.url), "utf8");
  assert.match(circle, /macos:\n\s+xcode:/);
  assert.equal(circle.includes("docker:"), false);
  assert.match(circle, /circleci testsuite run "node tests"/);
  assert.match(circle, /checksum "package-lock.json"/);
  assert.match(circle, /npm ci --ignore-scripts/);
  const modal = await readFile(new URL("../ci/modal_ci.py", import.meta.url), "utf8");
  const version = modal.match(/NODE_VERSION = "([0-9.]+)"/)[1];
  assert.ok(circle.includes(`node-version: "${version}"`));
  const suite = await readFile(new URL("../.circleci/test-suites.yml", import.meta.url), "utf8");
  assert.equal(suite.includes("options:"), false);
  assert.match(suite, /<< test.atoms >>/);
  assert.match(suite, /<< outputs.junit >>/);
});
