#!/usr/bin/env bash
# Sync this Codespace to exactly what's in the repo (Claude's latest push).
set -e
echo ">> syncing to latest from GitHub..."
git fetch origin
git reset --hard origin/main
git clean -fd
echo ">> synced."
