#!/usr/bin/env bash
# One command: pull Claude's latest, then install + run.
set -e
cd "$(dirname "$0")"
bash update.sh
bash start.sh
