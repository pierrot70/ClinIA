#!/usr/bin/env bash
set -euo pipefail

echo "This script enables local git hooks from .githooks/ for this repository."
echo
echo "It will run: git config core.hooksPath .githooks"
echo
read -p "Enable hooks now? [y/N] " yn
case "$yn" in
  y|Y)
    git config core.hooksPath .githooks
    echo "Enabled: git config core.hooksPath=$(git config core.hooksPath)"
    ;;
  *)
    echo "Aborted. You can enable later with:\n  git config core.hooksPath .githooks"
    ;;
esac
