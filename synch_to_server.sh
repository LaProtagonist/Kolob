#!/bin/bash

set -euo pipefail

SERVER="${SERVER:-root@155.212.245.24}"
SSH_OPTS="${SSH_OPTS:- -o ConnectTimeout=10 -o ConnectionAttempts=1 -o ServerAliveInterval=30 -o ServerAliveCountMax=20}"

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
SPISKI_DIR="$(cd "$ROOT_DIR/../spi.ski" && pwd)"
REMOTE_DIR="/srv/static/colob.spi.ski"
CADDY_REMOTE_DIR="/opt/server.host"

DO_DEPLOY=false
DO_CADDY=false

help() {
  cat <<EOF
Usage: bash ./synch_to_server.sh -deploy|-caddy|-all

  -deploy  build and sync only Kolobochnaya static files -> https://colob.spi.ski
  -caddy   upload only server.host/Caddyfile and reload Caddy
  -all     deploy static files and apply the Caddy route

Environment:
  SERVER=${SERVER}
  REMOTE_DIR=${REMOTE_DIR}
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -deploy) DO_DEPLOY=true ;;
    -caddy) DO_CADDY=true ;;
    -all) DO_DEPLOY=true; DO_CADDY=true ;;
    -h|--help) help; exit 0 ;;
    *) echo "Unknown option: $1"; help; exit 1 ;;
  esac
  shift
done

if ! $DO_DEPLOY && ! $DO_CADDY; then
  help
  exit 1
fi

build_site() {
  echo "Build colob -> https://colob.spi.ski"
  cd "$ROOT_DIR"
  npm run build

  if [ ! -f "$ROOT_DIR/dist/index.html" ]; then
    echo "Missing build output: $ROOT_DIR/dist/index.html" >&2
    exit 1
  fi
}

sync_site() {
  echo "Sync static files -> $REMOTE_DIR"
  tar -cf - -C "$ROOT_DIR/dist" . | ssh $SSH_OPTS "$SERVER" "rm -rf '$REMOTE_DIR' && mkdir -p '$REMOTE_DIR' && tar -xf - -C '$REMOTE_DIR'"
}

sync_caddy() {
  echo "Sync Caddyfile route -> https://colob.spi.ski"
  tar -cf - -C "$SPISKI_DIR/server.host" Caddyfile | ssh $SSH_OPTS "$SERVER" "mkdir -p '$CADDY_REMOTE_DIR' && tar -xf - -C '$CADDY_REMOTE_DIR' && (docker exec land-static-caddy caddy reload --config /etc/caddy/Caddyfile || docker restart land-static-caddy)"
}

if $DO_DEPLOY; then
  build_site
  sync_site
fi

if $DO_CADDY; then
  sync_caddy
fi

echo "Done"
