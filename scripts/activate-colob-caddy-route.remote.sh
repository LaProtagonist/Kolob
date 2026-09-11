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

mkdir -p "$SITE_ROOT"

ROUTE_FILE="$(mktemp)"
UPDATED_FILE="$(mktemp)"

cat > "$ROUTE_FILE" <<'CADDY_ROUTE'

# Kolobochnaya
colob.spi.ski {
	@kolob_review path /__review /__review/*
	handle @kolob_review {
		respond 404
	}

	@kolob_contact_backend path /api/contact /api/leads /api/leads.csv /leads /leads/* /control /control/* /investor/franchise-platform /investor/franchise-platform/* /capex-configurator /capex-configurator/ /launch-budget /launch-budget/ /revenue-model /revenue-model/ /economics /economics/ /health
	handle @kolob_contact_backend {
		reverse_proxy kolob-contact:8787
	}

	handle {
		root * /srv/static/colob.spi.ski
		encode zstd gzip
		try_files {path} {path}/index.html =404
		file_server
	}

	handle_errors {
		root * /srv/static/colob.spi.ski
		rewrite * /404/index.html
		file_server
	}

	@immutable {
		path_regexp static \.(?:css|js|mjs|png|jpg|jpeg|gif|webp|svg|ico|woff|woff2|ttf|eot)$
	}
	header @immutable Cache-Control "public, max-age=31536000, immutable"
	header {
		X-Content-Type-Options "nosniff"
		Referrer-Policy "strict-origin-when-cross-origin"
	}
}
CADDY_ROUTE

python3 - "$CADDYFILE" "$ROUTE_FILE" "$UPDATED_FILE" <<'PY'
import re
import sys
from pathlib import Path

caddyfile = Path(sys.argv[1])
route_file = Path(sys.argv[2])
updated_file = Path(sys.argv[3])

text = caddyfile.read_text(encoding="utf-8")
route = route_file.read_text(encoding="utf-8").strip() + "\n"

def find_route_block(source: str):
    marker = "# Kolobochnaya\ncolob.spi.ski {"
    marker_start = source.find(marker)
    if marker_start >= 0:
        start = marker_start
        host_start = marker_start + len("# Kolobochnaya\n")
    else:
        match = re.search(r"(?m)^[ \t]*colob\.spi\.ski[ \t]*\{", source)
        if not match:
            return None
        start = match.start()
        host_start = match.start()

    depth = 0
    end = None
    for index in range(host_start, len(source)):
        char = source[index]
        if char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                end = index + 1
                while end < len(source) and source[end] in "\r\n":
                    end += 1
                break
    if end is None:
        raise SystemExit("Could not parse existing colob.spi.ski Caddy block")
    return start, end

block = find_route_block(text)
if block:
    start, end = block
    new_text = text[:start].rstrip() + "\n\n" + route + text[end:].lstrip("\r\n")
else:
    new_text = text.rstrip() + "\n\n" + route

updated_file.write_text(new_text, encoding="utf-8")
PY

if cmp -s "$CADDYFILE" "$UPDATED_FILE"; then
  rm -f "$ROUTE_FILE" "$UPDATED_FILE"
  echo "Caddy route already up to date: $HOST"
else
  BACKUP="$CADDYFILE.bak.colob-$(date +%Y%m%d%H%M%S)"
  cp "$CADDYFILE" "$BACKUP"
  cat "$UPDATED_FILE" > "$CADDYFILE"
  rm -f "$ROUTE_FILE" "$UPDATED_FILE"
  echo "Backup created: $BACKUP"
  echo "Caddy route updated: $HOST -> $SITE_ROOT"
fi

if ! docker ps --format '{{.Names}}' | grep -Fxq "$CADDY_CONTAINER"; then
  echo "Caddy container is not running: $CADDY_CONTAINER" >&2
  echo "Route is present in $CADDYFILE, but validation/reload was not executed." >&2
  exit 1
fi

docker exec "$CADDY_CONTAINER" caddy validate --config /etc/caddy/Caddyfile
docker exec "$CADDY_CONTAINER" caddy reload --config /etc/caddy/Caddyfile

echo "Caddy route active: https://$HOST"
