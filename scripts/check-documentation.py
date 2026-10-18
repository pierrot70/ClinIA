#!/usr/bin/env python3
"""Offline documentation gate for classified, repository-relative changes.

Supported Markdown: ATX headings, backtick/tilde fenced blocks, inline code,
single-line inline links/images (balanced destinations, optional titles), and
single-line reference definitions/full/collapsed/shortcut references. Heading
anchors approximate GitHub slugs, including duplicate headings and explicit
HTML <a id/name> anchors. Setext headings, multiline links/reference definitions,
HTML href/src, autolinks, nested link labels, list-indented fences and Markdown
embedded in raw HTML are not parsed.
There is no network access, dependency installation or line-length policy.
"""
from __future__ import annotations

import argparse
import html
import json
import os
from pathlib import Path, PurePosixPath
import re
import sys
import unicodedata
from urllib.parse import unquote, urlsplit

FENCE = re.compile(r"^ {0,3}(`{3,}|~{3,})(.*)$")
HEADING = re.compile(r"^ {0,3}(#{1,6})[ \t]+(.*)$")
INLINE_CODE = re.compile(r"(?<!`)(`+)(?!`)([\s\S]*?)(?<!`)\1(?!`)")
DEFINITION = re.compile(r"^ {0,3}\[((?:\\.|[^\]\\])+?)\]:[ \t]*(.*)$")
LINK_OPEN = re.compile(r"(?<!\\)!?\[((?:\\.|[^\]\\\n])*)\]\(")
REFERENCE = re.compile(r"(?<!\\)!?\[((?:\\.|[^\]\\\n])+?)\](?:\[((?:\\.|[^\]\\\n])*)\])?")
COMMENT = re.compile(r"<!--[\s\S]*?-->")
HTML_ANCHOR = re.compile(r"""<a\b[^>]*\b(?:id|name)\s*=\s*["']([^"']+)["'][^>]*>""", re.I)


def blank(match: re.Match[str]) -> str:
    return "".join("\n" if char == "\n" else " " for char in match.group())


def normalize_reference(label: str) -> str:
    return " ".join(label.split()).casefold()


def unescape_markdown(value: str) -> str:
    return re.sub(r"\\([!\x22#$%&'()*+,\-./:;<=>?@\[\]\\^_`{|}~])", r"\1", value)


def outside_fences(text: str) -> tuple[str, set[int], int | None]:
    """Mask fenced content while retaining line numbers and offsets."""
    lines = text.splitlines(keepends=True)
    excluded: set[int] = set()
    opening: tuple[str, int, int] | None = None
    output = []
    for number, line in enumerate(lines, 1):
        body = line.rstrip("\r\n")
        if opening:
            excluded.add(number)
            char, length, start = opening
            if re.fullmatch(r" {0,3}" + re.escape(char) + "{" + str(length) + r",}[ \t]*", body):
                opening = None
            output.append("".join("\n" if c == "\n" else " " for c in line))
            continue
        fence = FENCE.match(body)
        if fence and not (fence[1][0] == "`" and "`" in fence[2]):
            opening = (fence[1][0], len(fence[1]), number)
            excluded.add(number)
            output.append("".join("\n" if c == "\n" else " " for c in line))
        else:
            output.append(line)
    return "".join(output), excluded, opening[2] if opening else None


def format_errors(text: str) -> list[tuple[int, str]]:
    errors = []
    if text and not text.endswith("\n"):
        errors.append((len(text.splitlines()), "missing final newline"))
    masked, fenced, unclosed = outside_fences(text)
    if unclosed is not None:
        errors.append((unclosed, "unclosed fenced code block"))
    lines = text.splitlines()
    visible = INLINE_CODE.sub(blank, COMMENT.sub(blank, masked)).splitlines()
    for index, line in enumerate(lines):
        if index + 1 in fenced:
            continue
        trailing = re.search(r"[ \t]+$", line)
        if trailing and not (trailing.group() == "  " and line[:trailing.start()].strip()):
            errors.append((index + 1, "trailing whitespace (only a two-space hard break is allowed)"))
        if index < len(visible) and HEADING.match(visible[index]):
            if index and lines[index - 1].strip():
                errors.append((index + 1, "ATX heading must have a blank line before it"))
            if index + 1 < len(lines) and lines[index + 1].strip():
                errors.append((index + 1, "ATX heading must have a blank line after it"))
    return errors


def destination(text: str, start: int, inline: bool) -> tuple[str, int] | None:
    """Return destination and closing offset; titles must be single-line."""
    end = text.find("\n", start)
    end = len(text) if end < 0 else end
    cursor = start
    while cursor < end and text[cursor] in " \t":
        cursor += 1
    if cursor == end:
        return None
    if text[cursor] == "<":
        close = text.find(">", cursor + 1, end)
        if close < 0:
            return None
        target = text[cursor + 1:close]
        cursor = close + 1
    else:
        beginning = cursor
        depth = 0
        while cursor < end:
            char = text[cursor]
            if char == "\\" and cursor + 1 < end:
                cursor += 2
                continue
            if char in " \t" and depth == 0:
                break
            if char == "(":
                depth += 1
            if char == ")":
                if depth == 0:
                    break
                depth -= 1
            cursor += 1
        if depth:
            return None
        target = text[beginning:cursor]
    while cursor < end and text[cursor] in " \t":
        cursor += 1
    if cursor < end and text[cursor] in ('"', "'", "("):
        quote = text[cursor]
        close_char = ")" if quote == "(" else quote
        cursor += 1
        while cursor < end and text[cursor] != close_char:
            cursor += 2 if text[cursor] == "\\" else 1
        if cursor >= end:
            return None
        cursor += 1
        while cursor < end and text[cursor] in " \t":
            cursor += 1
    if inline:
        if cursor >= end or text[cursor] != ")":
            return None
        return unescape_markdown(html.unescape(target)), cursor + 1
    if cursor != end:
        return None
    return unescape_markdown(html.unescape(target)), cursor


def links(text: str) -> tuple[list[tuple[str, int]], list[tuple[str, int]]]:
    visible, _, _ = outside_fences(text)
    visible = INLINE_CODE.sub(blank, COMMENT.sub(blank, visible))
    definitions = {}
    targets = []
    output = []
    for number, line in enumerate(visible.splitlines(keepends=True), 1):
        match = DEFINITION.match(line.rstrip("\r\n"))
        parsed = destination(match[2], 0, False) if match else None
        if match and parsed:
            definitions.setdefault(normalize_reference(match[1]), parsed[0])
            targets.append((parsed[0], number))
            output.append("".join("\n" if c == "\n" else " " for c in line))
        else:
            output.append(line)
    visible = "".join(output)
    used = []
    for match in LINK_OPEN.finditer(visible):
        parsed = destination(visible, match.end(), True)
        if parsed:
            targets.append((parsed[0], visible.count("\n", 0, match.start()) + 1))
            used.append((match.start(), parsed[1]))
    characters = list(visible)
    for start, end in used:
        for index in range(start, end):
            if characters[index] != "\n":
                characters[index] = " "
    undefined = []
    for match in REFERENCE.finditer("".join(characters)):
        label = normalize_reference(match[2] or match[1])
        number = visible.count("\n", 0, match.start()) + 1
        if label in definitions:
            targets.append((definitions[label], number))
        elif match[2] is not None:
            undefined.append((label, number))
    return targets, undefined


def heading_anchors(text: str) -> set[str]:
    visible, _, _ = outside_fences(text)
    visible = COMMENT.sub(blank, visible)
    anchors: set[str] = set()
    for line in visible.splitlines():
        match = HEADING.match(line)
        if not match:
            continue
        title = re.sub(r"[ \t]+#+[ \t]*$", "", match[2]).strip()
        title = re.sub(r"!?\[([^\]]+)\]\([^)]*\)", r"\1", title)
        title = re.sub(r"<[^>]*>", "", title)
        title = re.sub(r"(\*{1,3}|_{1,3})(.+?)\1", r"\2", title)
        title = unescape_markdown(html.unescape(title)).replace("`", "")
        # Keep Unicode letters/numbers/marks plus underscore and hyphen.
        slug = "".join(c for c in title.lower() if c in "_- " or unicodedata.category(c)[0] in "LNM").replace(" ", "-")
        candidate = slug
        duplicate = 0
        while candidate in anchors:
            duplicate += 1
            candidate = slug + "-" + str(duplicate)
        anchors.add(candidate)
    anchors.update(html.unescape(m[1]) for m in HTML_ANCHOR.finditer(INLINE_CODE.sub(blank, visible)))
    return anchors


def validate_manifest(manifest: object) -> dict:
    if not isinstance(manifest, dict) or not isinstance(manifest.get("docs_only"), bool):
        raise ValueError("manifest must contain a boolean docs_only")
    changed = manifest.get("changed_files")
    if not isinstance(changed, list):
        raise ValueError("manifest must contain changed_files as a list")
    for value in changed:
        if not isinstance(value, str) or not value or any(ord(c) < 32 or c == "\\" for c in value):
            raise ValueError("changed_files must contain nonempty POSIX paths without control characters")
        path = PurePosixPath(value)
        if path.is_absolute() or ".." in path.parts or value != path.as_posix() or re.match(r"^[A-Za-z]:", value):
            raise ValueError("changed_files must be normalized repository-relative paths")
    return manifest


def documentary_paths(root: Path) -> list[Path]:
    paths = list(root.glob("*.md"))
    for directory in ("docs", "scripts"):
        paths.extend((root / directory).rglob("*.md"))
    return sorted({p for p in paths if p.name != "AGENTS.md" and p.is_file()})


def local_path(root: Path, source: Path, target: str) -> tuple[Path | None, str, str | None]:
    if any(c in target for c in "\r\n\x00"):
        return None, "", "link destination contains a control character"
    try:
        url = urlsplit(target)
    except ValueError:
        return None, "", "invalid URL"
    if url.scheme or url.netloc:
        scheme = url.scheme.lower()
        if scheme in ("http", "https") and url.netloc and url.hostname:
            return None, "", None
        if scheme == "mailto" and url.path and "@" in url.path:
            return None, "", None
        return None, "", "unsupported or malformed external URL"
    decoded = unquote(url.path)
    if any(c in decoded for c in "\r\n\x00\\"):
        return None, "", "local link contains an invalid decoded character"
    if decoded.startswith("/"):
        path = root / decoded.lstrip("/")
    else:
        path = source.parent / decoded if decoded else source
    return path, unquote(url.fragment), None


def validate_changes(root: Path, manifest: object) -> list[str]:
    manifest = validate_manifest(manifest)
    root = root.resolve()
    changed = {root / name for name in manifest["changed_files"]}
    resolved_changes = set()
    for path in changed:
        try:
            resolved_changes.add(path.resolve())
        except (OSError, RuntimeError):
            pass
    errors: list[str] = []
    texts: dict[Path, str | None] = {}

    def report(source: Path, line: int, message: str) -> None:
        errors.append(f"{source.relative_to(root).as_posix()}:{line}: {message}")

    def read(source: Path, complain: bool) -> str | None:
        if source in texts:
            if texts[source] is None and complain:
                report(source, 1, "cannot read UTF-8 Markdown inside repository")
            return texts[source]
        try:
            source.resolve().relative_to(root)
            text = source.read_bytes().decode("utf-8")
        except (OSError, UnicodeError, ValueError, RuntimeError):
            if complain:
                report(source, 1, "cannot read UTF-8 Markdown inside repository")
            text = None
        texts[source] = text
        return text

    modified = {p for p in changed if p.suffix.lower() == ".md" and (p.exists() or p.is_symlink())}
    for source in sorted(modified):
        text = read(source, True)
        if text is not None:
            for line, message in format_errors(text):
                report(source, line, message)

    for source in sorted(set(documentary_paths(root)) | modified):
        text = read(source, source in modified)
        if text is None:
            continue
        targets, undefined = links(text)
        if source in modified:
            for label, line in undefined:
                report(source, line, f"undefined link reference [{label}]")
        for target, line in targets:
            path, fragment, problem = local_path(root, source, target)
            comparison = Path(os.path.normpath(path)) if path is not None else None
            try:
                resolved_target = path.resolve() if path is not None else None
            except (OSError, RuntimeError):
                resolved_target = None
            if source not in modified and comparison not in changed and resolved_target not in resolved_changes:
                continue
            if problem:
                report(source, line, problem + ": " + target)
                continue
            if path is None:
                continue
            try:
                path.resolve().relative_to(root)
            except (ValueError, OSError, RuntimeError):
                report(source, line, "local link escapes repository: " + target)
                continue
            if not path.exists():
                report(source, line, "local link target does not exist: " + target)
                continue
            if fragment and path.suffix.lower() == ".md" and path.is_file():
                content = read(path, True)
                if content is not None and fragment not in heading_anchors(content):
                    report(source, line, "Markdown anchor does not exist: " + target)
    return list(dict.fromkeys(errors))


def main(argv: list[str] | None = None, root: Path | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--changes", required=True, type=Path)
    args = parser.parse_args(argv)
    try:
        manifest = json.loads(args.changes.read_text(encoding="utf-8"))
        errors = validate_changes(root or Path(__file__).resolve().parents[1], manifest)
    except (OSError, UnicodeError, ValueError) as exc:
        print(f"DOCUMENTATION_CHECK_INVALID: {exc}", file=sys.stderr)
        return 2
    if errors:
        for error in errors:
            print(error, file=sys.stderr)
        print(f"DOCUMENTATION_CHECK_FAILED: {len(errors)} issue(s).", file=sys.stderr)
        return 1
    print("DOCUMENTATION_CHECK: passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
