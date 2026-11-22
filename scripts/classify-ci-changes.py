#!/usr/bin/env python3
"""Classify exact GitHub event commits without dependencies or path interpolation."""
import argparse
import json
import os
from pathlib import Path, PurePosixPath
import re
import subprocess

ROOT_DOCUMENTS = {"PROJECT_STATE.md", "RUNNING.md"}
WALKIN_SCRIPTS = {
    "scripts/walkin-chrome/" + name
    for name in ("chrome.mjs", "fixtures.mjs", "mongo-check.template.mjs", "passe.mjs")
}
WALKIN_GUIDE = "scripts/walkin-chrome/README.md"
SHA = re.compile(r"^[0-9a-fA-F]{40,64}$")


def is_documentation(path):
    parts = PurePosixPath(path).parts
    if (not parts or path.startswith("/") or any(part in (".", "..") for part in parts)
            or any(ord(char) < 32 for char in path) or "\\" in path
            or parts[-1] == "AGENTS.md" or not path.endswith(".md")):
        return False
    return (path in ROOT_DOCUMENTS or bool(re.fullmatch(r"README(?:[.][A-Za-z-]+)?[.]md", path))
            or len(parts) > 1 and parts[0] in ("docs", "scripts"))


def git(root, *args):
    return subprocess.check_output(["git", "-C", str(root), *args], stderr=subprocess.DEVNULL)


def classify(root, event, base, head):
    result = {"scope": "full", "docs_only": False, "changed_files": [], "reason": "full application validation"}
    if event not in ("pull_request", "push"):
        result["reason"] = "manual or unsupported event: full validation"
        return result
    if any(not SHA.fullmatch(value or "") or not value.strip("0") for value in (base, head)):
        result["reason"] = "missing commit range: full validation"
        return result
    try:
        for value in (base, head):
            git(root, "cat-file", "-e", value + "^{commit}")
        comparison_base = (git(root, "merge-base", base, head).decode().strip()
                           if event == "pull_request" else base)
        paths = git(root, "diff", "--name-only", "--no-renames", "-z", comparison_base, head, "--")
        changed = sorted(set(path.decode("utf-8", errors="strict") for path in paths.split(b"\0") if path))
    except (subprocess.CalledProcessError, UnicodeError):
        result["reason"] = "commit comparison unavailable: full validation"
        return result
    result["changed_files"] = changed
    result["docs_only"] = bool(changed) and all(is_documentation(path) for path in changed)
    if result["docs_only"]:
        result.update(scope="docs", reason="documentation only")
    elif WALKIN_SCRIPTS.intersection(changed) and set(changed) <= WALKIN_SCRIPTS | {WALKIN_GUIDE}:
        result.update(scope="walkin", reason="WalkIn scripts: targeted scenario and cleanup validation")
    return result


def event_range(event, event_file, root=None):
    try:
        data = json.loads(Path(event_file).read_text(encoding="utf-8"))
        if event == "pull_request":
            return data["pull_request"]["base"]["sha"], data["pull_request"]["head"]["sha"]
        base, head = data.get("before"), data.get("after")
        if event == "push" and data.get("created") is True and base in ("0" * 40, "0" * 64):
            ref = data.get("ref")
            if (root is None or not isinstance(head, str) or not SHA.fullmatch(head)
                    or not head.strip("0") or not isinstance(ref, str)
                    or not ref.startswith("refs/heads/") or ref == "refs/heads/coolify"
                    or data.get("deleted") is not False):
                return None, None
            if git(root, "rev-parse", "--is-shallow-repository").strip() != b"false":
                return None, None
            # Include every branch commit, even when the last one only edits docs.
            # checkout fetch-depth: 0 supplies this fixed comparison reference.
            base = git(root, "merge-base", "--all", "refs/remotes/origin/coolify", head).decode().strip()
        return base, head
    except (OSError, ValueError, KeyError, TypeError, subprocess.CalledProcessError, UnicodeError):
        return None, None


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--event", default=os.environ.get("GITHUB_EVENT_NAME", "workflow_dispatch"))
    parser.add_argument("--base")
    parser.add_argument("--head")
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    base, head = ((args.base, args.head) if args.base or args.head
                  else event_range(args.event, os.environ.get("GITHUB_EVENT_PATH", ""), root))
    result = classify(root, args.event, base, head)
    Path(args.output).write_text(json.dumps(result, ensure_ascii=True) + "\n", encoding="utf-8")
    if os.environ.get("GITHUB_OUTPUT"):
        with open(os.environ["GITHUB_OUTPUT"], "a", encoding="utf-8") as output:
            output.write("scope=" + result["scope"] + "\n")
            output.write("docs_only=" + str(result["docs_only"]).lower() + "\n")
    print(result["reason"] + "; files=" + str(len(result["changed_files"])))


if __name__ == "__main__":
    main()
