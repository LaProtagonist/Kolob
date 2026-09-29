#!/bin/sh

set -eu

STAGE_DIR="$KOLOB_DEPLOY_STAGE"
APP_DIR="/opt/kolob-contact"
CONTACT_CONTAINER="kolob-contact"
CADDY_CONTAINER="land-static-caddy"

case "$STAGE_DIR" in
  /tmp/kolob-backend-*) ;;
  *)
    echo "Refusing unexpected backend stage: $STAGE_DIR" >&2
    exit 1
    ;;
esac

for required in "$STAGE_DIR/contact_server.py" "$STAGE_DIR/inputs-schema.json" "$STAGE_DIR/activate-colob-caddy-route.remote.sh"; do
  if [ ! -f "$required" ]; then
    echo "Missing required backend file: $required" >&2
    exit 1
  fi
done

python3 -m py_compile "$STAGE_DIR/contact_server.py"
python3 -c "import json,sys; json.load(open(sys.argv[1], encoding='utf-8'))" "$STAGE_DIR/inputs-schema.json"

if ! docker inspect "$CONTACT_CONTAINER" >/dev/null 2>&1; then
  echo "Contact container is missing: $CONTACT_CONTAINER. Run the full deployment first." >&2
  exit 1
fi

STAMP="$(date +%Y%m%d%H%M%S)"
PREVIOUS="$APP_DIR/contact_server.py.previous"
if [ -f "$APP_DIR/contact_server.py" ]; then
  cp "$APP_DIR/contact_server.py" "$PREVIOUS"
fi
cp "$STAGE_DIR/contact_server.py" "$APP_DIR/contact_server.py.next.$STAMP"
cp "$STAGE_DIR/inputs-schema.json" "$APP_DIR/inputs-schema.json.next.$STAMP"
chmod 644 "$APP_DIR/contact_server.py.next.$STAMP" "$APP_DIR/inputs-schema.json.next.$STAMP"
mv "$APP_DIR/inputs-schema.json.next.$STAMP" "$APP_DIR/inputs-schema.json"
mv "$APP_DIR/contact_server.py.next.$STAMP" "$APP_DIR/contact_server.py"

healthy() {
  docker exec "$CADDY_CONTAINER" sh -lc "wget -qO- --timeout=5 http://$CONTACT_CONTAINER:8787/health" >/dev/null 2>&1
}

docker restart "$CONTACT_CONTAINER" >/dev/null
sleep 2
if ! healthy; then
  echo "New backend did not start. Restoring the previous version." >&2
  if [ -f "$PREVIOUS" ]; then
    cp "$PREVIOUS" "$APP_DIR/contact_server.py"
    docker restart "$CONTACT_CONTAINER" >/dev/null
    sleep 2
    healthy && echo "Previous backend restored." >&2
  fi
  exit 1
fi

sh "$STAGE_DIR/activate-colob-caddy-route.remote.sh"

rm -rf "$STAGE_DIR"
echo "Backend updated."
