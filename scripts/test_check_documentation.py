#!/usr/bin/env python3
"""Isolated, offline fixtures for the documentation gate (stdlib unittest)."""
import contextlib
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest

SPEC = importlib.util.spec_from_file_location("documentation_check", Path(__file__).with_name("check-documentation.py"))
CHECK = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(CHECK)


class DocumentationCheckTests(unittest.TestCase):
    def setUp(self):
        self.workspace = tempfile.TemporaryDirectory()
        self.addCleanup(self.workspace.cleanup)
        self.root = Path(self.workspace.name) / "repo"
        self.root.mkdir()

    def write(self, name, content):
        path = self.root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content.encode("utf-8") if isinstance(content, str) else content)
        return path

    def check(self, *paths, docs_only=True):
        return CHECK.validate_changes(self.root, {"docs_only": docs_only, "changed_files": list(paths)})

    def test_relative_encoded_anchors_and_images(self):
        self.write("docs/guide space.md", "# Présentation du dossier\n\nTexte.\n\n## Même titre\n\n## Même titre\n")
        self.write("docs/picture space.png", b"fixture")
        self.write("README.md", "# Guide\n\n[Guide](docs/guide%20space.md#pr%C3%A9sentation-du-dossier)\n"
                   "\n[Second](docs/guide%20space.md#même-titre-1)\n"
                   "\n![Image](docs/picture%20space.png)\n")
        self.assertEqual([], self.check("README.md", "docs/guide space.md"))

    def test_full_collapsed_shortcut_references_and_definition_titles(self):
        self.write("docs/target.md", "# Target\n")
        self.write("README.md", "# Links\n\n[Full][Case Label], [Shortcut] and ![Image][].\n\n"
                   "[case label]: docs/target.md#target \"Optional title\"\n"
                   "[Shortcut]: <docs/target.md#target>\n"
                   "[Image]: docs/target.md#target 'Title'\n")
        self.assertEqual([], self.check("README.md"))

    def test_undefined_explicit_reference_is_reported(self):
        self.write("README.md", "# Links\n\n[Full][missing]\n\n[ordinary bracketed prose]\n")
        errors = self.check("README.md")
        self.assertEqual(1, len(errors))
        self.assertIn("undefined link reference [missing]", errors[0])

    def test_balanced_and_escaped_parentheses_in_file_names(self):
        self.write("docs/target(one).md", "# Target\n")
        self.write("README.md", "# Links\n\n[A](docs/target(one).md#target)\n\n"
                   "[B](docs/target\\(one\\).md#target \"title\")\n")
        self.assertEqual([], self.check("README.md"))

    def test_broken_local_file_and_anchor_fail(self):
        self.write("docs/target.md", "# Exists\n")
        self.write("README.md", "# Links\n\n[Gone](gone.md)\n\n[Wrong](docs/target.md#wrong)\n")
        errors = self.check("README.md")
        self.assertTrue(any("target does not exist: gone.md" in error for error in errors))
        self.assertTrue(any("anchor does not exist: docs/target.md#wrong" in error for error in errors))

    def test_self_and_root_relative_links_and_directory(self):
        self.write("docs/target.md", "# Heading\n\n[Self](#heading)\n\n[Root](/README.md#root)\n\n[Directory](../docs/)\n")
        self.write("README.md", "# Root\n")
        self.assertEqual([], self.check("docs/target.md"))

    def test_fenced_and_inline_examples_do_not_create_links_or_headings(self):
        self.write("README.md", "# Examples\n\n````markdown\n# No blank line here\n"
                   "[Broken](missing.md)   \n```\n````\n\n"
                   "~~~text\n[Reference][missing]\n~~~\n\n"
                   "`[Not a link](missing.md)` and ``[No][ref] with ` inside``.\n")
        self.assertEqual([], self.check("README.md"))

    def test_comment_links_are_ignored(self):
        self.write("README.md", "# Comments\n\n<!-- [Example](missing.md) -->\n")
        self.assertEqual([], self.check("README.md"))

    def test_deleted_file_checks_unchanged_incoming_links_only(self):
        self.write("README.md", "Legacy heading\n#No space\n[Deleted](docs/deleted.md)\n[Legacy](old-missing.md)\n")
        self.write("docs/unrelated.md", "[Other legacy](missing.md)\n")
        self.write("scripts/guide.md", "[Deleted](../docs/deleted.md)\n")
        errors = self.check("docs/deleted.md")
        self.assertEqual(2, len(errors))
        self.assertTrue(all("deleted.md" in error for error in errors))
        self.assertTrue(any(error.startswith("scripts/guide.md:") for error in errors))

    def test_changed_anchor_checks_incoming_reference_links(self):
        self.write("docs/target.md", "# New anchor\n")
        self.write("docs/source.md", "[Read][target]\n\n[target]: target.md#old-anchor\n")
        errors = self.check("docs/target.md")
        self.assertTrue(errors)
        self.assertTrue(all("old-anchor" in error for error in errors))

    def test_renamed_file_requires_updated_backlink(self):
        self.write("docs/new.md", "# New\n")
        self.write("README.md", "# Read\n\n[Old](docs/old.md)\n")
        errors = self.check("docs/old.md", "docs/new.md")
        self.assertEqual(1, len(errors))
        self.assertIn("docs/old.md", errors[0])

    def test_agents_and_application_markdown_are_not_scanned_for_incoming_links(self):
        self.write("AGENTS.md", "[Deleted](docs/gone.md)\n")
        self.write("docs/AGENTS.md", "[Deleted](gone.md)\n")
        self.write("frontend/README.md", "[Deleted](../docs/gone.md)\n")
        self.assertEqual([], self.check("docs/gone.md"))

    def test_application_markdown_is_checked_when_it_is_modified(self):
        self.write("frontend/README.md", "# App\n\n[Missing](gone.md)\n")
        self.assertTrue(self.check("frontend/README.md", "frontend/app.ts", docs_only=False))

    def test_symlink_and_parent_escape_are_rejected(self):
        outside = Path(self.workspace.name) / "outside.md"
        outside.write_text("# Outside\n")
        try:
            (self.root / "escape.md").symlink_to(outside)
        except OSError as exc:
            self.skipTest(str(exc))
        self.write("README.md", "# Links\n\n[Symlink](escape.md)\n\n[Parent](../outside.md)\n")
        errors = self.check("README.md")
        self.assertEqual(2, len(errors))
        self.assertTrue(all("escapes repository" in error for error in errors))

    def test_modified_markdown_symlink_outside_repository_is_not_read(self):
        outside = Path(self.workspace.name) / "outside.md"
        outside.write_text("# Outside\n")
        try:
            (self.root / "README.md").symlink_to(outside)
        except OSError as exc:
            self.skipTest(str(exc))
        self.assertTrue(any("inside repository" in error for error in self.check("README.md")))

    def test_symlink_parent_traversal_uses_real_filesystem_semantics(self):
        outside = Path(self.workspace.name) / "outside"
        (outside / "child").mkdir(parents=True)
        (outside / "target.md").write_text("# Outside\n")
        self.write("docs/target.md", "# Target\n")
        try:
            (self.root / "docs/alias").symlink_to(outside / "child", target_is_directory=True)
        except OSError as exc:
            self.skipTest(str(exc))
        self.write("README.md", "# Links\n\n[Outside](docs/alias/../target.md)\n")
        self.assertTrue(any("escapes repository" in error for error in self.check("README.md")))

    def test_internal_symlink_link_is_allowed(self):
        self.write("docs/target.md", "# Target\n")
        try:
            (self.root / "alias.md").symlink_to(self.root / "docs/target.md")
        except OSError as exc:
            self.skipTest(str(exc))
        self.write("README.md", "# Links\n\n[Alias](alias.md#target)\n")
        self.assertEqual([], self.check("README.md"))

    def test_incoming_symlink_alias_is_checked_when_real_heading_changes(self):
        self.write("docs/target.md", "# New heading\n")
        try:
            (self.root / "alias.md").symlink_to(self.root / "docs/target.md")
        except OSError as exc:
            self.skipTest(str(exc))
        self.write("README.md", "# Links\n\n[Alias](alias.md#old-heading)\n")
        self.assertTrue(any("anchor does not exist" in error for error in self.check("docs/target.md")))

    def test_utf8_final_newline_whitespace_heading_and_fence_errors(self):
        cases = {
            "encoding": (b"# Title\n\n\xff\n", "UTF-8"),
            "newline": ("# Title", "final newline"),
            "trailing": ("# Title\n\nText   \n", "trailing whitespace"),
            "tab": ("# Title\n\nText\t\n", "trailing whitespace"),
            "before": ("Paragraph\n# Title\n", "blank line before"),
            "after": ("# Title\nParagraph\n", "blank line after"),
            "fence": ("# Title\n\n```\nContent\n", "unclosed fenced"),
        }
        for label, (content, expected) in cases.items():
            with self.subTest(label=label):
                self.write("README.md", content)
                self.assertTrue(any(expected in error for error in self.check("README.md")))

    def test_two_space_hard_break_and_unlimited_line_length_are_allowed(self):
        self.write("README.md", "# Title\n\nText  \nContinuation\n\n" + "x" * 500 + "\n")
        self.assertEqual([], self.check("README.md"))

    def test_duplicate_heading_anchors_inline_code_and_explicit_anchor(self):
        self.write("docs/target.md", "# Same\n\n## Same\n\n## Same-1\n\n## `Code` and **bold**\n\n<a id=\"custom\"></a>\n")
        self.write("README.md", "# Links\n\n[A](docs/target.md#same-1)\n\n[B](docs/target.md#same-1-1)\n\n"
                   "[C](docs/target.md#code-and-bold)\n\n[D](docs/target.md#custom)\n")
        self.assertEqual([], self.check("README.md"))

    def test_http_and_mailto_are_syntax_checked_without_network(self):
        self.write("README.md", "# Links\n\n[Web](https://invalid.example/docs#anything)\n\n"
                   "[Mail](mailto:example@invalid.example)\n")
        self.assertEqual([], self.check("README.md"))
        self.write("README.md", "# Links\n\n[Bad](https:///missing-host)\n")
        self.assertTrue(any("external URL" in error for error in self.check("README.md")))

    def test_invalid_manifest_paths_are_rejected(self):
        for path in ("../escape.md", "/absolute.md", "docs/a\nb.md", "docs/a\rb.md",
                     "docs/a\tb.md", "docs/a\\b.md", "./README.md", "C:/absolute.md"):
            with self.subTest(path=repr(path)):
                with self.assertRaises(ValueError):
                    self.check(path)

    def test_empty_manifest_is_noop(self):
        self.write("README.md", "#Broken\n[Legacy](missing.md)\n")
        self.assertEqual([], self.check(docs_only=False))

    def test_cli_success_validation_failure_and_bad_manifest_exit_codes(self):
        manifest_path = Path(self.workspace.name) / "changes.json"
        self.write("README.md", "# Valid\n")
        manifest_path.write_text(json.dumps({"docs_only": True, "changed_files": ["README.md"]}))
        with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            self.assertEqual(0, CHECK.main(["--changes", str(manifest_path)], root=self.root))
            self.write("README.md", "# Broken\n\n[Missing](gone.md)\n")
            self.assertEqual(1, CHECK.main(["--changes", str(manifest_path)], root=self.root))
            manifest_path.write_text('{"docs_only": "yes", "changed_files": []}')
            self.assertEqual(2, CHECK.main(["--changes", str(manifest_path)], root=self.root))


if __name__ == "__main__":
    unittest.main()
