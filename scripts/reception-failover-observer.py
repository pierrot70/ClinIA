#!/usr/bin/env python3
"""Observe one owned synthetic booking; never log HTTP bodies or credentials."""
import datetime
import json
import os
import subprocess
import sys
import time


def main():
    base, directory, appointment, seconds, output = sys.argv[1:]
    seconds = int(seconds)
    if not 5 <= seconds <= 600:
        raise ValueError("invalid duration")
    with open(os.path.join(directory, "fixture.json")) as source:
        fixture = json.load(source)
    # Use the same curl transport, Origin, authorization file and encoded query
    # as login/lookup in the smoke script. No redirect following or shell.
    command = ["curl", "--silent", "--show-error", "--connect-timeout", "5",
               "--max-time", "5", "--max-filesize", "1048576", "--write-out", "\n%{http_code}",
               "--header", "Origin: " + base,
               "--header", "@" + os.path.join(directory, "auth-header"),
               "--get", "--data-binary", "@" + os.path.join(directory, "query"),
               base + "/api/reception/patient-lookup"]
    count = failures = consecutive = 0
    ambiguous = invalid = False
    gaps = []
    gap_start = None
    last_success = None
    started = time.monotonic()
    deadline = started + seconds
    # Output is minimized evidence, separate from the private recovery directory.
    descriptor = os.open(output, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, "w") as evidence:
        while time.monotonic() < deadline:
            begin = time.monotonic()
            utc = datetime.datetime.now(datetime.timezone.utc).isoformat()
            status = 0
            ok = False
            error_code = None
            try:
                response = subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=10)
                body, _, http = response.stdout.rpartition(b"\n")
                status = int(http)
                if response.returncode:
                    ambiguous = True
                elif status != 200:
                    ambiguous |= status >= 500 or status in (0, 408)
                    invalid |= 0 < status < 500 and status != 408
                    # Only known technical error codes; never log messages/bodies.
                    try:
                        code = (json.loads(body).get("error") or {}).get("code")
                        allowed = {"CORS_ORIGIN_DENIED", "UNTRUSTED_ORIGIN", "FORBIDDEN", "INVALID_TOKEN", "TOKEN_REVOKED", "PASSWORD_RESET_REQUIRED", "PASSWORD_CHANGE_REQUIRED", "PERSISTENCE_FAILED", "INVALID_INPUT", "RECEPTION_LOOKUP_REQUIRED"}
                        error_code = code if code in allowed else "HTTP_ERROR"
                    except (ValueError, TypeError, AttributeError):
                        error_code = "NON_JSON_ERROR"
                else:
                    data = json.loads(body).get("data") or {}
                    bookings = data.get("existingAppointments") or []
                    ok = data.get("_id") == fixture["patientId"] and len(bookings) == 1 and bookings[0].get("_id") == appointment
                    if not ok:
                        invalid = True
            except (subprocess.TimeoutExpired, OSError):
                ambiguous = True
            except (ValueError, TypeError, AttributeError):
                invalid = True
            end = time.monotonic()
            count += 1
            if ok:
                consecutive += 1
                if gap_start is not None:
                    # Last successful completion to first successful completion
                    # of a run of five successes: observation window, not exact RTO.
                    if consecutive == 1:
                        recovery = end
                    if consecutive >= 5:
                        gaps.append(round(recovery - gap_start, 3))
                        gap_start = None
                last_success = end
            else:
                failures += 1
                consecutive = 0
                if gap_start is None:
                    gap_start = last_success if last_success is not None else started
            row = {"sequence": count, "utc": utc, "elapsed_seconds": round(begin - started, 3), "duration_ms": round((end - begin) * 1000, 1), "http": status, "booking_unchanged": ok, "error_code": error_code}
            evidence.write(json.dumps(row) + "\n")
            evidence.flush()
            elapsed = round(end - started, 1)
            remaining = round(max(0, deadline - end), 1)
            print(f"TRAFFIC sequence={count} elapsed={elapsed}s remaining={remaining}s HTTP={status} booking_unchanged={str(ok).lower()} duration_ms={row['duration_ms']} error_code={error_code or 'none'}", flush=True)
            time.sleep(max(0, min(1 - (time.monotonic() - begin), deadline - time.monotonic())))
    summary = {"requests": count, "failures": failures, "last_consecutive_successes": consecutive, "observed_gap_seconds": gaps, "unresolved_gap": gap_start is not None, "ambiguous_requests": ambiguous, "invalid_responses": invalid}
    print("TRAFFIC_SUMMARY " + json.dumps(summary), flush=True)
    if ambiguous:
        return 3
    return 0 if consecutive >= 5 and not invalid else 1


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        print("OBSERVER_INTERRUPTED preserve_recovery_directory", file=sys.stderr)
        sys.exit(3)
    except Exception:
        print("OBSERVER_FAILED details_suppressed", file=sys.stderr)
        sys.exit(3)
