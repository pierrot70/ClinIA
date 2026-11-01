#!/usr/bin/env python3
"""Reuse only a recent, fully executed maintenance CI proof for the same commit.

Metadata only: no artifact downloads, job logs, redirects or returned URLs.
Any unavailable, incomplete or ambiguous proof selects full validation.
"""
import argparse
from datetime import datetime, timedelta, timezone
import json
import os
from pathlib import Path
import re
import time
from urllib.parse import urlencode
from urllib.request import HTTPRedirectHandler, Request, build_opener

API_ORIGIN = "https://api.github.com"
WORKFLOW_PATH = ".github/workflows/ci.yml"
MAX_ITEMS = 100
REASONS = {"not_eligible", "invalid_context", "missing_token", "invalid_workflow",
           "invalid_source", "no_candidate", "ambiguous_metadata", "incomplete_metadata",
           "source_changed", "source_not_successful", "source_stale", "incomplete_jobs",
           "invalid_artifact", "metadata_unavailable", "validated"}
REQUIRED_STEPS = {
    "Classify changes and check documentation": (
        "Test CI routing and documentation checks",
        "Test change classification",
        "Test promotion validation reuse",
        "Classify the complete event diff",
        "Check Markdown format and local links",
    ),
    "Backend tests and audit": (
        "Require successful routing and documentation validation",
        "Run actions/checkout@v4",
        "Run actions/setup-node@v4",
        "Run bash ../scripts/ci-local.sh backend install",
        "Run bash ../scripts/ci-local.sh backend audit",
        "Run bash ../scripts/ci-local.sh backend tests",
        "Authentication service isolation (regression seed 3)",
        "Prepare disposable MongoDB integration image",
        "Disposable MongoDB integration (email quota and booking concurrency)",
        "Archive minimized validation evidence (also on failure)",
    ),
    "Frontend tests, build and audit": (
        "Require successful routing and documentation validation",
        "Run actions/checkout@v4",
        "Run actions/setup-node@v4",
        "Run bash ../scripts/ci-local.sh frontend install",
        "Run bash ../scripts/ci-local.sh frontend audit",
        "TypeScript type check",
        "Run bash ../scripts/ci-local.sh frontend tests",
        "Run bash ../scripts/ci-local.sh frontend build",
    ),
}


class UnusableProof(Exception):
    """Only fixed reason codes cross the reporting boundary."""


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def _unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("duplicate JSON key")
        result[key] = value
    return result


def _reject_constant(_value):
    raise ValueError("non-finite JSON")


class MetadataResponse(dict):
    def __init__(self, payload, has_next=False):
        super().__init__(payload)
        self.has_next = has_next


class GitHubClient:
    """Read canonical REST endpoints with a bounded token-bearing request budget."""
    def __init__(self, token):
        self.token = token
        self.opener = build_opener(NoRedirect())
        self.deadline = time.monotonic() + 25
        self.requests = 0

    def get(self, path, params=None):
        if (not path.startswith("/repos/") or any(x in path for x in ("..", "\\", "?", "#", ":"))):
            raise ValueError("invalid API path")
        self.requests += 1
        remaining = self.deadline - time.monotonic()
        if self.requests > 16 or remaining <= 0:
            raise TimeoutError("API budget exhausted")
        url = API_ORIGIN + path + ("?" + urlencode(params) if params else "")
        request = Request(url, headers={
            "Accept": "application/vnd.github+json",
            "Authorization": "Bearer " + self.token,
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "ClinIA-CI-validation-reuse",
        })
        with self.opener.open(request, timeout=min(8, remaining)) as response:
            if response.status != 200 or response.headers.get("X-RateLimit-Remaining") == "0":
                raise ValueError("API unavailable")
            body = response.read(2_000_001)
            # Observe the pagination signal only; never use its destination.
            has_next = bool(re.search(r'rel\s*=\s*"next"', response.headers.get("Link", "")))
        if len(body) > 2_000_000:
            raise ValueError("API response too large")
        payload = json.loads(body, object_pairs_hook=_unique_object,
                             parse_constant=_reject_constant)
        if not isinstance(payload, dict):
            raise ValueError("invalid metadata object")
        return MetadataResponse(payload, has_next)


def _require(condition, reason):
    if not condition:
        raise UnusableProof(reason)


def _positive(value):
    return type(value) is int and value > 0


def _date(value):
    _require(isinstance(value, str), "invalid_source")
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    _require(parsed.tzinfo is not None, "invalid_source")
    return parsed.astimezone(timezone.utc)


def _collection(client, path, key, params=None):
    """Ignore Link/returned URLs; prove the complete bounded collection by count."""
    result, seen, total = [], set(), None
    for page in range(1, MAX_ITEMS + 1):
        data = client.get(path, {**(params or {}), "per_page": MAX_ITEMS, "page": page})
        _require(isinstance(data, dict), "incomplete_metadata")
        count, rows = data.get("total_count"), data.get(key)
        _require(type(count) is int and 0 <= count <= MAX_ITEMS and isinstance(rows, list), "incomplete_metadata")
        _require(total is None or total == count, "incomplete_metadata")
        total = count
        for row in rows:
            _require(isinstance(row, dict) and _positive(row.get("id")) and row["id"] not in seen, "ambiguous_metadata")
            seen.add(row["id"])
            result.append(row)
        _require(len(result) <= total, "incomplete_metadata")
        if len(result) == total:
            _require(not getattr(data, "has_next", False), "incomplete_metadata")
            return result
        _require(bool(rows), "incomplete_metadata")
    raise UnusableProof("incomplete_metadata")


def _run_identity(run, repo, repo_id, sha, workflow_id, self_id):
    _require(isinstance(run, dict), "invalid_source")
    _require(_positive(run.get("id")) and run["id"] != self_id, "invalid_source")
    for field in ("repository", "head_repository"):
        entity = run.get(field)
        _require(isinstance(entity, dict) and entity.get("full_name") == repo
                 and _positive(entity.get("id")) and entity.get("id") == repo_id, "invalid_source")
    branch = run.get("head_branch")
    _require(isinstance(branch, str) and branch.startswith("maintenance/")
             and len(branch) > len("maintenance/") and not any(ord(c) < 32 for c in branch), "invalid_source")
    _require(run.get("head_sha") == sha and run.get("event") == "push"
             and _positive(run.get("workflow_id")) and run.get("workflow_id") == workflow_id and run.get("path") == WORKFLOW_PATH
             and run.get("name") == "CI" and _positive(run.get("run_attempt")), "invalid_source")


def _signature(run):
    return tuple(run.get(key) for key in (
        "id", "head_sha", "head_branch", "workflow_id", "path", "name", "event",
        "run_attempt", "status", "conclusion", "created_at", "updated_at"))


def _select(runs, repo, repo_id, sha, workflow_id, self_id, now):
    candidates = []
    for run in runs:
        if run["id"] == self_id or not str(run.get("head_branch", "")).startswith("maintenance/"):
            continue
        _run_identity(run, repo, repo_id, sha, workflow_id, self_id)
        created, updated = _date(run.get("created_at")), _date(run.get("updated_at"))
        _require(created <= updated <= now, "invalid_source")
        candidates.append((updated, run))
    _require(bool(candidates), "no_candidate")
    latest = max(item[0] for item in candidates)
    matches = [run for updated, run in candidates if updated == latest]
    _require(len(matches) == 1, "ambiguous_metadata")
    return matches[0]


def _validate_jobs(jobs, run, sha):
    for job in jobs:
        _require(_positive(job.get("run_id")) and job.get("run_id") == run["id"] and job.get("head_sha") == sha
                 and job.get("status") == "completed" and job.get("conclusion") == "success", "incomplete_jobs")
    for name, required in REQUIRED_STEPS.items():
        matches = [job for job in jobs if job.get("name") == name]
        _require(len(matches) == 1, "incomplete_jobs")
        steps = matches[0].get("steps")
        _require(isinstance(steps, list) and all(isinstance(step, dict) for step in steps), "incomplete_jobs")
        for step_name in required:
            matching_steps = [step for step in steps if step.get("name") == step_name]
            _require(len(matching_steps) == 1 and matching_steps[0].get("status") == "completed"
                     and matching_steps[0].get("conclusion") == "success", "incomplete_jobs")
    archive = next(job for job in jobs if job["name"] == "Backend tests and audit")
    upload = next(step for step in archive["steps"]
                  if step["name"] == "Archive minimized validation evidence (also on failure)")
    # The artifact has no attempt field. Bind its creation to this attempt's
    # successful upload step instead of accepting a surviving older artifact.
    started, completed = _date(upload.get("started_at")), _date(upload.get("completed_at"))
    _require(started <= completed, "incomplete_jobs")
    return started, completed


def _validate_artifact(artifacts, run, repo_id, sha, now, upload_window):
    matches = [item for item in artifacts if item.get("name") == "reception-validation-" + sha]
    _require(len(matches) == 1, "invalid_artifact")
    artifact = matches[0]
    proof = artifact.get("workflow_run")
    _require(artifact.get("expired") is False and _positive(artifact.get("size_in_bytes"))
             and isinstance(proof, dict) and _positive(proof.get("id")) and proof.get("id") == run["id"]
             and proof.get("head_sha") == sha and proof.get("head_branch") == run["head_branch"]
             and _positive(proof.get("repository_id")) and _positive(proof.get("head_repository_id"))
             and proof.get("repository_id") == repo_id and proof.get("head_repository_id") == repo_id,
             "invalid_artifact")
    created = _date(artifact.get("created_at"))
    _require(_date(run["created_at"]) <= created <= now and upload_window[0] <= created <= upload_window[1]
             and _date(artifact.get("expires_at")) > now, "invalid_artifact")


def decide_reuse(env, client=None, now=None):
    """Return a fixed-shape, fail-closed decision; injectable metadata client/clock."""
    result = {"reuse_validated": False, "source_run_id": "", "source_run_url": "", "reason": "not_eligible"}
    if (env.get("GITHUB_EVENT_NAME") != "push" or env.get("GITHUB_REF") != "refs/heads/coolify"
            or env.get("GITHUB_RUN_ATTEMPT") != "1"):
        return result
    try:
        repo, sha = env.get("GITHUB_REPOSITORY", ""), env.get("GITHUB_SHA", "")
        _require(bool(re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9-]{0,38}/[A-Za-z0-9_.-]+", repo))
                 and repo.split("/")[-1] not in (".", "..") and ".." not in repo
                 and bool(re.fullmatch(r"[0-9a-f]{40}", sha)) and sha != "0" * 40, "invalid_context")
        raw_id = env.get("GITHUB_RUN_ID", "")
        _require(bool(re.fullmatch(r"[1-9][0-9]*", raw_id)), "invalid_context")
        self_id = int(raw_id)
        _require(env.get("GITHUB_API_URL", API_ORIGIN) == API_ORIGIN, "invalid_context")
        token = env.get("GITHUB_TOKEN", "")
        _require(bool(token) and not any(c.isspace() for c in token), "missing_token")
        client = client if client is not None else GitHubClient(token)
        clock = (lambda: datetime.now(timezone.utc)) if now is None else (now if callable(now) else lambda: now)
        current = clock()
        _require(isinstance(current, datetime) and current.tzinfo is not None, "invalid_context")
        base = "/repos/" + repo
        workflow = client.get(base + "/actions/workflows/ci.yml")
        _require(isinstance(workflow, dict) and _positive(workflow.get("id"))
                 and workflow.get("path") == WORKFLOW_PATH and workflow.get("name") == "CI"
                 and workflow.get("state") == "active", "invalid_workflow")
        repository = client.get(base)
        _require(isinstance(repository, dict) and _positive(repository.get("id"))
                 and repository.get("full_name") == repo, "invalid_context")
        repo_id, workflow_id = repository["id"], workflow["id"]
        runs_path = base + "/actions/workflows/ci.yml/runs"
        params = {"head_sha": sha, "event": "push"}
        runs = _collection(client, runs_path, "workflow_runs", params)
        listed = _select(runs, repo, repo_id, sha, workflow_id, self_id, current)
        run_path = base + "/actions/runs/" + str(listed["id"])
        run = client.get(run_path)
        _run_identity(run, repo, repo_id, sha, workflow_id, self_id)
        _require(_signature(run) == _signature(listed), "source_changed")
        _require(run.get("status") == "completed" and run.get("conclusion") == "success", "source_not_successful")
        _require(timedelta(0) <= current - _date(run["created_at"]) < timedelta(hours=24), "source_stale")
        jobs = _collection(client, run_path + "/attempts/" + str(run["run_attempt"]) + "/jobs", "jobs")
        upload_window = _validate_jobs(jobs, run, sha)
        artifacts = _collection(client, run_path + "/artifacts", "artifacts")
        _validate_artifact(artifacts, run, repo_id, sha, current, upload_window)
        final = client.get(run_path)
        _run_identity(final, repo, repo_id, sha, workflow_id, self_id)
        _require(_signature(final) == _signature(run), "source_changed")
        latest = _select(_collection(client, runs_path, "workflow_runs", params), repo, repo_id, sha,
                         workflow_id, self_id, clock())
        _require(_signature(latest) == _signature(run), "source_changed")
        finished = clock()
        _require(timedelta(0) <= finished - _date(run["created_at"]) < timedelta(hours=24), "source_stale")
        _validate_artifact(artifacts, run, repo_id, sha, finished, upload_window)
        return {"reuse_validated": True, "source_run_id": run["id"],
                "source_run_url": "https://github.com/" + repo + "/actions/runs/" + str(run["id"]),
                "reason": "validated"}
    except UnusableProof as error:
        result["reason"] = str(error) if str(error) in REASONS else "metadata_unavailable"
    except Exception:
        # Deliberately do not print API bodies, exception strings, URLs or tokens.
        result["reason"] = "metadata_unavailable"
    return result


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", required=True)
    args = parser.parse_args(argv)
    result = decide_reuse(os.environ)
    Path(args.output).write_text(json.dumps(result, ensure_ascii=True) + "\n", encoding="utf-8")
    if os.environ.get("GITHUB_OUTPUT"):
        with open(os.environ["GITHUB_OUTPUT"], "a", encoding="utf-8") as output:
            for key, value in result.items():
                output.write(key + "=" + (str(value).lower() if type(value) is bool else str(value)) + "\n")
    print("CI validation reuse: " + result["reason"])


if __name__ == "__main__":
    main()
