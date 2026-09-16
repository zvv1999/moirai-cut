#!/bin/sh
set -eu
# Run on the NAS as an administrator. Member sessions remain unprivileged.
: "${GATEWAY_ROOT:?Set GATEWAY_ROOT to an absolute NAS-local directory}"
: "${GATEWAY_BIND:?Set GATEWAY_BIND to the NAS LAN address}"
DOCKER=${DOCKER:-docker}
NETWORK=${NETWORK:-moirai-team}
if ! "$DOCKER" network inspect "$NETWORK" >/dev/null 2>&1; then
  "$DOCKER" network create "$NETWORK"
fi
if ! "$DOCKER" inspect moirai-footage --format '{{json .NetworkSettings.Networks}}' | /usr/bin/python -c 'import json,sys; sys.exit(0 if sys.argv[1] in json.load(sys.stdin) else 1)' "$NETWORK"; then
  "$DOCKER" network connect --alias moirai-footage "$NETWORK" moirai-footage
fi
"$DOCKER" run -d --name moirai-team-gateway --restart unless-stopped \
  --network "$NETWORK" -p "$GATEWAY_BIND:2222:2222" \
  --memory 128m --cpuset-cpus "${GATEWAY_CPUS:-0,1}" \
  --cap-drop ALL --cap-add CHOWN --cap-add DAC_OVERRIDE --cap-add FOWNER \
  --cap-add SETGID --cap-add SETUID --cap-add SYS_CHROOT --cap-add AUDIT_WRITE \
  --security-opt no-new-privileges \
  --tmpfs /run:rw,nosuid,nodev,size=16m --tmpfs /tmp:rw,nosuid,nodev,noexec,size=16m \
  --mount "type=bind,src=$GATEWAY_ROOT/access,dst=/access,readonly" \
  --mount "type=bind,src=$GATEWAY_ROOT/keys,dst=/keys,readonly" \
  --mount "type=bind,src=$GATEWAY_ROOT/secrets,dst=/secrets,readonly" \
  --log-opt max-size=5m --log-opt max-file=2 \
  moirai-team-gateway:v1
