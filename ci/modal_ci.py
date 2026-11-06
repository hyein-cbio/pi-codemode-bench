"""Run Ubuntu validation in one ephemeral Modal app, without remote credentials.

Adapted from cloudroom-mcp/ci/modal_ci.py: pinned SDK, separately cached
dependencies, one app per invocation, and failures propagated to the caller.
A Sandbox keeps repository code separate from the authenticated SDK client.
"""

import argparse
from concurrent.futures import ThreadPoolExecutor
import os
from pathlib import Path
import subprocess
import sys
from tempfile import TemporaryDirectory


ROOT = Path(__file__).resolve().parent.parent
WORKSPACE = "/workspace"
NODE_VERSION = "22.23.4"
NODE_SHA256 = "1805bcd35e6815559bd2eb97db438d3fdb0eb3a5e6a977b7c1badca76337e9ce"
SUMMARY = "/tmp/ci-summary.md"
BOOTSTRAP = """
set -euo pipefail
git init -q
git fetch -q /tmp/source.bundle HEAD
git checkout -q --force --detach FETCH_HEAD
node --version
python3 --version
npm run check:language
npm test
npm run bench:demo -- --out=results/ci-demo.json
node scripts/ci-summary.mjs results/ci-demo.json > /tmp/ci-summary.md
"""


def git(root, *args):
    return subprocess.check_output(["git", "-C", str(root), *args])


def prepare_source(root, staging):
    """Export only committed HEAD and its ancestry, never the local Git config."""
    if git(root, "rev-parse", "--is-shallow-repository").strip() != b"false":
        raise RuntimeError("Modal CI requires a full Git checkout")
    # Untracked/ignored files are intentionally excluded, not uploaded recursively.
    if git(root, "status", "--porcelain", "--untracked-files=no").strip():
        raise RuntimeError("Commit tracked changes before running Modal CI")
    head = git(root, "rev-parse", "HEAD").decode().strip()
    for name in ("package.json", "package-lock.json"):
        (staging / name).write_bytes(git(root, "show", f"{head}:{name}"))
    git(root, "bundle", "create", str(staging / "source.bundle"), "HEAD")
    return head


def make_image(modal, staging):
    """An Ubuntu image; dependency layers change only with package metadata."""
    archive = f"node-v{NODE_VERSION}-linux-x64.tar.xz"
    install_node = (
        f"curl --fail --silent --show-error --location "
        f"https://nodejs.org/dist/v{NODE_VERSION}/{archive} -o /tmp/node.tar.xz"
        f" && echo '{NODE_SHA256}  /tmp/node.tar.xz' | sha256sum --check -"
        " && tar -xJf /tmp/node.tar.xz -C /usr/local --strip-components=1"
        " && rm /tmp/node.tar.xz"
    )
    return (
        modal.Image.from_registry("ubuntu:24.04", add_python="3.11")
        .apt_install("git", "curl", "ca-certificates", "xz-utils")
        .run_commands(install_node)
        .env({"CI": "true"})
        .workdir(WORKSPACE)
        .add_local_file(staging / "package.json", f"{WORKSPACE}/package.json", copy=True)
        .add_local_file(staging / "package-lock.json", f"{WORKSPACE}/package-lock.json", copy=True)
        .run_commands("npm ci --ignore-scripts")
        .add_local_file(staging / "source.bundle", "/tmp/source.bundle")
    )


def copy_stream(stream, destination):
    for line in stream:
        print(line, end="", file=destination, flush=True)


def run_validation(modal, image):
    """Wait for completion, fail closed, and terminate even on client-side errors."""
    app = modal.App("pi-codemode-bench-ci")
    with modal.enable_output(), app.run():
        sandbox = modal.Sandbox.create(
            "sleep", "600",
            app=app, image=image, workdir=WORKSPACE,
            cpu=2, memory=2048, timeout=600,
            # No Modal Secrets, GitHub tokens, or local environment forwarding.
            secrets=[],
        )
        with ThreadPoolExecutor(max_workers=2) as pool:
            try:
                # Keep the Sandbox alive until its sanitized summary has been read.
                process = sandbox.exec("bash", "-c", BOOTSTRAP, timeout=600)
                stdout = pool.submit(copy_stream, process.stdout, sys.stdout)
                stderr = pool.submit(copy_stream, process.stderr, sys.stderr)
                process.wait()
                stdout.result()
                stderr.result()
                if process.returncode != 0:
                    raise RuntimeError(f"Modal Ubuntu validation failed (exit {process.returncode})")
                # Retrieve only the allowlisted summary, never the raw receipt.
                return sandbox.filesystem.read_text(SUMMARY)
            finally:
                # Terminate before joining stream readers if waiting/reading failed.
                sandbox.terminate()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=ROOT)
    args = parser.parse_args()
    # The SDK is needed only by the dispatcher, not by the offline regression tests.
    import modal

    with TemporaryDirectory(prefix="benchmark-ci-") as temporary:
        staging = Path(temporary)
        head = prepare_source(args.root.resolve(), staging)
        print(f"Validating committed source {head} on Modal Ubuntu", flush=True)
        summary = run_validation(modal, make_image(modal, staging))
    print(summary)
    if path := os.environ.get("GITHUB_STEP_SUMMARY"):
        with open(path, "a", encoding="utf-8") as output:
            output.write(summary)


if __name__ == "__main__":
    main()
