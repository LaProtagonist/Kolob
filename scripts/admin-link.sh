#!/bin/bash

# Создаёт новую длинную ссылку для входа в закрытую зону и печатает её.
# Повторный запуск выдаёт новую ссылку, прежняя перестаёт работать.
# Сайт пересобирать не нужно: ключ лежит в файле на сервере и читается при каждом входе.

set -euo pipefail

SERVER="${SERVER:-root@155.212.245.24}"
SSH_OPTS="${SSH_OPTS:- -o ConnectTimeout=20 -o ConnectionAttempts=1}"
KOLOB_HOST="${KOLOB_HOST:-colob.spi.ski}"
REMOTE_KEY_FILE="${REMOTE_KEY_FILE:-/srv/kolob-data/admin-link.key}"

if [[ "$KOLOB_HOST" != "colob.spi.ski" || "$REMOTE_KEY_FILE" != /srv/kolob-data/* ]]; then
  echo "Неожиданная цель: KOLOB_HOST=$KOLOB_HOST REMOTE_KEY_FILE=$REMOTE_KEY_FILE" >&2
  exit 1
fi

if [[ "${1:-}" == "-off" ]]; then
  ssh $SSH_OPTS "$SERVER" "rm -f '$REMOTE_KEY_FILE'"
  echo "Вход по ссылке выключен. Вход по паролю работает как раньше."
  exit 0
fi

KEY="$(openssl rand -hex 32)"
printf '%s\n' "$KEY" | ssh $SSH_OPTS "$SERVER" "umask 077 && cat > '$REMOTE_KEY_FILE.next' && mv '$REMOTE_KEY_FILE.next' '$REMOTE_KEY_FILE'"

LINK="https://$KOLOB_HOST/control/key/$KEY"
STATUS="$(curl -s -o /dev/null -m 20 -w '%{http_code}' "$LINK" || true)"

if [[ "$STATUS" != "303" ]]; then
  echo "Ключ записан, но сервер ответил $STATUS вместо входа." >&2
  echo "Серверная часть ещё не умеет вход по ссылке. Обновите её и запустите команду снова:" >&2
  echo "  npm run backend:deploy" >&2
  exit 1
fi

if command -v pbcopy >/dev/null 2>&1; then
  printf '%s' "$LINK" | pbcopy
  COPIED=" Она уже в буфере обмена."
else
  COPIED=""
fi

echo "Ссылка для входа в закрытую зону.$COPIED"
echo
echo "$LINK"
echo
echo "Кто знает ссылку, тот входит без пароля. Новая ссылка: npm run admin:link. Выключить: npm run admin:link -- -off"
