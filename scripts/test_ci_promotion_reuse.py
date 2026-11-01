import copy
from datetime import datetime, timedelta, timezone
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
from urllib.error import HTTPError, URLError

SPEC = importlib.util.spec_from_file_location("reuse_ci_validation", Path(__file__).with_name("reuse-ci-validation.py"))
reuse = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(reuse)
NOW = datetime(2026, 11, 1, 12, tzinfo=timezone.utc)
SHA = "a" * 40
REPO = "synthetic/ClinIA"
BASE = "/repos/" + REPO
ENV = {"GITHUB_EVENT_NAME": "push", "GITHUB_REF": "refs/heads/coolify", "GITHUB_RUN_ATTEMPT": "1",
       "GITHUB_RUN_ID": "900", "GITHUB_REPOSITORY": REPO, "GITHUB_SHA": SHA,
       "GITHUB_TOKEN": "synthetic-token-do-not-log", "GITHUB_API_URL": "https://api.github.com"}
CONTRACT = {
    "Classify changes and check documentation": [
        "Test CI routing and documentation checks", "Test change classification", "Test promotion validation reuse",
        "Classify the complete event diff", "Check Markdown format and local links"],
    "Backend tests and audit": [
        "Require successful routing and documentation validation", "Run actions/checkout@v4", "Run actions/setup-node@v4",
        "Run bash ../scripts/ci-local.sh backend install", "Run bash ../scripts/ci-local.sh backend audit",
        "Run bash ../scripts/ci-local.sh backend tests", "Authentication service isolation (regression seed 3)",
        "Prepare disposable MongoDB integration image", "Disposable MongoDB integration (email quota and booking concurrency)",
        "Archive minimized validation evidence (also on failure)"],
    "Frontend tests, build and audit": [
        "Require successful routing and documentation validation", "Run actions/checkout@v4", "Run actions/setup-node@v4",
        "Run bash ../scripts/ci-local.sh frontend install", "Run bash ../scripts/ci-local.sh frontend audit",
        "TypeScript type check", "Run bash ../scripts/ci-local.sh frontend tests", "Run bash ../scripts/ci-local.sh frontend build"],
}


def stamp(hours=0):
    return (NOW + timedelta(hours=hours)).isoformat().replace("+00:00", "Z")


def run_fixture(run_id=100, **changes):
    return {"id": run_id, "name": "CI", "path": ".github/workflows/ci.yml", "workflow_id": 10,
            "head_sha": SHA, "event": "push", "head_branch": "maintenance/synthetic-release",
            "run_attempt": 1, "status": "completed", "conclusion": "success",
            "created_at": stamp(-2), "updated_at": stamp(-1),
            "repository": {"id": 20, "full_name": REPO}, "head_repository": {"id": 20, "full_name": REPO},
            "jobs_url": "https://untrusted.example/jobs", **changes}


def jobs_fixture():
    # Actual attempt endpoint projection: no fabricated run_attempt on jobs.
    return [{"id": index + 1, "run_id": 100, "head_sha": SHA, "name": name,
             "status": "completed", "conclusion": "success",
             "steps": [{"name": step, "number": number + 1, "status": "completed", "conclusion": "success",
                        "started_at": stamp(-1.6), "completed_at": stamp(-1.4)}
                       for number, step in enumerate(steps)]}
            for index, (name, steps) in enumerate(CONTRACT.items())]


def artifact_fixture():
    return {"id": 50, "name": "reception-validation-" + SHA, "expired": False, "size_in_bytes": 100,
            "created_at": stamp(-1.5), "expires_at": stamp(24),
            "archive_download_url": "https://untrusted.example/secret", "workflow_run": {
                "id": 100, "head_sha": SHA, "head_branch": "maintenance/synthetic-release",
                "repository_id": 20, "head_repository_id": 20}}


class FakeClient:
    def __init__(self):
        self.run = run_fixture()
        self.runs = [copy.deepcopy(self.run)]
        self.final_run = None
        self.final_runs = None
        self.workflow = {"id": 10, "name": "CI", "path": ".github/workflows/ci.yml", "state": "active"}
        self.repository = {"id": 20, "full_name": REPO}
        self.jobs = jobs_fixture()
        self.artifacts = [artifact_fixture()]
        self.calls, self.reads, self.list_reads = [], 0, 0
        self.failure = None
        self.pages = {}

    def get(self, path, params=None):
        self.calls.append((path, params))
        if self.failure:
            raise self.failure
        if path in self.pages:
            return copy.deepcopy(self.pages[path][params["page"] - 1])
        if path == BASE + "/actions/workflows/ci.yml":
            return copy.deepcopy(self.workflow)
        if path == BASE:
            return copy.deepcopy(self.repository)
        if path.endswith("/ci.yml/runs"):
            self.list_reads += 1
            rows = self.final_runs if self.list_reads > 1 and self.final_runs is not None else self.runs
            return {"total_count": len(rows), "workflow_runs": copy.deepcopy(rows)}
        if path == BASE + "/actions/runs/100":
            self.reads += 1
            return copy.deepcopy(self.final_run if self.reads > 1 and self.final_run is not None else self.run)
        if path == BASE + "/actions/runs/100/attempts/" + str(self.run["run_attempt"]) + "/jobs":
            return {"total_count": len(self.jobs), "jobs": copy.deepcopy(self.jobs)}
        if path == BASE + "/actions/runs/100/artifacts":
            return {"total_count": len(self.artifacts), "artifacts": copy.deepcopy(self.artifacts)}
        raise AssertionError("Unexpected endpoint")


class ReuseTests(unittest.TestCase):
    def setUp(self):
        self.client = FakeClient()

    def decide(self, **env_changes):
        return reuse.decide_reuse({**ENV, **env_changes}, self.client, NOW)

    def reject(self, **env_changes):
        result = self.decide(**env_changes)
        self.assertIs(result["reuse_validated"], False, result)
        self.assertEqual(result["source_run_id"], "")
        self.assertEqual(result["source_run_url"], "")
        self.assertIn(result["reason"], reuse.REASONS)
        return result

    def sync_run(self):
        self.client.runs = [copy.deepcopy(self.client.run)]

    def test_valid_full_proof_with_attempt_scoped_jobs_and_canonical_url(self):
        self.assertEqual({key: list(value) for key, value in reuse.REQUIRED_STEPS.items()}, CONTRACT)
        self.assertEqual(self.decide(), {"reuse_validated": True, "source_run_id": 100,
            "source_run_url": "https://github.com/synthetic/ClinIA/actions/runs/100", "reason": "validated"})
        self.assertIn((BASE + "/actions/runs/100/attempts/1/jobs", {"per_page": 100, "page": 1}), self.client.calls)
        list_calls = [params for path, params in self.client.calls if path.endswith("/ci.yml/runs")]
        self.assertTrue(all(params == {"head_sha": SHA, "event": "push", "per_page": 100, "page": 1} for params in list_calls))
        self.assertTrue(all("untrusted" not in path and "/logs" not in path and "/zip" not in path for path, _ in self.client.calls))

    def test_ineligible_event_ref_or_attempt_does_not_call_api(self):
        for changes in [{"GITHUB_EVENT_NAME": "pull_request"}, {"GITHUB_EVENT_NAME": "workflow_dispatch"},
                        {"GITHUB_REF": "refs/heads/maintenance/release"}, {"GITHUB_REF": "refs/pull/1/merge"},
                        {"GITHUB_RUN_ATTEMPT": "2"}, {"GITHUB_RUN_ATTEMPT": ""}]:
            with self.subTest(changes=changes):
                self.client.calls.clear()
                self.reject(**changes)
                self.assertEqual(self.client.calls, [])

    def test_invalid_or_missing_context_or_token_does_not_call_api(self):
        for changes in [{"GITHUB_TOKEN": ""}, {"GITHUB_TOKEN": "unsafe\nheader"},
                        {"GITHUB_SHA": "a" * 39}, {"GITHUB_SHA": "0" * 40},
                        {"GITHUB_RUN_ID": "900\ntrue"}, {"GITHUB_REPOSITORY": "owner/../other"},
                        {"GITHUB_API_URL": "https://api.github.com.attacker.test"},
                        {"GITHUB_API_URL": "https://api.github.com/"}]:
            with self.subTest(changes=changes):
                self.client.calls.clear()
                self.reject(**changes)
                self.assertEqual(self.client.calls, [])

    def test_workflow_and_repository_endpoint_identity_required(self):
        for target, field, value in [("workflow", "id", 0), ("workflow", "name", "Other"),
                                    ("workflow", "path", ".github/workflows/other.yml"),
                                    ("workflow", "state", "disabled_manually"),
                                    ("repository", "full_name", "fork/ClinIA")]:
            with self.subTest(field=field, value=value):
                self.client = FakeClient()
                getattr(self.client, target)[field] = value
                self.reject()

    def test_source_identity_event_branch_and_attempt_are_checked(self):
        for changes in [{"head_sha": "b" * 40}, {"workflow_id": 11}, {"path": "other.yml"},
                        {"name": "Other"}, {"event": "pull_request"}, {"run_attempt": 0},
                        {"repository": {"id": 21, "full_name": REPO}},
                        {"head_repository": {"id": 21, "full_name": "fork/ClinIA"}}]:
            with self.subTest(changes=changes):
                self.client = FakeClient()
                self.client.run.update(changes)
                self.sync_run()
                self.reject()
        self.client = FakeClient()
        self.client.runs = [run_fixture(head_branch="coolify")]
        self.reject()

    def test_source_own_run_cannot_be_used(self):
        self.client.runs = [run_fixture(run_id=900)]
        self.assertEqual(self.reject()["reason"], "no_candidate")

    def test_failed_pending_or_cancelled_latest_run_cannot_fall_back_to_older_success(self):
        for state, conclusion in [("completed", "failure"), ("queued", None), ("in_progress", None), ("completed", "cancelled")]:
            with self.subTest(state=state):
                self.client = FakeClient()
                self.client.run.update(status=state, conclusion=conclusion, run_attempt=2)
                self.client.runs = [run_fixture(run_id=99, updated_at=stamp(-2)), copy.deepcopy(self.client.run)]
                self.assertEqual(self.reject()["reason"], "source_not_successful")

    def test_latest_updated_rerun_is_selected_instead_of_latest_created_run(self):
        self.client.run.update(created_at=stamp(-4), updated_at=stamp(-0.5), run_attempt=2)
        self.client.runs = [run_fixture(run_id=101, created_at=stamp(-3), updated_at=stamp(-1)), copy.deepcopy(self.client.run)]
        self.assertTrue(self.decide()["reuse_validated"])
        self.assertTrue(any("/attempts/2/jobs" in path for path, _ in self.client.calls))

    def test_same_update_time_is_ambiguous(self):
        self.client.runs.append(run_fixture(run_id=101))
        self.assertEqual(self.reject()["reason"], "ambiguous_metadata")

    def test_ttl_is_creation_not_recent_update_and_rejects_future_or_naive_dates(self):
        for changes in [{"created_at": stamp(-25)}, {"created_at": stamp(-24)},
                        {"created_at": stamp(1), "updated_at": stamp(2)}, {"updated_at": stamp(1)},
                        {"created_at": "2026-11-01T10:00:00"}, {"created_at": "not-a-date"}]:
            with self.subTest(changes=changes):
                self.client = FakeClient()
                self.client.run.update(changes)
                self.sync_run()
                self.reject()

    def test_every_required_step_must_run_successfully_once(self):
        for job_index, names in enumerate(CONTRACT.values()):
            for step_index, step_name in enumerate(names):
                for mode in ("skipped", "failure", "pending", "missing", "duplicate"):
                    with self.subTest(step=step_name, mode=mode):
                        self.client = FakeClient()
                        steps = self.client.jobs[job_index]["steps"]
                        if mode == "missing":
                            steps.pop(step_index)
                        elif mode == "duplicate":
                            steps.append(copy.deepcopy(steps[step_index]))
                        else:
                            steps[step_index].update(conclusion=mode, status="queued" if mode == "pending" else "completed")
                        self.assertEqual(self.reject()["reason"], "incomplete_jobs")

    def test_docs_only_or_transitively_reused_success_is_not_a_full_validation(self):
        for name in ("Run actions/checkout@v4", "Run bash ../scripts/ci-local.sh backend tests"):
            with self.subTest(skipped=name):
                self.client = FakeClient()
                for step in self.client.jobs[1]["steps"]:
                    if step["name"] == name:
                        step["conclusion"] = "skipped"
                self.assertEqual(self.reject()["reason"], "incomplete_jobs")

    def test_job_identity_state_missing_and_duplicate_rejected(self):
        for changes in [{"head_sha": "b" * 40}, {"run_id": 99}, {"status": "in_progress"}, {"conclusion": "skipped"}]:
            with self.subTest(changes=changes):
                self.client = FakeClient()
                self.client.jobs[1].update(changes)
                self.reject()
        for mode in ("missing", "duplicate"):
            self.client = FakeClient()
            if mode == "missing":
                self.client.jobs.pop()
            else:
                duplicate = copy.deepcopy(self.client.jobs[-1])
                duplicate["id"] = 99
                self.client.jobs.append(duplicate)
            self.reject()

    def test_artifact_is_unique_exact_name_nonempty_unexpired_and_same_run_repository_sha(self):
        for changes in [{"expired": True}, {"size_in_bytes": 0}, {"name": "other"},
                        {"expires_at": stamp(-1)}, {"created_at": stamp(1)},
                        {"workflow_run": {"id": 99, "head_sha": SHA}},
                        {"workflow_run": {**artifact_fixture()["workflow_run"], "head_sha": "b" * 40}},
                        {"workflow_run": {**artifact_fixture()["workflow_run"], "head_repository_id": 99}}]:
            with self.subTest(changes=changes):
                self.client = FakeClient()
                self.client.artifacts[0].update(changes)
                self.reject()
        for mode in ("missing", "duplicate"):
            self.client = FakeClient()
            if mode == "missing":
                self.client.artifacts = []
            else:
                self.client.artifacts.append({**artifact_fixture(), "id": 51})
            self.reject()

    def test_artifact_from_older_attempt_cannot_attest_current_successful_attempt(self):
        self.client.run.update(run_attempt=2, updated_at=stamp(-0.1))
        self.sync_run()
        upload = self.client.jobs[1]["steps"][-1]
        upload.update(started_at=stamp(-0.6), completed_at=stamp(-0.4))
        self.assertEqual(self.reject()["reason"], "invalid_artifact")
        # A unique artifact uploaded by the current complete attempt is eligible.
        self.client.artifacts[0]["created_at"] = stamp(-0.5)
        self.assertTrue(self.decide()["reuse_validated"])

    def test_missing_or_inverted_upload_timestamps_cannot_prove_an_artifact(self):
        for times in [{"started_at": None}, {"completed_at": None},
                      {"started_at": stamp(-1), "completed_at": stamp(-2)}]:
            with self.subTest(times=times):
                self.client = FakeClient()
                self.client.jobs[1]["steps"][-1].update(times)
                self.reject()

    def test_run_reread_detects_attempt_status_sha_workflow_or_identity_race(self):
        for changes in [{"run_attempt": 2}, {"status": "in_progress", "conclusion": None},
                        {"head_sha": "b" * 40}, {"workflow_id": 11}, {"id": 101},
                        {"updated_at": stamp(-0.5)}]:
            with self.subTest(changes=changes):
                self.client = FakeClient()
                self.client.final_run = {**self.client.run, **changes}
                self.reject()

    def test_newer_source_during_validation_and_source_changed_before_jobs_fail_closed(self):
        self.client.final_runs = [self.client.run, run_fixture(run_id=101, updated_at=stamp(-0.5))]
        self.reject()
        self.client = FakeClient()
        self.client.run["run_attempt"] = 2
        self.assertEqual(self.reject()["reason"], "source_changed")

    def test_complete_bounded_pagination_supported_without_using_link(self):
        jobs_path = BASE + "/actions/runs/100/attempts/1/jobs"
        self.client.pages[jobs_path] = [
            {"total_count": 3, "jobs": self.client.jobs[:1], "Link": "https://untrusted.example/token"},
            {"total_count": 3, "jobs": self.client.jobs[1:]},
        ]
        self.assertTrue(self.decide()["reuse_validated"])
        self.assertIn((jobs_path, {"per_page": 100, "page": 2}), self.client.calls)

    def test_artifact_on_second_page_is_found_and_source_listing_is_fully_checked(self):
        artifacts_path = BASE + "/actions/runs/100/artifacts"
        self.client.pages[artifacts_path] = [
            {"total_count": 2, "artifacts": [{**artifact_fixture(), "id": 51, "name": "unrelated"}]},
            {"total_count": 2, "artifacts": [artifact_fixture()]},
        ]
        self.assertTrue(self.decide()["reuse_validated"])
        self.client = FakeClient()
        self.client.pages[BASE + "/actions/workflows/ci.yml/runs"] = [
            {"total_count": 2, "workflow_runs": [run_fixture(run_id=99, created_at=stamp(-4), updated_at=stamp(-3))]},
            {"total_count": 2, "workflow_runs": [self.client.run]},
        ]
        self.assertTrue(self.decide()["reuse_validated"])

    def test_evidence_expiring_during_checks_fails_closed(self):
        self.client.artifacts[0]["expires_at"] = stamp(0.0001)
        times = iter([NOW, NOW, NOW + timedelta(seconds=1)])
        result = reuse.decide_reuse(ENV, self.client, lambda: next(times))
        self.assertFalse(result["reuse_validated"])
        self.assertEqual(result["reason"], "invalid_artifact")

    def test_incomplete_over_limit_duplicate_or_changing_pagination_is_not_proof(self):
        path = BASE + "/actions/runs/100/attempts/1/jobs"
        for pages in [
            [{"total_count": 101, "jobs": []}], [{"total_count": 3, "jobs": []}],
            [{"total_count": 3, "jobs": self.client.jobs[:1]}, {"total_count": 4, "jobs": self.client.jobs[1:]}],
            [{"total_count": 3, "jobs": [self.client.jobs[0], self.client.jobs[0], self.client.jobs[1]]}],
            [{"total_count": "3", "jobs": self.client.jobs}],
        ]:
            with self.subTest(pages=pages):
                self.client = FakeClient()
                self.client.pages[path] = pages
                self.reject()

    def test_next_page_header_cannot_contradict_a_complete_count(self):
        path = BASE + "/actions/runs/100/attempts/1/jobs"
        self.client.pages[path] = [reuse.MetadataResponse({"total_count": 3, "jobs": self.client.jobs}, has_next=True)]
        self.assertEqual(self.reject()["reason"], "incomplete_metadata")

    def test_api_error_timeout_malformed_response_and_rate_limit_fall_back_without_details(self):
        for error in [TimeoutError("synthetic-token-do-not-log"), URLError("offline"),
                      HTTPError("https://api.github.com", 429, "rate", {}, None),
                      json.JSONDecodeError("invalid", "secret", 0), ValueError("schema")]:
            with self.subTest(error=type(error).__name__):
                self.client = FakeClient()
                self.client.failure = error
                result = self.reject()
                self.assertEqual(result["reason"], "metadata_unavailable")
                self.assertNotIn(ENV["GITHUB_TOKEN"], json.dumps(result))


class ClientAndCliTests(unittest.TestCase):
    def test_redirects_are_never_followed(self):
        self.assertIsNone(reuse.NoRedirect().redirect_request(None, None, 302, "redirect", {}, "https://untrusted.example"))

    def test_client_constructs_origin_and_enforces_http_json_size_and_rate_constraints(self):
        class Response:
            status, headers = 200, {}
            body = b'{"ok":true}'
            def __enter__(self): return self
            def __exit__(self, *args): return None
            def read(self, limit): return self.body[:limit]
        client = reuse.GitHubClient("synthetic-token")
        response = Response()
        with patch.object(client.opener, "open", return_value=response) as opened:
            self.assertEqual(client.get(BASE + "/actions/workflows/ci.yml"), {"ok": True})
            request = opened.call_args.args[0]
            self.assertTrue(request.full_url.startswith("https://api.github.com/repos/"))
            self.assertEqual(request.get_header("Authorization"), "Bearer synthetic-token")
            self.assertLessEqual(opened.call_args.kwargs["timeout"], 8)
            response.headers = {"Link": '<https://untrusted.example/next>; rel="next"'}
            self.assertTrue(client.get(BASE).has_next)
            response.headers = {}
            for body in (b'{"a":1,"a":2}', b'{"a":NaN}', b'invalid', b'x' * 2_000_001):
                response.body = body
                with self.subTest(body_size=len(body)), self.assertRaises(ValueError):
                    client.get(BASE)
            response.body = b'{}'
            response.headers = {"X-RateLimit-Remaining": "0"}
            with self.assertRaises(ValueError): client.get(BASE)
            response.headers, response.status = {}, 302
            with self.assertRaises(ValueError): client.get(BASE)
        with self.assertRaises(ValueError): client.get("https://untrusted.example")

    def test_global_request_and_wall_clock_budgets_prevent_more_network_calls(self):
        with patch.object(reuse.time, "monotonic", return_value=0):
            client = reuse.GitHubClient("synthetic-token")
        with patch.object(reuse.time, "monotonic", return_value=26), patch.object(client.opener, "open") as opened:
            with self.assertRaises(TimeoutError): client.get(BASE)
            opened.assert_not_called()
        client.requests = 16
        with patch.object(reuse.time, "monotonic", return_value=1), patch.object(client.opener, "open") as opened:
            with self.assertRaises(TimeoutError): client.get(BASE)
            opened.assert_not_called()

    def test_cli_safe_false_outputs_and_no_token_echo(self):
        with tempfile.TemporaryDirectory() as directory:
            report, output = Path(directory) / "report.json", Path(directory) / "github-output"
            env = {**os.environ, **ENV, "GITHUB_TOKEN": "", "GITHUB_OUTPUT": str(output)}
            completed = subprocess.run([sys.executable, str(Path(reuse.__file__)), "--output", str(report)],
                                       env=env, check=True, text=True, capture_output=True)
            self.assertFalse(json.loads(report.read_text())["reuse_validated"])
            self.assertEqual(output.read_text(), "reuse_validated=false\nsource_run_id=\nsource_run_url=\nreason=missing_token\n")
            self.assertNotIn("synthetic-token", completed.stdout + completed.stderr)

    def test_cli_success_outputs_are_canonical_and_exact(self):
        with tempfile.TemporaryDirectory() as directory:
            report, output = Path(directory) / "report.json", Path(directory) / "github-output"
            with patch.dict(os.environ, {**ENV, "GITHUB_OUTPUT": str(output)}, clear=True), \
                    patch.object(reuse, "decide_reuse", wraps=lambda env: reuse_decision(env)):
                reuse.main(["--output", str(report)])
            self.assertEqual(json.loads(report.read_text())["source_run_id"], 100)
            self.assertIn("reuse_validated=true\nsource_run_id=100\n", output.read_text())
            self.assertIn("source_run_url=https://github.com/synthetic/ClinIA/actions/runs/100\n", output.read_text())


def reuse_decision(env):
    # Keep the real decision function for CLI integration while fixing the clock.
    return ORIGINAL_DECISION(env, FakeClient(), NOW)


ORIGINAL_DECISION = reuse.decide_reuse

if __name__ == "__main__":
    unittest.main()
