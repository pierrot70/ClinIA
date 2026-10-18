import importlib.util
import json
from pathlib import Path
import subprocess
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
                self.assertFalse(classifier.classify(self.root, event, base, head)["docs_only"])

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
