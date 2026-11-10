#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
export DATABASE_URL="${DATABASE_URL:-postgres://radar:local-development-only@localhost:55432/radar}"
export S3_ENDPOINT="${S3_ENDPOINT:-http://localhost:59000}"
export S3_ACCESS_KEY="${S3_ACCESS_KEY:-radar-local}"
export S3_SECRET_KEY="${S3_SECRET_KEY:-local-development-only}"
export S3_BUCKET="${S3_BUCKET:-radar-private}"
exec cargo run --manifest-path backend/Cargo.toml -p radar-api -- "$@"
