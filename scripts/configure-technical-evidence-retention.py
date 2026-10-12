#!/usr/bin/env python3
"""Apply the explicitly released September 2026 evidence batch's calendar expiry."""
import argparse
import datetime as dt
import getpass
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile

BUCKET = "clinia-backups"
ENDPOINT = "https://nyc3.digitaloceanspaces.com"
PREFIX = "technical-evidence/2026-09-19/"
RULE_ID = "clinia-evidence-20260919-six-calendar-months"
EXPIRY = "2027-03-19T00:00:00Z"
ARCHIVE = PREFIX + "clinia-evidence-20260919-review-20260920T125023Z.tar.gz.age"
EXPECTED_OBJECTS = {ARCHIVE: 6964, ARCHIVE + ".sha256": 126}
RULE = {"ID": RULE_ID, "Status": "Enabled", "Filter": {"Prefix": PREFIX},
        "Expiration": {"Date": EXPIRY}}


def normalize_rule(rule):
    rule = json.loads(json.dumps(rule))
    if "Prefix" in rule:
        rule["Filter"] = {"Prefix": rule.pop("Prefix")}
    date = rule.get("Expiration", {}).get("Date")
    if date:
        parsed = dt.datetime.fromisoformat(date.replace("Z", "+00:00"))
        rule["Expiration"]["Date"] = parsed.astimezone(dt.timezone.utc).isoformat()
    return rule


def normalized_config(config):
    return sorted((normalize_rule(r) for r in config["Rules"]),
                  key=lambda r: json.dumps(r, sort_keys=True))


def proposed_config(current):
    if set(current) != {"Rules"} or not isinstance(current["Rules"], list):
        raise RuntimeError("LIFECYCLE_FORMAT_UNEXPECTED")
    rules = current["Rules"]
    matches = [r for r in rules if r.get("ID") == RULE_ID]
    if matches:
        if len(matches) != 1 or normalize_rule(matches[0]) != normalize_rule(RULE):
            raise RuntimeError("RULE_ID_CONFLICT no_change")
        return current
    return {"Rules": rules + [RULE]}


def validate_inventory(inventory):
    if inventory.get("IsTruncated"):
        raise RuntimeError("INVENTORY_TRUNCATED no_change")
    objects = inventory.get("Contents", [])
    if len(objects) != 2 or {o["Key"]: o["Size"] for o in objects} != EXPECTED_OBJECTS:
        raise RuntimeError("INVENTORY_CHANGED no_change")


class Spaces:
    def __init__(self, env, evidence_dir):
        self.env = env
        self.evidence_dir = evidence_dir

    def call(self, operation, *args, absent_ok=False):
        # CLI 2.35 may hide NoSuchLifecycleConfiguration behind a NoneType error.
        # Debug is private and immediately removed; never print raw credentials/logs.
        with tempfile.TemporaryFile(mode="w+b", dir=self.evidence_dir) as diagnostic:
            result = subprocess.run([
                "aws", "--debug", "--endpoint-url", ENDPOINT,
                "--cli-connect-timeout", "10", "--cli-read-timeout", "20",
                "s3api", operation, "--bucket", BUCKET, "--output", "json", *args,
            ], env=self.env, stdout=subprocess.PIPE, stderr=diagnostic)
            diagnostic.seek(0)
            log = diagnostic.read().decode(errors="replace")
        if result.returncode:
            codes = re.findall(r"<Code>([A-Za-z0-9_.-]+)</Code>", log)
            statuses = re.findall(r'HTTP/1\.1"\s+(\d{3})', log)
            code = codes[-1] if codes else "non_detecte"
            status = statuses[-1] if statuses else "non_detecte"
            if absent_ok and code == "NoSuchLifecycleConfiguration" and status == "404":
                return {"Rules": []}
            raise RuntimeError(f"S3_FAILED operation={operation} HTTP={status} code={code}")
        return json.loads(result.stdout) if result.stdout.strip() else None


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="Apply and verify; default is read-only.")
    args = parser.parse_args()
    if not shutil.which("aws"):
        raise RuntimeError("AWS_CLI_MISSING")
    if dt.datetime.now(dt.timezone.utc) >= dt.datetime.fromisoformat(EXPIRY.replace("Z", "+00:00")):
        raise RuntimeError("EXPIRY_ALREADY_REACHED review_required")
    # Refuse getpass's stdin fallback: credentials must never be echoed.
    with open("/dev/tty", "r"):
        pass
    os.umask(0o077)
    env = os.environ.copy()
    # Ask for the temporary administrative key, never reuse the backup writer key.
    for variable, prompt in (("AWS_ACCESS_KEY_ID", "Access Key temporaire : "),
                             ("AWS_SECRET_ACCESS_KEY", "Secret Key temporaire : ")):
        value = getpass.getpass(prompt).replace("\r", "")
        if not value or any(c.isspace() for c in value):
            raise RuntimeError("SAISIE_INVALIDE")
        env[variable] = value
    for key in ("AWS_SESSION_TOKEN", "AWS_SECURITY_TOKEN", "AWS_PROFILE", "AWS_DEFAULT_PROFILE"):
        env.pop(key, None)
    env.update(AWS_DEFAULT_REGION="nyc3", AWS_REGION="nyc3", AWS_PAGER="",
               AWS_EC2_METADATA_DISABLED="true", AWS_MAX_ATTEMPTS="1",
               AWS_REQUEST_CHECKSUM_CALCULATION="when_required",
               AWS_RESPONSE_CHECKSUM_VALIDATION="when_required")
    evidence_dir = Path(tempfile.mkdtemp(prefix="clinia-s3-retention-", dir=Path.home()))
    print(f"EVIDENCE_DIR={evidence_dir}", flush=True)
    spaces = Spaces(env, evidence_dir)
    current = spaces.call("get-bucket-lifecycle-configuration", absent_ok=True)
    inventory = spaces.call("list-objects-v2", "--prefix", PREFIX)
    validate_inventory(inventory)
    versioning = spaces.call("get-bucket-versioning")
    if versioning and versioning.get("Status") in ("Enabled", "Suspended"):
        raise RuntimeError("VERSIONING_REQUIRES_SEPARATE_REVIEW no_change")
    proposed = proposed_config(current)
    for name, data in (("lifecycle-before.json", current), ("inventory.json", inventory),
                       ("lifecycle-proposed.json", proposed)):
        (evidence_dir / name).write_text(json.dumps(data, indent=2) + "\n")
    print(f"PLAN_OK objects=2 prefix={PREFIX} expiration_utc={EXPIRY} mongo_excluded=true", flush=True)
    if not args.apply:
        print("READ_ONLY no_change")
        return
    # Reduce the risk of overwriting another administrator's intervening change.
    latest = spaces.call("get-bucket-lifecycle-configuration", absent_ok=True)
    if normalized_config(latest) != normalized_config(current):
        raise RuntimeError("LIFECYCLE_CHANGED_DURING_RUN no_change")
    validate_inventory(spaces.call("list-objects-v2", "--prefix", PREFIX))
    if normalized_config(current) != normalized_config(proposed):
        spaces.call("put-bucket-lifecycle-configuration", "--lifecycle-configuration",
                    "file://" + str(evidence_dir / "lifecycle-proposed.json"))
        print("LIFECYCLE_APPLIED", flush=True)
    else:
        print("LIFECYCLE_ALREADY_APPLIED", flush=True)
    after = spaces.call("get-bucket-lifecycle-configuration")
    (evidence_dir / "lifecycle-after.json").write_text(json.dumps(after, indent=2) + "\n")
    if normalized_config(after) != normalized_config(proposed):
        raise RuntimeError("READBACK_MISMATCH inspect_private_evidence")
    validate_inventory(spaces.call("list-objects-v2", "--prefix", PREFIX))
    report = {"status": "OK", "bucket": BUCKET, "prefix": PREFIX, "objects": 2,
              "expirationUTC": EXPIRY, "existingRulesPreserved": True,
              "mongoExcludedFromAddedRule": True, "deletionObserved": False,
              "verifiedUTC": dt.datetime.now(dt.timezone.utc).isoformat()}
    (evidence_dir / "verification.json").write_text(json.dumps(report, indent=2) + "\n")
    print("S3_RETENTION_VERIFIED expiration=2027-03-19 existing_rules_preserved=true objects_present=2")


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, OSError, ValueError, KeyError, TypeError) as error:
        # RuntimeError strings are our minimized diagnostics; other errors may expose inputs.
        print(str(error) if isinstance(error, RuntimeError) else "RETENTION_FAILED details_suppressed")
        raise SystemExit(1)
