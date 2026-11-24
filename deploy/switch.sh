#!/usr/bin/env bash
# Points nginx (production traffic) to the given colour. Also used for rollback.
set -euo pipefail

COLOR="$1"
case "$COLOR" in
  blue) PORT=3001 ;;
  green) PORT=3002 ;;
  *) echo 'colour must be blue or green' >&2; exit 1 ;;
esac

echo "upstream campus { server 127.0.0.1:$PORT; }" | sudo tee /etc/nginx/campus-upstream.conf > /dev/null
sudo nginx -t
sudo nginx -s reload
echo "$COLOR" > /opt/campus/active
curl -fsS http://127.0.0.1/health
echo " -> production now on $COLOR (port $PORT)"
