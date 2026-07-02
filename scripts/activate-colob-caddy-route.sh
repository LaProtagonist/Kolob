#!/bin/bash

set -euo pipefail

SERVER="${SERVER:-root@155.212.245.24}"
SSH_OPTS="${SSH_OPTS:- -o ConnectTimeout=20 -o ConnectionAttempts=1 -o ServerAliveInterval=30 -o ServerAliveCountMax=20}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REMOTE_SCRIPT="$SCRIPT_DIR/activate-colob-caddy-route.remote.sh"

if [[ ! -f "$REMOTE_SCRIPT" ]]; then
  echo "Missing remote script: $REMOTE_SCRIPT" >&2
  exit 1
fi

echo "Activate Caddy route colob.spi.ski on $SERVER"
ssh $SSH_OPTS "$SERVER" "bash -s" < "$REMOTE_SCRIPT"
