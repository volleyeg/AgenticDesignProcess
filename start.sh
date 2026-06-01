#!/usr/bin/env bash
# Install deps (idempotent) and run server + client together.
set -e
echo ">> installing dependencies (first run takes a minute)..."
npm run install:all
npm install
echo ">> starting server (:8787) + client (:5173)..."
npm run dev
