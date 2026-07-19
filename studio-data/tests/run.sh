#!/usr/bin/env bash
set -e
cd "$(dirname "$0")/.."
EXEC="${CHROMIUM:-/opt/pw-browsers/chromium-1194/chrome-linux/chrome}"
echo "== 1. Sécurité statique =="; node tests/test_static.mjs || true
echo; echo "== 2. Fonctionnel headless =="; node tests/test_func.mjs || true
echo; echo "== 3. SQL sur vrai DuckDB =="; node tests/test_sql.mjs || true
