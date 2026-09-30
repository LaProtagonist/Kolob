#!/bin/sh

set -eu

STAGE_DIR="$KOLOB_DEPLOY_STAGE"
SITE_ROOT="/srv/static/colob.spi.ski"
CONTROL_ROOT="/srv/kolob-control"
APP_DIR="/opt/kolob-contact"
ENV_FILE="/etc/kolob-contact.env"
CONTACT_CONTAINER="kolob-contact"
CADDY_CONTAINER="land-static-caddy"

if [ -z "$STAGE_DIR" ]; then
  echo "KOLOB_DEPLOY_STAGE is required." >&2
  exit 1
fi

case "$STAGE_DIR" in
  /tmp/kolob-deploy-*) ;;
  *)
    echo "Refusing unexpected deployment stage: $STAGE_DIR" >&2
    exit 1
    ;;
esac

PUBLIC_STAGE="$STAGE_DIR/public"
CONTROL_STAGE="$STAGE_DIR/control"
APP_STAGE="$STAGE_DIR/app"
SCRIPTS_STAGE="$STAGE_DIR/scripts"

for required in "$PUBLIC_STAGE/index.html" "$CONTROL_STAGE/control.html" "$APP_STAGE/contact_server.py" "$SCRIPTS_STAGE/activate-colob-caddy-route.remote.sh" "$ENV_FILE"; do
  if [ ! -f "$required" ]; then
    echo "Missing required deployment file: $required" >&2
    exit 1
  fi
done

if [ -e "$PUBLIC_STAGE/__review" ]; then
  echo "Refusing deployable public output containing __review." >&2
  exit 1
fi

if ! docker ps --format '{{.Names}}' | grep -Fxq "$CADDY_CONTAINER"; then
  echo "Caddy container is not running: $CADDY_CONTAINER" >&2
  exit 1
fi

if ! docker inspect "$CONTACT_CONTAINER" >/dev/null 2>&1; then
  echo "Existing contact container is required to preserve the established /leads runtime." >&2
  exit 1
fi

CONTACT_IMAGE="$(docker inspect "$CONTACT_CONTAINER" --format '{{.Config.Image}}')"
CADDY_NETWORK="$(docker inspect "$CADDY_CONTAINER" --format '{{range $name, $_ := .NetworkSettings.Networks}}{{$name}}{{end}}')"
if [ -z "$CONTACT_IMAGE" ] || [ -z "$CADDY_NETWORK" ]; then
  echo "Could not resolve existing contact image or Caddy network." >&2
  exit 1
fi

STAMP="$(date +%Y%m%d%H%M%S)"
install_tree() {
  source_dir="$1"
  destination="$2"
  next="$destination.next.$STAMP"
  backup="$destination.bak.$STAMP"

  rm -rf "$next"
  mkdir -p "$next"
  cp -a "$source_dir/." "$next/"
  if [ -e "$destination" ]; then
    mv "$destination" "$backup"
  fi
  mv "$next" "$destination"
}

install_tree "$PUBLIC_STAGE" "$SITE_ROOT"
install_tree "$CONTROL_STAGE" "$CONTROL_ROOT"

APP_NEXT="$APP_DIR/contact_server.py.next.$STAMP"
cp "$APP_STAGE/contact_server.py" "$APP_NEXT"
chmod 644 "$APP_NEXT"
if [ -f "$APP_DIR/contact_server.py" ]; then
  mv "$APP_DIR/contact_server.py" "$APP_DIR/contact_server.py.bak.$STAMP"
fi
mv "$APP_NEXT" "$APP_DIR/contact_server.py"
if [ -f "$APP_STAGE/inputs-schema.json" ]; then
  cp "$APP_STAGE/inputs-schema.json" "$APP_DIR/inputs-schema.json.next.$STAMP"
  chmod 644 "$APP_DIR/inputs-schema.json.next.$STAMP"
  mv "$APP_DIR/inputs-schema.json.next.$STAMP" "$APP_DIR/inputs-schema.json"
fi

ENV_NEXT="$ENV_FILE.next.$STAMP"
grep -v '^CONTROL_STATIC_ROOT=' "$ENV_FILE" > "$ENV_NEXT" || true
printf '%s\n' 'CONTROL_STATIC_ROOT=/control' >> "$ENV_NEXT"
chmod 600 "$ENV_NEXT"
mv "$ENV_NEXT" "$ENV_FILE"

# Leads, the sheet bridge address and the sign-in key live in /srv/kolob-data on the host.
# The backend reads CONTACT_DATA_DIR, so the host folder is mounted at exactly that path.
DATA_MOUNT="$(sed -n 's/^CONTACT_DATA_DIR=//p' "$ENV_FILE" | tail -n 1)"
case "$DATA_MOUNT" in
  /*) ;;
  *) DATA_MOUNT="/data" ;;
esac

docker rm -f "$CONTACT_CONTAINER" >/dev/null
docker run -d \
  --name "$CONTACT_CONTAINER" \
  --restart unless-stopped \
  --network "$CADDY_NETWORK" \
  --env-file "$ENV_FILE" \
  -v "$APP_DIR:/app:ro" \
  -v "/srv/kolob-data:$DATA_MOUNT" \
  -v "$CONTROL_ROOT:/control:ro" \
  "$CONTACT_IMAGE" \
  python3 /app/contact_server.py >/dev/null

# The backend needs a moment to start; one early refusal must not abort the deployment.
attempt=0
until docker exec "$CADDY_CONTAINER" sh -lc "wget -qO- --timeout=5 http://$CONTACT_CONTAINER:8787/health" >/dev/null 2>&1; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 15 ]; then
    echo "Contact backend did not answer /health within 15 seconds." >&2
    exit 1
  fi
  sleep 1
done

sh "$SCRIPTS_STAGE/activate-colob-caddy-route.remote.sh"

echo "Control deployment active."
echo "Public root: $SITE_ROOT"
echo "Protected Control root: $CONTROL_ROOT"
