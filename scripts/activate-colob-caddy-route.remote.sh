#!/bin/sh

set -eu

HOST="colob.spi.ski"
SITE_ROOT="/srv/static/colob.spi.ski"
CADDY_DIR="/opt/server.host"
CADDYFILE="$CADDY_DIR/Caddyfile"
CADDY_CONTAINER="land-static-caddy"

if [ ! -f "$CADDYFILE" ]; then
  echo "Missing Caddyfile: $CADDYFILE" >&2
  exit 1
fi

if ! grep -q "^(static_site)" "$CADDYFILE"; then
  echo "Caddy snippet (static_site) was not found in $CADDYFILE" >&2
  exit 1
fi

mkdir -p "$SITE_ROOT"

if grep -Eq "^[[:space:]]*colob\\.spi\\.ski[[:space:]]*\\{" "$CADDYFILE"; then
  echo "Caddy route already exists: $HOST"
else
  BACKUP="$CADDYFILE.bak.colob-$(date +%Y%m%d%H%M%S)"
  cp "$CADDYFILE" "$BACKUP"
  echo "Backup created: $BACKUP"

  cat >> "$CADDYFILE" <<'CADDY_ROUTE'

# Kolobochnaya
colob.spi.ski {
	root * /srv/static/colob.spi.ski
	import static_site
}
CADDY_ROUTE

  echo "Caddy route added: $HOST -> $SITE_ROOT"
fi

if ! docker ps --format '{{.Names}}' | grep -Fxq "$CADDY_CONTAINER"; then
  echo "Caddy container is not running: $CADDY_CONTAINER" >&2
  echo "Route is present in $CADDYFILE, but validation/reload was not executed." >&2
  exit 1
fi

docker exec "$CADDY_CONTAINER" caddy validate --config /etc/caddy/Caddyfile
docker exec "$CADDY_CONTAINER" caddy reload --config /etc/caddy/Caddyfile

echo "Caddy route active: https://$HOST"
