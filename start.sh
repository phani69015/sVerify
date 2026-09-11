#!/usr/bin/env bash
# Single entrypoint for sVerify: podman-compose up for infra, then the API,
# extraction-sidecar, and all 5 Temporal workers, then the web UI - in
# order, with health checks. Logs go to ./logs/*.log, PIDs tracked in
# ./.run/pids for stop.sh.
#
# Assumes model-inference-hub is already up (../model-inference-hub/start.sh)
# if you want real (non-mock) HF/search calls to work - sVerify itself has
# no idea that project exists, this is just an operational dependency.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

# Raise the file-descriptor limit for this shell and everything it spawns -
# 5 tsx-watch workers + Next.js can otherwise hit macOS's low default (256)
# under load from other running processes.
ulimit -n 65536 2>/dev/null || true

LOG_DIR="./logs"
RUN_DIR="./.run"
mkdir -p "$LOG_DIR" "$RUN_DIR"
PID_FILE="$RUN_DIR/pids"
: > "$PID_FILE"

wait_for() {
  local name="$1" url="$2" timeout="${3:-60}"
  echo -n "  waiting for $name..."
  local start=$(date +%s)
  until curl -sf "$url" >/dev/null 2>&1; do
    if [ $(( $(date +%s) - start )) -ge "$timeout" ]; then
      echo " TIMEOUT (checked $url)"
      return 1
    fi
    sleep 1
  done
  echo " ok"
}

# Redis has no HTTP healthcheck endpoint, so ping it via redis-cli inside
# its own container instead of curl.
wait_for_redis() {
  local timeout="${1:-60}"
  echo -n "  waiting for redis..."
  local start=$(date +%s)
  until podman exec sverify-redis redis-cli ping >/dev/null 2>&1; do
    if [ $(( $(date +%s) - start )) -ge "$timeout" ]; then
      echo " TIMEOUT"
      return 1
    fi
    sleep 1
  done
  echo " ok"
}

start_bg() {
  local name="$1"; shift
  nohup "$@" > "$LOG_DIR/$name.log" 2>&1 &
  echo "$name:$!" >> "$PID_FILE"
  echo "  started $name (pid $!), logs: $LOG_DIR/$name.log"
}

echo "[1/4] Infra containers (podman-compose)"
pnpm infra:up
wait_for "temporal"    "http://localhost:8088" 90
wait_for "qdrant"      "http://localhost:6333/collections" 60
wait_for "minio"       "http://localhost:9000/minio/health/live" 60
wait_for_redis 60

echo "[2/4] Ensure MinIO bucket exists"
podman exec sverify-minio mc alias set local http://localhost:9000 sverify sverify123 >/dev/null 2>&1 || true
podman exec sverify-minio mc mb local/sverify-media >/dev/null 2>&1 || true

echo "[3/4] API + workers (background)"
start_bg "api"                  pnpm dev:api
start_bg "extraction-sidecar"   pnpm dev:extraction-sidecar
wait_for "extraction-sidecar" "http://localhost:4200/health" 30
start_bg "worker-orchestration" pnpm dev:worker:orchestration
start_bg "worker-extraction"    pnpm dev:worker:extraction
start_bg "worker-ml"            pnpm dev:worker:ml
start_bg "worker-llm"           pnpm dev:worker:llm
start_bg "worker-io"            pnpm dev:worker:io
wait_for "api" "http://localhost:4100/healthz" 60

echo "[4/4] Web UI (production build - avoids macOS file-watcher EMFILE issues
#      that hit 'next dev' when many other processes are watching files)"
pnpm --filter @sverify/web build >> "$LOG_DIR/web-build.log" 2>&1
start_bg "web" pnpm --filter @sverify/web start
wait_for "web" "http://localhost:3000" 60

echo
echo "sVerify is up:"
echo "  web              http://localhost:3000"
echo "  api              http://localhost:4100"
echo "  extraction-sidecar http://localhost:4200"
echo "  temporal ui      http://localhost:8088"
echo "  redis            localhost:6379"
echo "  logs             $LOG_DIR/*.log"
echo "  stop with: ./stop.sh"
