#!/usr/bin/env bash
# Tears down everything start.sh brought up: background API/worker/web
# processes (tracked in .run/pids), then the podman-compose infra
# containers. Pass --keep-infra to leave Temporal/Postgres/Qdrant/MinIO
# running (useful if you're about to start.sh again shortly).
set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

RUN_DIR="./.run"
PID_FILE="$RUN_DIR/pids"

if [ -f "$PID_FILE" ]; then
  while IFS=: read -r name pid; do
    [ -z "$pid" ] && continue
    if kill -0 "$pid" 2>/dev/null; then
      echo "stopping $name (pid $pid)"
      kill "$pid" 2>/dev/null
      pkill -P "$pid" 2>/dev/null || true   # tsx/next spawn child processes
    fi
  done < "$PID_FILE"
  rm -f "$PID_FILE"
fi

if [ "${1:-}" != "--keep-infra" ]; then
  echo "stopping infra containers"
  pnpm infra:down
else
  echo "leaving infra containers running (--keep-infra)"
fi

echo "done."
