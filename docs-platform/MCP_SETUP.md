# MCP: безопасное подключение к ChatGPT

## Использованные официальные источники OpenAI

- [Build your MCP server](https://developers.openai.com/apps-sdk/build/mcp-server) — Node SDK, server instructions, tool annotations и запрет секретов в ответах.
- [MCP Apps compatibility in ChatGPT](https://developers.openai.com/apps-sdk/mcp-apps-in-chatgpt) — совместимость MCP-инструментов с ChatGPT.
- [Connect from ChatGPT](https://developers.openai.com/apps-sdk/deploy/connect-chatgpt) — developer mode, создание developer-mode app и пользовательские подтверждения.
- [Secure MCP Tunnel](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels) — private transport без входящего публичного listener.

MCP Server использует официальный пакет `@modelcontextprotocol/sdk`. Apps SDK не требует UI: на этом этапе сервер предоставляет только tools.

## Локальная архитектура

`docs-platform/mcp/` — отдельный TypeScript-пакет. Он повторно использует registry и Google Workspace-модули из `docs-platform/app/`; OAuth, токены и Google-клиенты не дублируются.

```text
ChatGPT / Inspector
        │ MCP
docs-platform/mcp (stable registry IDs only)
        ├── registry + governed CLI workflow
        ├── .runtime/previews (TTL 24 h, ignored)
        ├── .runtime/audit (redacted JSONL, ignored)
        └── existing Google folder guard + OAuth token
```

Инструменты не принимают Google file ID, URL, путь к файлу или произвольный диапазон без sheet name. Доступ к Google Drive ограничен зарегистрированными `document_id` и проверкой прямой принадлежности выделенной проектной папке.

## Annotations и изменения

Все read-tools и preview-tools имеют `readOnlyHint: true`, `openWorldHint: false`, `destructiveHint: false`. Preview создаёт только локальный TTL-record и audit event; Google Docs, Sheets и registry не меняются.

Apply-tools имеют `readOnlyHint: false`, `openWorldHint: false`, `destructiveHint: true`, `idempotentHint: false`. Они не принимают `confirmed: true`: требуется существующий неистёкший preview ID, hash исходного состояния, approved decision и повторная folder/registry validation. Один preview применяется не более одного раза.

## Локальный запуск

Из `docs-platform/app/`:

```powershell
npm run mcp:dev
npm run mcp:inspect
npm run mcp:test
npm run mcp:smoke
```

`mcp:dev` запускает stdio MCP server. `mcp:inspect` запускает локальный официальный MCP Inspector. `mcp:smoke` выполняет только `project_status`, `documents_list`, `document_read(TEST-DOC-001)`, `spreadsheet_read(TEST-SHEET-001, README, A1:B4)` и `registry_validate`.

Если Windows использует локальный HTTP proxy, перед smoke или server process следует задать `HTTP_PROXY` и `HTTPS_PROXY` только в текущей PowerShell-сессии. Не сохранять эти переменные в репозитории.

## Рекомендуемое подключение: Secure MCP Tunnel

Secure MCP Tunnel сохраняет MCP server внутри локальной сети: `tunnel-client` инициирует только исходящий HTTPS к OpenAI и пересылает MCP JSON-RPC в локальный stdio-process. Не открывайте входящий порт и не используйте случайный публичный tunnel.

Ручные действия владельца:

1. В Platform tunnel settings создать tunnel и получить `tunnel_id`; потребуются права **Tunnels Read + Manage** для создания и **Tunnels Read + Use** для запуска/выбора.
2. Ассоциировать tunnel с целевым ChatGPT workspace и Platform organization.
3. Скачать актуальный `tunnel-client` по ссылке из Platform tunnel settings.
4. В новой PowerShell-сессии задать runtime key только в окружении, затем создать профиль:

```powershell
$env:CONTROL_PLANE_API_KEY = '<runtime API key>'
tunnel-client init --sample sample_mcp_stdio_local --profile kolobochnaya-mcp --tunnel-id '<tunnel_id>' --mcp-command "npm --prefix D:\Protagonist_Dev\Колобочная\docs-platform\mcp run dev"
tunnel-client doctor --profile kolobochnaya-mcp --explain
tunnel-client run --profile kolobochnaya-mcp
```

5. В ChatGPT включить **Settings → Security and login → Developer mode** (если это разрешено workspace admin).
6. В **Settings → Plugins** создать developer-mode app, выбрать **Tunnel** и указать созданный tunnel. Сначала разрешить только read/preview tools.

Не записывать `CONTROL_PLANE_API_KEY`, `tunnel_id`, runtime profile, OAuth credentials или token в Git. Не запускать эти команды автоматически.

## Временный вариант для разработки

Использовать только локальный inspector:

```powershell
cd D:\Protagonist_Dev\Колобочная\docs-platform\app
npm run mcp:inspect
```

Inspector не подключает server к ChatGPT и не публикует endpoint.

## Первые безопасные запросы в ChatGPT

После ручного подключения и проверки metadata доступны запросы:

```text
Покажи статус проекта «Колобочная».
Перечисли зарегистрированные документы.
Прочитай блок TEST-01.
Сформируй preview замены блока TEST-01.
```

Не тестировать apply из ChatGPT на текущем этапе.
