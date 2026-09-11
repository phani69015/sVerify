#!/usr/bin/env bash
# Quick health/status check for everything sVerify runs.
cd "$(dirname "${BASH_SOURCE[0]}")"

check() {
  local name="$1" url="$2"
  if curl -sf "$url" >/dev/null 2>&1; then
    echo "  [up]   $name"
  else
    echo "  [down] $name"
  fi
}

check_redis() {
  if podman exec sverify-redis redis-cli ping >/dev/null 2>&1; then
    echo "  [up]   redis      (:6379)"
  else
    echo "  [down] redis      (:6379)"
  fi
}

echo "sVerify status:"
check "temporal ui (:8088)" "http://localhost:8088"
check "qdrant      (:6333)" "http://localhost:6333/collections"
check "minio       (:9000)" "http://localhost:9000/minio/health/live"
check_redis
check "api         (:4100)" "http://localhost:4100/healthz"
check "extraction-sidecar (:4200)" "http://localhost:4200/health"
check "web         (:3000)" "http://localhost:3000"

if [ -f ./.run/pids ]; then
  echo
  echo "tracked background processes:"
  while IFS=: read -r name pid; do
    [ -z "$pid" ] && continue
    if kill -0 "$pid" 2>/dev/null; then
      echo "  [up]   $name (pid $pid)"
    else
      echo "  [down] $name (stale pid $pid)"
    fi
  done < ./.run/pids
fi
