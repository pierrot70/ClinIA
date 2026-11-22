import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("classify_ci_changes", Path(__file__).with_name("classify-ci-changes.py"))
classifier = importlib.util.module_from_spec(spec)
spec.loader.exec_module(classifier)


class ClassificationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.git("init", "-q")
        self.git("config", "user.name", "Synthetic CI Test")
        self.git("config", "user.email", "ci@example.test")
        self.write("backend/index.js", "export const synthetic = true;\n")
        self.write("docs/start.md", "# Start\n")
        self.base = self.commit()
        self.git("update-ref", "refs/remotes/origin/coolify", self.base)

    def git(self, *args):
        return subprocess.check_output(["git", "-C", str(self.root), *args], stderr=subprocess.DEVNULL).decode().strip()

    def write(self, name, content):
        path = self.root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content)

    def commit(self):
        self.git("add", "-A")
        self.git("commit", "-qm", "synthetic fixture")
        return self.git("rev-parse", "HEAD")

    def new_branch_event(self, head, **overrides):
        payload = {"before": "0" * 40, "after": head, "created": True,
                   "deleted": False, "ref": "refs/heads/maintenance/synthetic-docs"}
        payload.update(overrides)
        path = self.root / ".git/event.json"
        path.write_text(json.dumps(payload))
        return path

    def classify_new_branch(self, head, **overrides):
        path = self.new_branch_event(head, **overrides)
        base, event_head = classifier.event_range("push", path, self.root)
        return classifier.classify(self.root, "push", base, event_head)

    def test_new_branch_documentation_covers_every_commit(self):
        self.write("docs/start.md", "# First change\n")
        self.commit()
        self.write("scripts/manual.md", "# Second change\n")
        result = self.classify_new_branch(self.commit())
        self.assertTrue(result["docs_only"])
        self.assertEqual(result["changed_files"], ["docs/start.md", "scripts/manual.md"])

    def test_new_branch_application_commit_before_documentation_requires_full_ci(self):
        self.write("backend/index.js", "export const changed = true;\n")
        self.commit()
        self.write("docs/start.md", "# Later documentation\n")
        result = self.classify_new_branch(self.commit())
        self.assertFalse(result["docs_only"])
        self.assertIn("backend/index.js", result["changed_files"])

    def test_new_branch_uses_common_ancestor_when_coolify_has_advanced(self):
        self.write("docs/start.md", "# Branch documentation\n")
        head = self.commit()
        self.git("checkout", "--detach", self.base)
        self.write("backend/index.js", "export const upstream = true;\n")
        advanced = self.commit()
        self.git("update-ref", "refs/remotes/origin/coolify", advanced)
        result = self.classify_new_branch(head)
        self.assertTrue(result["docs_only"])
        self.assertEqual(result["changed_files"], ["docs/start.md"])

    def test_new_branch_missing_coolify_reference_requires_full_ci(self):
        self.write("docs/start.md", "# Changed\n")
        head = self.commit()
        self.git("update-ref", "-d", "refs/remotes/origin/coolify")
        self.assertFalse(self.classify_new_branch(head)["docs_only"])

    def test_new_branch_disjoint_history_requires_full_ci(self):
        self.git("checkout", "--orphan", "synthetic-unrelated")
        self.write("docs/unrelated.md", "# Unrelated\n")
        self.assertFalse(self.classify_new_branch(self.commit())["docs_only"])

    def test_new_branch_shallow_history_requires_full_ci(self):
        self.write("docs/start.md", "# Changed\n")
        head = self.commit()
        (self.root / ".git/shallow").write_text(head + "\n")
        self.assertFalse(self.classify_new_branch(head)["docs_only"])

    def test_new_branch_without_own_changes_requires_full_ci(self):
        self.assertFalse(self.classify_new_branch(self.base)["docs_only"])

    def test_new_branch_requires_explicit_created_flag(self):
        self.write("docs/start.md", "# Changed\n")
        head = self.commit()
        for created in (None, False, "true", 1):
            with self.subTest(created=created):
                self.assertFalse(self.classify_new_branch(head, created=created)["docs_only"])

    def test_new_branch_recovery_rejects_coolify_tags_and_deleted_refs(self):
        self.write("docs/start.md", "# Changed\n")
        head = self.commit()
        for ref in ("refs/heads/coolify", "refs/tags/synthetic", "", None):
            with self.subTest(ref=ref):
                self.assertFalse(self.classify_new_branch(head, ref=ref)["docs_only"])
        self.assertFalse(self.classify_new_branch(head, deleted=True)["docs_only"])

    def test_new_branch_invalid_head_requires_full_ci(self):
        for head in (None, "--not-a-ref", "0" * 40, "f" * 40):
            with self.subTest(head=head):
                self.assertFalse(self.classify_new_branch(head)["docs_only"])

    def test_new_branch_rename_cannot_hide_application_code(self):
        self.git("mv", "backend/index.js", "docs/renamed.md")
        result = self.classify_new_branch(self.commit())
        self.assertFalse(result["docs_only"])
        self.assertIn("backend/index.js", result["changed_files"])

    def test_new_branch_main_writes_documentation_output_from_github_payload(self):
        self.write("docs/start.md", "# Changed\n")
        head = self.commit()
        event_path = self.new_branch_event(head)
        script = self.root / "scripts/classify-ci-changes.py"
        script.parent.mkdir(exist_ok=True)
        script.write_text(Path(classifier.__file__).read_text())
        manifest = self.root / ".git/changes.json"
        output = self.root / ".git/github-output"
        environment = {**os.environ, "GITHUB_EVENT_NAME": "push",
                       "GITHUB_EVENT_PATH": str(event_path), "GITHUB_OUTPUT": str(output)}
        result = subprocess.run([sys.executable, str(script), "--output", str(manifest)],
                                env=environment, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue(json.loads(manifest.read_text())["docs_only"])
        self.assertEqual(output.read_text(), "scope=docs\ndocs_only=true\n")

    def test_walkin_scripts_and_guide_use_targeted_checks(self):
        for path in classifier.WALKIN_SCRIPTS | {classifier.WALKIN_GUIDE}:
            self.write(path, "synthetic")
        head = self.commit()
        for event in ("push", "pull_request"):
            self.assertEqual(classifier.classify(self.root, event, self.base, head)["scope"], "walkin")
        self.assertEqual(self.classify_new_branch(head)["scope"], "walkin")

    def test_walkin_guide_alone_is_documentation(self):
        self.write(classifier.WALKIN_GUIDE, "# Guide")
        self.assertEqual(self.classify_new_branch(self.commit())["scope"], "docs")

    def test_walkin_never_masks_application_workflow_or_unknown_changes(self):
        for path in ("backend/index.js", "frontend/src/App.tsx", ".github/workflows/ci.yml",
                     "scripts/walkin-chrome/unknown.mjs", "backend/package-lock.json"):
            with self.subTest(path=path):
                self.git("checkout", "--detach", self.base)
                self.write(path, "changed")
                self.commit()
                self.write("scripts/walkin-chrome/passe.mjs", "synthetic")
                head = self.commit()
                self.assertEqual(self.classify_new_branch(head)["scope"], "full")
                self.assertEqual(classifier.classify(self.root, "pull_request", self.base, head)["scope"], "full")
                self.assertEqual(classifier.classify(self.root, "push", self.base, head)["scope"], "full")

    def test_documentation_only_and_exact_manifest(self):
        self.write("docs/folder/with spaces.md", "# Test\n")
        self.write("PROJECT_STATE.md", "# State\n")
        self.write("scripts/manual.md", "# Manual\n")
        result = classifier.classify(self.root, "pull_request", self.base, self.commit())
        self.assertTrue(result["docs_only"])
        self.assertEqual(result["changed_files"], ["PROJECT_STATE.md", "docs/folder/with spaces.md", "scripts/manual.md"])

    def test_mixed_application_and_documentation_is_full(self):
        self.write("docs/start.md", "# Changed\n")
        self.write("backend/index.js", "export const synthetic = false;\n")
        self.assertFalse(classifier.classify(self.root, "push", self.base, self.commit())["docs_only"])

    def test_rename_cannot_hide_application_file(self):
        self.git("mv", "backend/index.js", "docs/renamed.md")
        result = classifier.classify(self.root, "pull_request", self.base, self.commit())
        self.assertFalse(result["docs_only"])
        self.assertIn("backend/index.js", result["changed_files"])
        self.assertIn("docs/renamed.md", result["changed_files"])

    def test_deleted_document_remains_in_manifest(self):
        (self.root / "docs/start.md").unlink()
        result = classifier.classify(self.root, "push", self.base, self.commit())
        self.assertTrue(result["docs_only"])
        self.assertEqual(result["changed_files"], ["docs/start.md"])

    def test_pull_request_uses_merge_base_not_unrelated_base_branch_changes(self):
        self.git("checkout", "-qb", "synthetic-docs")
        self.write("docs/start.md", "# Changed\n")
        head = self.commit()
        self.git("checkout", "--detach", self.base)
        self.write("backend/index.js", "export const newBase = true;\n")
        advanced_base = self.commit()
        self.assertTrue(classifier.classify(self.root, "pull_request", advanced_base, head)["docs_only"])
        self.assertFalse(classifier.classify(self.root, "push", advanced_base, head)["docs_only"])

    def test_unknown_missing_manual_and_empty_ranges_are_full(self):
        for event, base, head in [
            ("workflow_dispatch", self.base, self.base), ("push", "0" * 40, self.base),
            ("push", "f" * 40, self.base), ("pull_request", None, self.base),
            ("push", "--not-a-ref", self.base), ("push", self.base, self.base),
        ]:
            with self.subTest(event=event, base=base):
                self.assertEqual(classifier.classify(self.root, event, base, head)["scope"], "full")

    def test_only_the_document_allowlist_can_skip_application_tests(self):
        for path in ["AGENTS.md", "docs/AGENTS.md", ".github/workflows/ci.md", "frontend/README.md",
                     "scripts/check-documentation.py", "docs/code.js", "docs/a.md\nbackend/code.js", "../outside.md"]:
            with self.subTest(path=path):
                self.assertFalse(classifier.is_documentation(path))
        for path in ["RUNNING.md", "README.md", "README.fr.md", "docs/sub/guide.md"]:
            self.assertTrue(classifier.is_documentation(path))

    def test_event_payloads_are_read_without_shell_interpolation(self):
        path = self.root / "event.json"
        path.write_text(json.dumps({"pull_request": {"base": {"sha": self.base}, "head": {"sha": self.base}}}))
        self.assertEqual(classifier.event_range("pull_request", path), (self.base, self.base))
        path.write_text("invalid json")
        self.assertEqual(classifier.event_range("push", path), (None, None))


if __name__ == "__main__":
    unittest.main()
