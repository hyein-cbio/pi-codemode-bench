# Maintainer release checklist

Repository visibility changes, Git pushes, GitHub Releases and npm publication are explicit maintainer actions. Local commits and tags do not publish anything. Keep `private: true` until the maintainer deliberately chooses npm distribution.

## 1. Verify the candidate

```sh
npm ci --ignore-scripts
npm run check:language
npm test
npm audit
npm audit --omit=dev
npm pack --dry-run --ignore-scripts
git diff --check
```

Run the optional actual-extension test with a trusted installed checkout; record any skipped tests. Verify Linux/macOS CI on the exact pushed candidate, not an earlier commit. Review Git history and public files for secrets, private paths and receipts. A pattern scan is not a complete security audit.

## 2. Establish a reproducible measurement source

Commit the reviewed source and dependency lockfile before timing. Use a clean checkout and a separately installed, clean, pinned `pi-opencode-mode` sibling checkout. Do not modify somebody else's dirty extension working tree. The comparison config expects these sibling directory names:

```text
workspace/
  pi-codemode-bench/
  pi-opencode-mode/
```

From the benchmark checkout, ensure `git status --porcelain` is empty, then run:

```sh
npm ci --ignore-scripts
npm run bench:example -- --out=results/release-comparison.json
node scripts/publish-example.mjs results/release-comparison.json benchmarks/results/new-release-comparison.json
```

Use new paths: the runner/exporter refuse overwrites. Run the exporter from the same clean benchmark revision used for measurement. It checks source hashes against that committed revision, compares the extension revision and package/lock hashes captured before timing, and refuses dirty or changed export checkouts. It does not recursively attest every installed dependency byte.

Commit only sanitized JSON/Markdown and the updated README table afterward. Keep raw receipts private under `results/`. Preserve earlier results separately and label their limitations. The final release commit will normally differ from the measurement source commit because it adds public evidence and release metadata; the artifact's `provenance.benchmarkHead` remains the measurement source. The 0.1.0 release retains measurements from the 0.0.1 source snapshot at `484627b`; do not relabel those historical receipts or rewrite their package/config hashes.

## 3. Prepare the release

- Update `CHANGELOG.md` and link the new result and exact source revision.
- Set the GitHub About description to the implementation-neutral package description.
- Review/delete old raw Actions artifacts before changing visibility. Check Actions logs separately for credentials; deleting an artifact does not delete logs.
- Enable GitHub secret scanning, push protection and private vulnerability reporting when available for the chosen repository visibility/plan.
- The first release version is **0.1.0**. The maintainer creates the final `v0.1.0` tag and GitHub Release after final validation and any npm-publication metadata changes. Check for existing tags first; never replace published tags. The earlier local `v0.0.1-rc.1` tag is historical preparation metadata, not the intended first release; do not push it as a release tag.

## 4. Publish only with maintainer approval

The maintainer controls when the repository becomes public and when commits/tags are pushed. A GitHub Release can then be created from the release tag using the changelog as its notes. No raw `results/` files belong in release assets.

For npm, deliberately remove `private: true`, ensure the intended name/version is available, refresh the lockfile, rerun all checks and inspect the actual tarball. Replace the README's unpublished-package instructions only when publication really succeeds. The source measurement remains attached to its original revision; do not rewrite its hashes after changing package metadata.

No workflow in this repository automatically pushes, changes visibility or publishes to npm.
