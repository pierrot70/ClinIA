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

    def run_gate(self, script, result, output):
        environment = {**os.environ, "CHANGES_RESULT": result, "DOCS_ONLY": output}
        return subprocess.run(["bash", "-e", "-c", script], env=environment, capture_output=True).returncode

    def test_successful_documentation_and_application_routes_pass(self):
        for gate in self.gates:
            for output in ("true", "false"):
                self.assertEqual(self.run_gate(gate, "success", output), 0)

    def test_dependency_failure_or_skipping_never_passes_a_required_check(self):
        for gate in self.gates:
            for result in ("failure", "cancelled", "skipped", ""):
                for output in ("true", "false", ""):
                    with self.subTest(result=result, output=output):
                        self.assertNotEqual(self.run_gate(gate, result, output), 0)

    def test_unknown_outputs_cannot_skip_application_checks(self):
        for gate in self.gates:
            for output in ("", "TRUE", "1", "false true"):
                self.assertNotEqual(self.run_gate(gate, "success", output), 0)


if __name__ == "__main__":
    unittest.main()
