#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

LOOP_CYCLES="${LOOP_CYCLES:-100}" \
"$SCRIPT_DIR/run-staging-mongo-write-safety-drill.sh"
