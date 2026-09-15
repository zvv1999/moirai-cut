#!/bin/sh
set -eu
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
DOCKER=${DOCKER_BIN:-docker}
IMAGE=${MOIRAI_FOOTAGE_IMAGE:-moirai-footage:local}
NAME=${MOIRAI_FOOTAGE_CONTAINER:-moirai-footage}
if "$DOCKER" container inspect "$NAME" >/dev/null 2>&1; then
  echo "Container $NAME already exists; inspect it before replacing it." >&2
  exit 1
fi
mkdir -p "$ROOT/state" "$ROOT/library" "$ROOT/model"
chown 10001:10001 "$ROOT/state" "$ROOT/library" "$ROOT/model"
chmod 700 "$ROOT/state" "$ROOT/library" "$ROOT/model"
exec "$DOCKER" run -d --name "$NAME" --restart unless-stopped --init \
  --memory=1536m --cpuset-cpus=0,1 \
  --log-driver=json-file --log-opt max-size=10m --log-opt max-file=3 \
  --security-opt=no-new-privileges:true --cap-drop=ALL \
  -p 127.0.0.1:4318:4318 \
  -v "$ROOT/state:/var/lib/moirai" \
  -v "$ROOT/library:/library" \
  -v "$ROOT/model:/home/moirai/.moirai-cut:ro" \
  --health-cmd='curl -fsS -H "x-footage-token: $(cat /var/lib/moirai/service-token)" http://127.0.0.1:4318/state >/dev/null' \
  --health-interval=30s --health-timeout=10s --health-retries=3 \
  --health-start-period=30s "$IMAGE"
