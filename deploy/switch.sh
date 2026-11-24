#!/usr/bin/env bash
# Points nginx (production traffic) to the given colour. Also used for rollback.
# Rolls back to the previous colour if the new one does not become healthy.
set -euo pipefail

port_of() {
  case "$1" in
    blue) echo 3001 ;;
    green) echo 3002 ;;
    *) echo 'colour must be blue or green' >&2; exit 1 ;;
  esac
}

set_upstream() {
  echo "upstream campus { server 127.0.0.1:$1; }" | sudo tee /etc/nginx/campus-upstream.conf > /dev/null
  sudo nginx -t
  sudo nginx -s reload
}

COLOR="$1"
PREVIOUS=$(cat /opt/campus/active)
PORT=$(port_of "$COLOR")

set_upstream "$PORT"

for _ in $(seq 1 15); do
  if curl -fsS http://127.0.0.1/health > /dev/null 2>&1; then
    echo "$COLOR" > /opt/campus/active
    echo "production now on $COLOR (port $PORT)"
    exit 0
  fi
  sleep 1
done

echo "health check failed, rolling back to $PREVIOUS" >&2
set_upstream "$(port_of "$PREVIOUS")"
exit 1
