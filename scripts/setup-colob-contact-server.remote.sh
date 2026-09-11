#!/bin/sh

set -eu

APP_DIR="/opt/kolob-contact"
DATA_DIR="/srv/kolob-data"
CONTROL_DIR="/srv/kolob-control"
ENV_FILE="/etc/kolob-contact.env"
CADDY_DIR="/opt/server.host"
CADDYFILE="$CADDY_DIR/Caddyfile"
CADDY_CONTAINER="land-static-caddy"
CONTACT_CONTAINER="kolob-contact"
CONTACT_IMAGE="${CONTACT_IMAGE:-servernewhost-dok26server:latest}"
CONTACT_PORT="8787"

if [ -n "${CONTACT_ADMIN_PASSWORD_B64:-}" ]; then
  CONTACT_ADMIN_PASSWORD="$(printf '%s' "$CONTACT_ADMIN_PASSWORD_B64" | base64 -d)"
fi

if [ -z "${CONTACT_ADMIN_PASSWORD:-}" ]; then
  echo "CONTACT_ADMIN_PASSWORD is required." >&2
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is required on the server." >&2
  exit 1
fi

if [ ! -f "$APP_DIR/contact_server.py" ]; then
  echo "Missing $APP_DIR/contact_server.py. Upload the server file first." >&2
  exit 1
fi

if ! docker image inspect "$CONTACT_IMAGE" >/dev/null 2>&1; then
  echo "Missing Docker image: $CONTACT_IMAGE" >&2
  exit 1
fi

if ! docker ps --format '{{.Names}}' | grep -Fxq "$CADDY_CONTAINER"; then
  echo "Caddy container is not running: $CADDY_CONTAINER" >&2
  exit 1
fi

CADDY_NETWORK="$(docker inspect "$CADDY_CONTAINER" --format '{{range $name, $_ := .NetworkSettings.Networks}}{{$name}}{{end}}')"
if [ -z "$CADDY_NETWORK" ]; then
  echo "Could not detect Caddy Docker network." >&2
  exit 1
fi

mkdir -p "$DATA_DIR" "$CONTROL_DIR"
chmod 700 "$DATA_DIR"

EXISTING_SECRET=""
if [ -f "$ENV_FILE" ]; then
  EXISTING_SECRET="$(grep '^CONTACT_ADMIN_SECRET=' "$ENV_FILE" | sed 's/^CONTACT_ADMIN_SECRET=//' || true)"
fi

if [ -z "${CONTACT_ADMIN_SECRET:-}" ]; then
  if [ -n "$EXISTING_SECRET" ]; then
    CONTACT_ADMIN_SECRET="$EXISTING_SECRET"
  elif command -v openssl >/dev/null 2>&1; then
    CONTACT_ADMIN_SECRET="$(openssl rand -hex 32)"
  else
    CONTACT_ADMIN_SECRET="$(date +%s)-$(cat /proc/sys/kernel/random/uuid 2>/dev/null || echo kolob)"
  fi
fi

cat > "$ENV_FILE" <<EOF
CONTACT_SERVER_HOST=0.0.0.0
CONTACT_SERVER_PORT=$CONTACT_PORT
CONTACT_DATA_DIR=/data
CONTACT_ADMIN_PASSWORD=$CONTACT_ADMIN_PASSWORD
CONTACT_ADMIN_SECRET=$CONTACT_ADMIN_SECRET
CONTROL_STATIC_ROOT=/control
EOF
chmod 600 "$ENV_FILE"

systemctl disable --now kolob-contact.service >/dev/null 2>&1 || true
docker rm -f "$CONTACT_CONTAINER" >/dev/null 2>&1 || true

docker run -d \
  --name "$CONTACT_CONTAINER" \
  --restart unless-stopped \
  --network "$CADDY_NETWORK" \
  --env-file "$ENV_FILE" \
  -v "$APP_DIR:/app:ro" \
  -v "$DATA_DIR:/data" \
  -v "$CONTROL_DIR:/control:ro" \
  "$CONTACT_IMAGE" \
  python3 /app/contact_server.py >/dev/null

if [ ! -f "$CADDYFILE" ]; then
  echo "Missing Caddyfile: $CADDYFILE" >&2
  exit 1
fi

BACKUP="$CADDYFILE.bak.kolob-contact-$(date +%Y%m%d%H%M%S)"
cp "$CADDYFILE" "$BACKUP"
echo "Backup created: $BACKUP"

python3 - <<'PY'
from pathlib import Path

p = Path("/opt/server.host/Caddyfile")
text = p.read_text()

block = """# Kolobochnaya
colob.spi.ski {
\t@kolob_review path /__review /__review/*
\thandle @kolob_review {
\t\trespond 404
\t}

\t@kolob_contact_backend path /api/contact /api/leads /api/leads.csv /leads /leads/* /control /control/* /investor/franchise-platform /investor/franchise-platform/* /capex-configurator /capex-configurator/ /launch-budget /launch-budget/ /revenue-model /revenue-model/ /economics /economics/ /health
\thandle @kolob_contact_backend {
\t\treverse_proxy kolob-contact:8787
\t}

\thandle {
\t\troot * /srv/static/colob.spi.ski
\t\tencode zstd gzip
\t\ttry_files {path} {path}/index.html =404
\t\tfile_server
\t}

\thandle_errors {
\t\troot * /srv/static/colob.spi.ski
\t\trewrite * /404/index.html
\t\tfile_server
\t}

\t@immutable {
\t\tpath_regexp static \.(?:css|js|mjs|png|jpg|jpeg|gif|webp|svg|ico|woff|woff2|ttf|eot)$
\t}
\theader @immutable Cache-Control "public, max-age=31536000, immutable"
\theader {
\t\tX-Content-Type-Options "nosniff"
\t\tReferrer-Policy "strict-origin-when-cross-origin"
\t}
}
"""

start = text.find("# Kolobochnaya\ncolob.spi.ski {")
if start == -1:
    raise SystemExit("Kolobochnaya Caddy block not found")

depth = 0
end = None
in_block = False
for index in range(start, len(text)):
    char = text[index]
    if char == "{":
        depth += 1
        in_block = True
    elif char == "}":
        depth -= 1
        if in_block and depth == 0:
            end = index + 1
            break

if end is None:
    raise SystemExit("Could not find end of Kolobochnaya Caddy block")

p.write_text(text[:start] + block + text[end:])
PY

sleep 1
docker exec "$CADDY_CONTAINER" sh -lc "wget -qO- --timeout=5 http://$CONTACT_CONTAINER:$CONTACT_PORT/health"
docker exec "$CADDY_CONTAINER" caddy validate --config /etc/caddy/Caddyfile
docker exec "$CADDY_CONTAINER" caddy reload --config /etc/caddy/Caddyfile

echo "Contact container status:"
docker ps --filter "name=$CONTACT_CONTAINER" --format '{{.Names}} {{.Status}}'
echo "Leads page: https://colob.spi.ski/leads"
echo "Leads data file: $DATA_DIR/contacts.jsonl"
