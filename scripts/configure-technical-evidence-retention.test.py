import importlib.util
import json
import os
from pathlib import Path
import pty
import subprocess
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location(
    "retention", Path(__file__).with_name("configure-technical-evidence-retention.py"))
retention = importlib.util.module_from_spec(spec)
spec.loader.exec_module(retention)


class RetentionTests(unittest.TestCase):
    def test_terminal_check_supports_nonseekable_tty(self):
        master, slave = pty.openpty()
        try:
            with open(os.ttyname(slave), "r",
                      opener=lambda path, flags: os.open(path, flags | os.O_NOCTTY)) as terminal:
                self.assertTrue(terminal.isatty())
        finally:
            os.close(master)
            os.close(slave)

    def test_preserves_unrelated_rules_and_idempotent_readback(self):
        unrelated = {"ID": "existing", "Status": "Enabled", "Prefix": "other/",
                     "Expiration": {"Days": 90}}
        current = {"Rules": [unrelated]}
        proposed = retention.proposed_config(current)
        self.assertEqual(proposed["Rules"][0], unrelated)
        self.assertEqual(current, {"Rules": [unrelated]})
        self.assertEqual(retention.proposed_config(proposed), proposed)
        readback = json.loads(json.dumps(proposed))
        rule = readback["Rules"][1]
        rule["Prefix"] = rule.pop("Filter")["Prefix"]
        rule["Expiration"]["Date"] = "2027-03-19T00:00:00.000+00:00"
        self.assertEqual(retention.normalized_config(readback), retention.normalized_config(proposed))

    def test_conflicting_rule_id_refused(self):
        conflict = dict(retention.RULE, Expiration={"Days": 180})
        with self.assertRaisesRegex(RuntimeError, "RULE_ID_CONFLICT"):
            retention.proposed_config({"Rules": [conflict]})

    def test_inventory_refuses_new_missing_or_changed_objects(self):
        inventory = {"Contents": [{"Key": k, "Size": v}
                                  for k, v in retention.EXPECTED_OBJECTS.items()]}
        retention.validate_inventory(inventory)
        for invalid in ({"Contents": inventory["Contents"][:1]},
                        {"Contents": inventory["Contents"] + [{"Key": "new", "Size": 1}]},
                        dict(inventory, IsTruncated=True)):
            with self.assertRaises(RuntimeError):
                retention.validate_inventory(invalid)

    def test_only_authenticated_absence_becomes_empty_configuration(self):
        def aws_error(code, status):
            def invoke(*args, **kwargs):
                kwargs["stderr"].write(
                    f'HTTP/1.1" {status}\n<Code>{code}</Code>'.encode())
                return subprocess.CompletedProcess(args[0], 1, b"")
            return invoke
        with tempfile.TemporaryDirectory() as folder:
            client = retention.Spaces({}, Path(folder))
            with patch.object(retention.subprocess, "run", side_effect=aws_error("NoSuchLifecycleConfiguration", 404)):
                self.assertEqual(client.call("get-bucket-lifecycle-configuration", absent_ok=True), {"Rules": []})
            for code, status in (("AccessDenied", 403), ("InvalidAccessKeyId", 403),
                                 ("NoSuchLifecycleConfiguration", 500)):
                with patch.object(retention.subprocess, "run", side_effect=aws_error(code, status)):
                    with self.assertRaises(RuntimeError):
                        client.call("get-bucket-lifecycle-configuration", absent_ok=True)


if __name__ == "__main__":
    unittest.main()
