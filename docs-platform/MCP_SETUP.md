# MCP и Secure MCP Tunnel

## Официальные источники OpenAI

- [Build your MCP server](https://developers.openai.com/apps-sdk/build/mcp-server) — сервер MCP, схемы инструментов и annotations.
- [Connect from ChatGPT](https://developers.openai.com/apps-sdk/deploy/connect-chatgpt) — developer-mode app в ChatGPT.
- [Secure MCP Tunnel](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels) — private tunnel, права, профиль `tunnel-client`, health и readiness.
- [Platform Tunnel Settings](https://platform.openai.com/settings/organization/tunnels) — создание tunnel, связка с организациями и загрузка клиента.
- [openai/tunnel-client releases](https://github.com/openai/tunnel-client/releases/latest) — официальный запасной источник актуального бинарного файла.

## Границы доступа

`docs-platform/mcp/` — отдельный TypeScript-пакет. Он повторно использует Google Workspace и registry-модули из `docs-platform/app/`; OAuth-логику, токены и Google-клиенты он не дублирует.

```text
ChatGPT
   │ OpenAI-hosted tunnel endpoint
tunnel-client (outbound HTTPS only)
   │ stdio
review-only MCP server
   ├── registry/document IDs only
   ├── project-folder guard
   ├── .runtime/previews (TTL 24 h, ignored)
   └── .runtime/audit (redacted JSONL, ignored)
```

Инструменты не принимают произвольные Google file ID, URL и пути. Чтение возможно только для `document_id` из `registry/documents.yaml` после проверки принадлежности проектной папке.

## Capability modes

`MCP_CAPABILITY_MODE` принимает только `review` или `write`. Значение по умолчанию и production-default — `review`.

В `review` MCP регистрирует ровно девять инструментов:

1. `project_status`
2. `registry_validate`
3. `documents_list`
4. `document_read`
5. `spreadsheet_read`
6. `decision_get`
7. `change_get`
8. `document_update_preview`
9. `registry_change_preview`

В этом режиме `document_update_apply` и `registry_change_apply` отсутствуют из `tools/list`; они не скрываются ошибкой, а вообще не регистрируются. Read- и preview-инструменты имеют `readOnlyHint: true`. Preview создаёт только локальную TTL-запись и audit event, не меняя Google Docs, Google Sheets или registry.

`write` предназначен только для отдельного локального обслуживающего сценария и запускается лишь при точном сочетании:

```powershell
$env:MCP_CAPABILITY_MODE = "write"
$env:MCP_WRITE_ACK = "I_UNDERSTAND"
```

Без acknowledgement процесс завершается до регистрации инструментов. На текущем этапе `write` не запускается, не проверяется через tunnel и не подключается к ChatGPT.

## Локальные проверки

Из `docs-platform/app/`:

```powershell
npm test
npx tsc --noEmit
npm run registry:validate
npm run mcp:test
npm run mcp:smoke
```

`mcp:smoke` сам проверяет, что режим — `review`, и выполняет только `project_status`, `documents_list`, `document_read(TEST-DOC-001)`, `spreadsheet_read(TEST-SHEET-001, README, A1:B4)` и `registry_validate`.

`npm run mcp:dev` запускает stdio MCP. `npm run mcp:inspect` запускает локальный MCP Inspector; он не публикует сервер в ChatGPT.

## Подготовка Secure MCP Tunnel на Windows

Не используйте ngrok, Cloudflare Tunnel или другие публичные туннели. Secure MCP Tunnel требует только исходящий HTTPS к OpenAI; входящий порт для MCP не открывается.

### Ручные действия владельца

1. Откройте [Platform Tunnel Settings](https://platform.openai.com/settings/organization/tunnels).
2. Создайте tunnel с именем `kolobochnaya-docs-dev`.
3. Свяжите его с текущей Platform organization и с ChatGPT workspace/account, где будет использоваться этот разговор.
4. Создайте runtime API key. Не отправляйте ключ в чат и не сохраняйте его в Git.
5. Скачайте `tunnel-client` только по ссылке из Tunnel Settings или с официального latest release `openai/tunnel-client`; добавьте бинарный файл в `PATH`.

Для создания или изменения tunnel нужны права **Tunnels Read + Manage**. Для запуска клиента и выбора tunnel в ChatGPT нужны **Tunnels Read + Use**. Если страница сообщает `Tunnels access required`, требуется назначение роли владельцем Platform organization или RBAC-администратором; публичный tunnel как замена не допускается.

### Локальная конфигурация и запуск

Только после создания tunnel скопируйте пример в игнорируемый файл и внесите `tunnelId`:

```powershell
Copy-Item .\config\tunnel.example.json .\.secrets\tunnel.json
```

`.secrets/tunnel.json` содержит только `tunnelId` и профиль `kolobochnaya-review`; он игнорируется Git. В файл нельзя добавлять runtime API key.

Запустите в отдельном локальном PowerShell-окне из `docs-platform/`:

```powershell
.\scripts\start-mcp-tunnel.ps1
```

Скрипт принудительно устанавливает `MCP_CAPABILITY_MODE=review`, удаляет наследованный `MCP_WRITE_ACK`, запускает `tunnel-client help quickstart`, создаёт/обновляет профиль `kolobochnaya-review`, запускает `doctor --explain`, затем `run`. Профиль передаёт stdio-команду в `scripts/run-mcp-review.ps1`; та явно выбирает `docs-platform/` как рабочий каталог и снова принудительно устанавливает `review`. Поэтому дочерний процесс наследует локальную OAuth-конфигурацию Google, но не получает write-режим.

Runtime API key запрашивается через скрытый prompt (`Read-Host -AsSecureString`), передаётся только в `CONTROL_PLANE_API_KEY` текущего процесса и очищается после завершения. Скрипт не принимает ключ аргументом командной строки, не выводит его и не записывает на диск.

`doctor` обязан завершиться успешно перед `run`. Пока `run` активен, проверяйте loopback-only `/healthz`, `/readyz` или `/ui` по адресу, который показывает установленный `tunnel-client`. Остановить tunnel можно `Ctrl+C`; launcher восстановит переменные окружения.

## Перед подключением к ChatGPT

1. Убедитесь локально, что `tools/list` содержит ровно девять инструментов из списка review выше.
2. Убедитесь, что в списке нет `document_update_apply` и `registry_change_apply`.
3. Проверьте `tunnel-client doctor --profile kolobochnaya-review --explain`, health и readiness активного клиента.
4. Вручную создайте или обновите metadata developer-mode app в ChatGPT: **Settings → Plugins → + → Tunnel**. Выберите созданный tunnel и обновите metadata, только когда steps 1–3 пройдены.

На текущем этапе ChatGPT App не создаётся и tunnel к ChatGPT не подключается автоматически. Apply-инструменты публиковать запрещено.

## Известная зависимость

`npm audit --omit=dev` у `docs-platform/mcp` сообщает две moderate advisory в транзитивном `@hono/node-server` через MCP SDK. Уязвимость относится к HTTP Node adapter на Windows; используемый путь — private stdio MCP без HTTP/static-file listener, поэтому этот path не задействован. Не применять `npm audit fix --force` и не понижать MCP SDK без отдельной совместимой проверки.

Отдельный `npm audit --omit=dev` в `docs-platform/app` также сообщает одну high advisory в `fast-uri` и одну moderate advisory в `uuid` через `gaxios`. Автоматическое исправление не запускалось: это требует отдельной проверки совместимых обновлений Google/API-зависимостей. Эти зависимости не изменяют review-only набор MCP tools, но остаются открытым security follow-up.
