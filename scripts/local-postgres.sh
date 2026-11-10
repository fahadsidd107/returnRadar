#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
PG_BIN="${PG_BIN:-/opt/homebrew/opt/postgresql@14/bin}"
case "${1:-start}" in
 start)
  if [ ! -f .local/postgres/PG_VERSION ]; then
   mkdir -p .local
   "$PG_BIN/initdb" -D .local/postgres -U radar --auth-local=trust --auth-host=scram-sha-256
  fi
  if ! "$PG_BIN/pg_ctl" -D .local/postgres status >/dev/null 2>&1; then
   "$PG_BIN/pg_ctl" -D .local/postgres -l .local/postgres.log -o '-p 55432 -h 127.0.0.1' start
  fi
  "$PG_BIN/psql" -h /tmp -p 55432 -U radar -d postgres -c "ALTER USER radar PASSWORD 'local-development-only'"
  if ! "$PG_BIN/psql" -h /tmp -p 55432 -U radar -d postgres -Atc "SELECT 1 FROM pg_database WHERE datname='radar'" | rg -q 1; then
   "$PG_BIN/createdb" -h /tmp -p 55432 -U radar radar
  fi
  ;;
 stop) "$PG_BIN/pg_ctl" -D .local/postgres stop ;;
 *) echo 'Usage: scripts/local-postgres.sh start|stop' >&2; exit 1 ;;
esac
