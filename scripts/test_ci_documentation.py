"""Exercise the actual required-check gate, especially failed dependencies."""
import os
from pathlib import Path
import re
import subprocess
import unittest


class RequiredCheckGateTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        workflow = (Path(__file__).resolve().parents[1] / ".github/workflows/ci.yml").read_text()
        blocks = re.findall(r"        run: [|]\n((?:          .*\n)+)", workflow)
        cls.gates = ["\n".join(line[10:] for line in block.splitlines()) for block in blocks]
        if len(cls.gates) != 2:
            raise AssertionError("Both existing required checks must have an explicit gate")

    def run_gate(self, script, result, output, reuse="false", source_id="1234", source_url="https://github.com/synthetic/ci/actions/runs/1234"):
        environment = {**os.environ, "CHANGES_RESULT": result, "DOCS_ONLY": output,
                       "REUSE_VALIDATED": reuse, "SOURCE_RUN_ID": source_id, "SOURCE_RUN_URL": source_url,
                       "GITHUB_REPOSITORY": "synthetic/ci", "GITHUB_SHA": "a" * 40}
        return subprocess.run(["bash", "-e", "-c", script], env=environment, capture_output=True).returncode

    def test_successful_documentation_and_application_routes_pass(self):
        for gate in self.gates:
            for output in ("true", "false"):
                self.assertEqual(self.run_gate(gate, "success", output), 0)

    def test_verified_reuse_requires_a_canonical_proof_reference(self):
        for gate in self.gates:
            self.assertEqual(self.run_gate(gate, "success", "false", "true"), 0)
            for source_id, source_url in [
                ("", ""), ("0", "https://github.com/synthetic/ci/actions/runs/0"),
                ("1234; false", "https://github.com/synthetic/ci/actions/runs/1234; false"),
                ("1234", "https://example.test/actions/runs/1234"),
                ("1234", "https://github.com/other/repo/actions/runs/1234"),
                ("1234", "https://github.com/synthetic/ci/actions/runs/5678"),
            ]:
                with self.subTest(source_id=source_id, source_url=source_url):
                    self.assertNotEqual(self.run_gate(gate, "success", "false", "true", source_id, source_url), 0)

    def test_invalid_or_contradictory_reuse_outputs_never_skip_required_checks(self):
        for gate in self.gates:
            self.assertNotEqual(self.run_gate(gate, "success", "true", "true"), 0)
            for reuse in ("", "TRUE", "1", "false true"):
                for docs in ("true", "false"):
                    self.assertNotEqual(self.run_gate(gate, "success", docs, reuse), 0)

    def test_dependency_failure_or_skipping_never_passes_a_required_check(self):
        for gate in self.gates:
            for result in ("failure", "cancelled", "skipped", ""):
                for output in ("true", "false", ""):
                    for reuse in ("true", "false"):
                        with self.subTest(result=result, output=output, reuse=reuse):
                            self.assertNotEqual(self.run_gate(gate, result, output, reuse), 0)

    def test_unknown_outputs_cannot_skip_application_checks(self):
        for gate in self.gates:
            for output in ("", "TRUE", "1", "false true"):
                self.assertNotEqual(self.run_gate(gate, "success", output), 0)


class PromotionWorkflowContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.workflow = (Path(__file__).resolve().parents[1] / ".github/workflows/ci.yml").read_text()

    def section(self, job):
        match = re.search(r"(?ms)^  " + job + r":\n(.*?)(?=^  [a-zA-Z_]+:|\Z)", self.workflow)
        self.assertIsNotNone(match)
        return match.group(1)

    def step(self, job, marker):
        steps = re.findall(r"(?ms)^      - .*?(?=^      - |\Z)", self.section(job))
        matches = [block for block in steps if marker in block]
        self.assertEqual(len(matches), 1, marker)
        return matches[0]

    def test_required_jobs_always_run_even_when_proof_or_classification_fails(self):
        for job, name in [("backend", "Backend tests and audit"), ("frontend", "Frontend tests, build and audit")]:
            section = self.section(job)
            self.assertIn("    needs: changes\n    if: ${{ always() }}", section)
            self.assertIn("    name: " + name, section)
            self.assertNotIn("continue-on-error", section)

    def test_installs_and_current_vulnerability_audits_cannot_be_reused(self):
        for component in ("backend", "frontend"):
            for phase in ("install", "audit"):
                block = self.step(component, "- run: bash ../scripts/ci-local.sh " + component + " " + phase + "\n")
                conditions = re.findall(r"(?m)^        if: (.*)$", block)
                self.assertEqual(conditions, ["${{ needs.changes.outputs.docs_only != 'true' }}"])

    def test_heavy_checks_require_a_verified_proof_to_be_reused(self):
        commands = {"backend": ["backend tests", "backend reauth", "backend mongo", "backend integration"],
                    "frontend": ["frontend typecheck", "frontend tests", "frontend build"]}
        expected = "${{ needs.changes.outputs.docs_only != 'true' && (needs.changes.outputs.reuse_validated != 'true' || github.run_attempt != '1') }}"
        for component, phases in commands.items():
            for phase in phases:
                block = self.step(component, "bash ../scripts/ci-local.sh " + phase + "\n")
                self.assertEqual(re.findall(r"(?m)^        if: (.*)$", block), [expected])

    def test_rerunning_an_application_job_cannot_inherit_old_reuse_outputs(self):
        # A single-job rerun may retain needs.changes outputs from attempt1.
        # Both the gate input and every heavy/archive condition must use the
        # current attempt, not rely only on rerunning the proof lookup job.
        for component in ("backend", "frontend"):
            gate = self.step(component, "- name: Require successful routing and documentation validation")
            self.assertIn("REUSE_VALIDATED: ${{ github.run_attempt == '1' && needs.changes.outputs.reuse_validated || 'false' }}", gate)
            reused = self.step(component, "- name: Reuse successful application validation")
            self.assertIn("needs.changes.outputs.reuse_validated == 'true' && github.run_attempt == '1'", reused)
        archive = self.step("backend", "- name: Archive minimized validation evidence")
        self.assertIn("(needs.changes.outputs.reuse_validated != 'true' || github.run_attempt != '1')", archive)

    def test_proof_lookup_is_read_only_and_only_for_first_coolify_push_attempt(self):
        changes = self.section("changes")
        self.assertIn("    permissions:\n      contents: read\n      actions: read", changes)
        self.assertNotIn("actions: write", self.workflow)
        block = self.step("changes", "- name: Find previously validated promotion commit")
        self.assertIn("github.event_name == 'push'", block)
        self.assertIn("github.ref == 'refs/heads/coolify'", block)
        self.assertIn("github.run_attempt == '1'", block)
        self.assertIn("steps.classify.outputs.docs_only == 'false'", block)
        self.assertEqual(self.workflow.count("GITHUB_TOKEN:"), 1)
        self.assertIn("GITHUB_TOKEN: ${{ github.token }}", block)
        self.assertIn("steps.reuse.outputs.reuse_validated || 'false'", changes)

    def test_documentation_and_proof_tests_always_precede_lookup(self):
        changes = self.section("changes")
        lookup = changes.index("- name: Find previously validated promotion commit")
        for name in ("Test CI routing and documentation checks", "Test change classification", "Test promotion validation reuse",
                     "Classify the complete event diff", "Check Markdown format and local links"):
            self.assertLess(changes.index("- name: " + name), lookup)
        self.assertNotIn("paths-ignore", self.workflow)


if __name__ == "__main__":
    unittest.main()
