#!/bin/bash

set -euo pipefail

SERVER="${SERVER:-root@155.212.245.24}"
SSH_OPTS="${SSH_OPTS:- -o ConnectTimeout=20 -o ConnectionAttempts=1 -o ServerAliveInterval=30 -o ServerAliveCountMax=20}"

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
KOLOB_HOST="${KOLOB_HOST:-colob.spi.ski}"
REMOTE_DIR="${REMOTE_DIR:-/srv/static/${KOLOB_HOST}}"

DO_BUILD=false
DO_SYNC=false
DO_BACKEND=false

help() {
  cat <<EOF
Usage: bash ./synch_to_server.sh -build|-sync|-deploy|-backend

  -build    build Kolobochnaya static site -> dist
  -sync     upload existing dist -> https://${KOLOB_HOST}
  -deploy   build and upload dist -> https://${KOLOB_HOST}
  -backend  upload only the contact/inputs backend and its route, no site build

Environment:
  SERVER=${SERVER}
  KOLOB_HOST=${KOLOB_HOST}
  REMOTE_DIR=${REMOTE_DIR}

This script only uploads Kolobochnaya files and updates the colob.spi.ski route.
It does not touch other sites, docker images, or the shared spi.ski project.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -build) DO_BUILD=true ;;
    -sync) DO_SYNC=true ;;
    -deploy) DO_BUILD=true; DO_SYNC=true ;;
    -backend) DO_BACKEND=true ;;
    -h|--help) help; exit 0 ;;
    *) echo "Unknown option: $1"; help; exit 1 ;;
  esac
  shift
done

if ! $DO_BUILD && ! $DO_SYNC && ! $DO_BACKEND; then
  help
  exit 1
fi

assert_remote_dir() {
  if [[ "$REMOTE_DIR" != "/srv/static/${KOLOB_HOST}" || "$KOLOB_HOST" != "colob.spi.ski" ]]; then
    echo "Refusing to deploy to unexpected target: KOLOB_HOST=$KOLOB_HOST REMOTE_DIR=$REMOTE_DIR" >&2
    exit 1
  fi
}

build_site() {
  echo "Build Kolobochnaya -> https://${KOLOB_HOST}"
  cd "$ROOT_DIR"
  npm run build

  if [[ ! -f "$ROOT_DIR/dist/index.html" || ! -f "$ROOT_DIR/control-dist/control.html" ]]; then
    echo "Missing public or Control build output." >&2
    exit 1
  fi
}

sync_site() {
  assert_remote_dir

  if [[ ! -f "$ROOT_DIR/dist/index.html" || ! -f "$ROOT_DIR/control-dist/control.html" ]]; then
    echo "Missing public or Control build output." >&2
    echo "Run: bash ./synch_to_server.sh -build" >&2
    exit 1
  fi

  local stage_id="kolob-deploy-$(date +%Y%m%d%H%M%S)-$$"
  local remote_stage="/tmp/$stage_id"
  echo "Upload public and protected build outputs -> $REMOTE_DIR"
  ssh $SSH_OPTS "$SERVER" "
    set -e
    STAGE='$remote_stage'
    case \"\$STAGE\" in
      /tmp/kolob-deploy-*) ;;
      *) echo \"Refusing unexpected stage: \$STAGE\" >&2; exit 1 ;;
    esac
    rm -rf \"\$STAGE\"
    mkdir -p \"\$STAGE/public\" \"\$STAGE/control\" \"\$STAGE/app\" \"\$STAGE/scripts\"
  "
  tar --exclude="./__review" -cf - -C "$ROOT_DIR/dist" . | ssh $SSH_OPTS "$SERVER" "tar -xf - -C '$remote_stage/public'"
  tar -cf - -C "$ROOT_DIR/control-dist" . | ssh $SSH_OPTS "$SERVER" "tar -xf - -C '$remote_stage/control'"
  tar -cf - -C "$ROOT_DIR" server/contact_server.py server/inputs-schema.json scripts/activate-colob-caddy-route.remote.sh scripts/deploy-colob-control-workspace.remote.sh | ssh $SSH_OPTS "$SERVER" "
    set -e
    tar -xf - -C '$remote_stage'
    mv '$remote_stage/server/contact_server.py' '$remote_stage/app/contact_server.py'
    mv '$remote_stage/server/inputs-schema.json' '$remote_stage/app/inputs-schema.json'
  "
  ssh $SSH_OPTS "$SERVER" "KOLOB_DEPLOY_STAGE='$remote_stage' sh '$remote_stage/scripts/deploy-colob-control-workspace.remote.sh'"
  echo "Site and Control workspace synced -> https://$KOLOB_HOST"
}

sync_backend() {
  assert_remote_dir
  python3 -m py_compile "$ROOT_DIR/server/contact_server.py"

  local remote_stage="/tmp/kolob-backend-$(date +%Y%m%d%H%M%S)-$$"
  echo "Upload backend -> https://$KOLOB_HOST"
  ssh $SSH_OPTS "$SERVER" "rm -rf '$remote_stage' && mkdir -p '$remote_stage'"
  tar -cf - -C "$ROOT_DIR/server" contact_server.py inputs-schema.json | ssh $SSH_OPTS "$SERVER" "tar -xf - -C '$remote_stage'"
  tar -cf - -C "$ROOT_DIR/scripts" activate-colob-caddy-route.remote.sh deploy-colob-backend.remote.sh | ssh $SSH_OPTS "$SERVER" "tar -xf - -C '$remote_stage'"
  ssh $SSH_OPTS "$SERVER" "KOLOB_DEPLOY_STAGE='$remote_stage' sh '$remote_stage/deploy-colob-backend.remote.sh'"
  echo "Backend synced -> https://$KOLOB_HOST"
}

if $DO_BUILD; then build_site; fi
if $DO_SYNC; then sync_site; fi
if $DO_BACKEND; then sync_backend; fi

echo "Done"
