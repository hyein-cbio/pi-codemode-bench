# Continuous integration

The repository has one JavaScript/TypeScript npm project. Node.js 22.23.4 is
used by both CI execution environments; the package supports Node >=22.19.0.
The Python files under `ci/` are CI infrastructure, not a separate product.
There is no build script or general lint script. The repository language gate
is `npm run check:language`. No database or product API key is needed.

## Execution paths

- GitHub Actions dispatches Ubuntu checks to Modal. The GitHub runner installs
  Python and the pinned Modal SDK, packages source, waits, and reports status.
  It does not install npm dependencies or run the Node tests locally.
- CircleCI runs macOS checks directly on an Apple silicon VM. It uses Xcode
  26.4.1 as the macOS image selector and `m4pro.medium` as the resource class.
- Both execute the full Node test suite, the language gate, and
  `npm run bench:demo -- --out=results/ci-demo.json`, followed by the existing
  allowlisted summary generator. Optional external-target integrations still
  skip unless explicitly configured; CI does not install those targets.
- Modal also runs `npm run test:pack` on the local tarball to check consumer
  TypeScript resolution and optional peers. The published-version check is a
  separate step in the [release checklist](RELEASING.md).
- Neither path deploys or publishes a package. Neither publishes raw receipts.
  CI demo timings are conformance evidence, not comparable product benchmarks.

## Event policy

Both providers validate the following events:

| Event | Validation |
| --- | --- |
| Push to main, including a PR merge | Run |
| Same-repository PR opened, including a draft PR | Run |
| Additional commit on an open same-repository PR | Run |
| Same-repository PR reopened | Run |
| Fork PR opened, updated, or reopened | Do not run |
| Push to another branch without a PR | Do not run |
| Automatic tag push | Do not run |
| Manual execution | Run the selected ref |

PRs may target any branch; only push events are restricted to main. A fork PR
merged into main still triggers main validation, because the merged code is
now part of the repository. There is no separate PR-merged trigger: it would
duplicate the main-push check. Closing an unmerged PR or marking a draft ready
for review does not trigger another run. No bot-specific upstream workflow is
added by this policy.

GitHub explicitly selects `opened`, `synchronize`, and `reopened` and keeps
the same-repository job guard. CircleCI uses the GitHub App combined preset
`only-build-prs` (UI: **PR opened or pushed to, default branch and tag pushes**).
Its server rules select default-branch/tag push events and exactly those three
PR actions. The workflow expression matches the push event ref
`refs/heads/main`, rejecting automatic tags and non-main pushes while retaining
API/manual runs. It does not assume optional checkout branch/tag metadata is
populated or represented as an empty string. Fork exclusion is provided by
the GitHub App integration, not by a secret-bearing checkout or shell script.

## GitHub and Modal setup

1. Add `MODAL_TOKEN_ID` and `MODAL_TOKEN_SECRET` as GitHub repository or
   organization Actions secrets. No secret values belong in repository files.
   Use a dedicated, minimally privileged Modal workspace/token for CI.
2. Push to main or open/update/reopen an internal PR. Manual dispatch is enabled
   once the workflow exists on the default branch; select the desired ref.
3. Confirm the `Ubuntu validation (Modal)` check completes, including the remote
   test result. Image builds, remote failures, timeout, and dispatcher errors fail
   the job; merely starting a Sandbox is not success.

The implementation follows the single-app and separately cached dependency
pattern in `cloudroom-mcp/ci/modal_ci.py`. Unlike that project's Debian image,
this repository explicitly uses Ubuntu 24.04, with a checksum-verified Node
binary. One ephemeral Modal app owns one credential-free Sandbox per run.
The Sandbox has a 10-minute lifetime; the GitHub dispatcher has a 20-minute
timeout to allow the first image build. There are no automatic retries.

The dispatcher uploads a Git bundle of committed HEAD and its ancestry, plus
the committed package metadata for dependency caching. It never copies the
local `.git/config`, Git credentials, ignored files, untracked files, local
`node_modules`, or local receipts. Committed history is uploaded intentionally:
public evidence tests need historical source blobs. A shallow checkout or
tracked working-tree changes are rejected. This also works from linked
worktrees without copying their Git administrative directories.

The full GitHub checkout uses `persist-credentials: false`. Modal credentials
are scoped to the invocation step and are not passed to the Sandbox. The
dispatcher itself is trusted code: writers who can edit a same-repository CI
branch can edit it, just as they can edit an Actions workflow. Review workflow
and `ci/` changes accordingly. Do not run untrusted code on the credentialed
dispatcher.

Fork PRs skip the Modal job because GitHub does not provide its secrets. Do not
use `pull_request_target` to execute fork code with those secrets. A skipped
check is not evidence of Ubuntu validation; maintainers must arrange a trusted
internal-branch run before accepting an external contribution.

For a local remote run, first commit the intended source, then run from the root:

```sh
python3 -m venv results/modal-venv
results/modal-venv/bin/pip install -r ci/requirements.txt
# Authenticate with Modal separately; do not put tokens in this command.
results/modal-venv/bin/python ci/modal_ci.py
```

This starts billable remote resources. Dependency image layers are reused;
source changes do not invalidate the npm installation layer.

## CircleCI setup

1. Connect `hyein-cbio/pi-codemode-bench` to the CircleCI GitHub App in the
   intended organization.
2. In Project Settings / Project Setup, use this repository as both config and
   checkout source, with `.circleci/config.yml` as the config path. Do not pin
   checkout to the default branch instead of the triggering revision.
3. Use one GitHub App trigger with the **PR opened or pushed to, default branch
   and tag pushes** preset (CLI: `only-build-prs`). Replace the old `All pushes`
   trigger; do not keep it or add separate default-branch/PR-merged triggers.
   The workflow expression suppresses automatic tag and non-main push events.
   Confirm your plan permits the selected macOS image/resource class and has
   credits available.
4. Enable VCS status updates or CircleCI GitHub Checks. Run a branch pipeline
   and confirm the macOS result appears on its commit/PR.
5. Only after both providers have reported real results, select the actual
   Ubuntu and CircleCI macOS check names in GitHub branch protection/rulesets.
   Remove the retired GitHub `validate (ubuntu-latest)` and
   `validate (macos-latest)` requirements if present.

CircleCI caches only npm's download cache using a lockfile checksum and
OS/architecture/runtime prefix. It always runs `npm ci --ignore-scripts`.
The Xcode image provides Python for the Python example and offline CI tests;
no Homebrew/apt installation is required in the job.

Smarter Testing uses one `node tests` suite over the same `test/*.test.mjs`
files as `npm test`, with concurrency 1. No suite `options`, impact analysis,
dynamic splitting, dynamic parallelism, or automatic rerun is enabled.
The JUnit reporter emits only relative test-file paths, file-local ordinal
labels, timing, and fixed failure messages. It omits stack traces, stdout and
benchmark payloads. Only `test-reports/` is uploaded as test results, not
`results/` or the workspace. Use job logs for detailed failure diagnostics.

Validate locally after installing dependencies and the CircleCI CLI:

```sh
circleci extension install testsuite
circleci testsuite doctor "node tests"
circleci testsuite run "node tests"
circleci config validate
npm run check:language
npm test
```

Local validation is not evidence of a successful hosted pipeline. Check the
CircleCI Tests tab after the first hosted run for all discovered test files.
The GitHub App trigger does not automatically run fork PRs; establish an
explicit external-contributor policy before making this check mandatory.
GitHub PR runs validate the synthetic merge commit, while CircleCI may validate
the branch head. Merge-result or merge-queue coverage must be configured
separately if required.
