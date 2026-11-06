"""Offline CI regression tests: no SDK, credentials, or remote resources."""

from pathlib import Path
import subprocess
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import MagicMock, patch

import modal_ci as ci


class SourceTests(unittest.TestCase):
    def setUp(self):
        self.temporary = TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.base = Path(self.temporary.name)
        self.root = self.base / "repo"
        self.root.mkdir()
        self.staging = self.base / "upload"
        self.staging.mkdir()
        self.git("init", "-q")
        (self.root / "package.json").write_text('{"name":"fixture","version":"1.0.0"}')
        (self.root / "package-lock.json").write_text('{"lockfileVersion":3}')
        (self.root / ".gitignore").write_text("ignored/\n")
        self.commit("Initial")
        self.old_head = self.git("rev-parse", "HEAD").strip()
        (self.root / "history.txt").write_text("Historical source")
        self.commit("History")

    def git(self, *args):
        return ci.git(self.root, *args).decode()

    def commit(self, message):
        self.git("add", ".")
        self.git("-c", "user.name=Test", "-c", "user.email=test@example.invalid",
                 "-c", "commit.gpgsign=false", "commit", "-qm", message)

    def test_bundle_preserves_head_and_history_but_not_local_files_or_credentials(self):
        (self.root / ".env").write_text("SECRET=do-not-upload")
        (self.root / "ignored").mkdir()
        (self.root / "ignored" / "receipt.json").write_text("do-not-upload")
        self.git("config", "http.extraheader", "Authorization: do-not-upload")
        self.git("remote", "add", "origin", "https://do-not-upload@example.invalid/repo")
        head = ci.prepare_source(self.root, self.staging)
        clone = self.base / "clone"
        subprocess.run(["git", "clone", "-q", str(self.staging / "source.bundle"), str(clone)],
                       check=True, capture_output=True)
        self.assertEqual(ci.git(clone, "rev-parse", "HEAD").decode().strip(), head)
        self.assertEqual(ci.git(clone, "show", f"{self.old_head}:package.json"),
                         (self.staging / "package.json").read_bytes())
        self.assertFalse((clone / ".env").exists())
        self.assertFalse((clone / "ignored").exists())
        self.assertNotIn("do-not-upload", (clone / ".git/config").read_text())
        self.assertEqual(set(path.name for path in self.staging.iterdir()),
                         {"source.bundle", "package.json", "package-lock.json"})

    def test_bootstrap_restores_source_over_cached_package_metadata(self):
        ci.prepare_source(self.root, self.staging)
        workspace = self.base / "workspace"
        workspace.mkdir()
        for name in ("package.json", "package-lock.json"):
            (workspace / name).write_bytes((self.staging / name).read_bytes())
        (workspace / "node_modules").mkdir()
        cached = workspace / "node_modules" / "cached.txt"
        cached.write_text("Cached dependency")
        bootstrap = ci.BOOTSTRAP.split("node --version")[0].replace(
            "/tmp/source.bundle", str(self.staging / "source.bundle"))
        subprocess.run(["bash", "-c", bootstrap], cwd=workspace,
                       check=True, capture_output=True)
        self.assertEqual(ci.git(workspace, "rev-parse", "HEAD").decode().strip(),
                         self.git("rev-parse", "HEAD").strip())
        self.assertEqual(cached.read_text(), "Cached dependency")
        self.assertEqual(ci.git(workspace, "diff", "HEAD"), b"")

    def test_dirty_tracked_source_is_rejected_even_when_staged(self):
        (self.root / "package.json").write_text("{}")
        for staged in (False, True):
            if staged:
                self.git("add", "package.json")
            with self.assertRaisesRegex(RuntimeError, "Commit tracked changes"):
                ci.prepare_source(self.root, self.staging)

    def test_shallow_source_is_rejected(self):
        clone = self.base / "shallow"
        subprocess.run(["git", "clone", "-q", "--depth=1", self.root.as_uri(), str(clone)],
                       check=True, capture_output=True)
        with self.assertRaisesRegex(RuntimeError, "full Git checkout"):
            ci.prepare_source(clone, self.staging)

    def test_linked_worktree_is_supported(self):
        worktree = self.base / "worktree"
        self.git("worktree", "add", "-q", "--detach", str(worktree), "HEAD")
        self.assertTrue((worktree / ".git").is_file())
        self.assertEqual(ci.prepare_source(worktree, self.staging),
                         self.git("rev-parse", "HEAD").strip())


class DispatcherTests(unittest.TestCase):
    def fake_modal(self):
        modal = MagicMock()
        sandbox = modal.Sandbox.create.return_value
        process = sandbox.exec.return_value
        process.stdout = iter(())
        process.stderr = iter(())
        process.returncode = 0
        sandbox.filesystem.read_text.return_value = "Sanitized summary\n"
        return modal, sandbox

    def test_one_app_and_credential_free_sandbox_returns_only_summary(self):
        modal, sandbox = self.fake_modal()
        self.assertEqual(ci.run_validation(modal, "image"), "Sanitized summary\n")
        modal.App.assert_called_once_with("pi-codemode-bench-ci")
        sandbox.exec.return_value.wait.assert_called_once_with()
        sandbox.terminate.assert_called_once_with()
        sandbox.filesystem.read_text.assert_called_once_with("/tmp/ci-summary.md")
        kwargs = modal.Sandbox.create.call_args.kwargs
        self.assertEqual(kwargs["secrets"], [])
        self.assertNotIn("env", kwargs)
        self.assertEqual(kwargs["timeout"], 600)
        self.assertEqual(kwargs["workdir"], "/workspace")

    def test_nonzero_exit_timeout_and_summary_errors_fail_and_terminate(self):
        for failure in ("exec", "exit", "wait", "summary"):
            with self.subTest(failure=failure):
                modal, sandbox = self.fake_modal()
                if failure == "exec":
                    sandbox.exec.side_effect = RuntimeError("Exec failed")
                elif failure == "exit":
                    sandbox.exec.return_value.returncode = 1
                elif failure == "wait":
                    sandbox.exec.return_value.wait.side_effect = RuntimeError("Sandbox timeout")
                else:
                    sandbox.filesystem.read_text.side_effect = RuntimeError("No summary")
                with self.assertRaises(RuntimeError):
                    ci.run_validation(modal, "image")
                sandbox.terminate.assert_called_once_with()
                if failure != "summary":
                    sandbox.filesystem.read_text.assert_not_called()

    def test_image_uses_ubuntu_verified_node_and_separate_dependency_layer(self):
        modal = MagicMock()
        image = modal.Image.from_registry.return_value
        for method in ("apt_install", "run_commands", "env", "workdir", "add_local_file"):
            getattr(image, method).return_value = image
        staging = Path("/upload")
        self.assertIs(ci.make_image(modal, staging), image)
        modal.Image.from_registry.assert_called_once_with("ubuntu:24.04", add_python="3.11")
        image.env.assert_called_once_with({"CI": "true"})
        commands = [call.args[0] for call in image.run_commands.call_args_list]
        self.assertIn(ci.NODE_SHA256, commands[0])
        self.assertIn("sha256sum --check", commands[0])
        self.assertEqual(commands[1], "npm ci --ignore-scripts")
        uploads = image.add_local_file.call_args_list
        self.assertEqual([call.args for call in uploads], [
            (staging / "package.json", "/workspace/package.json"),
            (staging / "package-lock.json", "/workspace/package-lock.json"),
            (staging / "source.bundle", "/tmp/source.bundle"),
        ])
        self.assertEqual([call.kwargs for call in uploads], [{"copy": True}, {"copy": True}, {}])
        # The bundle is mounted after dependency installation, not copied into it.
        calls = [call[0] for call in image.method_calls]
        self.assertEqual(calls[-2:], ["run_commands", "add_local_file"])

    def test_bootstrap_keeps_existing_validation_and_stops_on_failure(self):
        self.assertIn("set -euo pipefail", ci.BOOTSTRAP)
        self.assertIn("git checkout -q --force --detach FETCH_HEAD", ci.BOOTSTRAP)
        for command in ("npm run check:language", "npm test",
                        "npm run bench:demo -- --out=results/ci-demo.json",
                        "node scripts/ci-summary.mjs results/ci-demo.json"):
            self.assertIn(command, ci.BOOTSTRAP)
        self.assertNotIn("GITHUB_TOKEN", ci.BOOTSTRAP)
        self.assertNotIn("MODAL_TOKEN", ci.BOOTSTRAP)


if __name__ == "__main__":
    unittest.main()
