#!/usr/bin/env bash
# Deploys IMAGE to the currently inactive colour. Prints "<colour> <port>" as last stdout line.
set -euo pipefail

IMAGE="$1"
ACTIVE=$(cat /opt/campus/active)
if [ "$ACTIVE" = "blue" ]; then NEW=green; PORT=3002; else NEW=blue; PORT=3001; fi

docker pull "$IMAGE" >&2
docker rm -f "campus-$NEW" > /dev/null 2>&1 || true
docker run -d --name "campus-$NEW" --restart unless-stopped \
  --env-file /opt/campus/app.env -p "$PORT:3000" "$IMAGE" >&2

for _ in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:$PORT/health" > /dev/null 2>&1; then
    echo "$NEW $PORT"
    exit 0
  fi
  sleep 2
done

docker logs "campus-$NEW" >&2 || true
exit 1
