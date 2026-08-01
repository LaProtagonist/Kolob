# Платформа инвестиционных документов «Колобочная»

Этот каталог — локальный технический источник управления инвестиционными материалами. Google Docs и Google Sheets являются рабочими представлениями, но не единственным источником истины: структурированные факты, допущения, решения и связи источников ведутся в `registry/`.

## Вариант A — минимальный

- Google Drive, Google Docs и Google Sheets;
- OAuth для одного выделенного пользователя;
- шаблоны из `templates/`;
- ручной запуск синхронизации из Codex;
- ручной review preview и diff до применения изменений.

## Вариант B — целевой (рекомендуется)

- TypeScript/Node.js;
- Google Docs API, Google Sheets API и Google Drive API;
- MCP-сервер как контролируемый интерфейс для Codex/ChatGPT;
- локальный `registry/` и Git;
- команды `preview`, `apply`, `validate`, `rollback`;
- журнал изменений, связывающий batchUpdate, document ID, revision ID и decision ID.

Реализован вариант B: он сохраняет проверяемость, предотвращает массовую перезапись и разделяет подготовку, согласование и применение. Google OAuth хранится только в локальных исключённых из Git файлах проекта.

## Границы ответственности

- Финансовые расчёты живут в Google Sheets; формулы не заменяются статическими числами.
- Инвестиционные тексты и решения для чтения — в Google Docs.
- Локальные YAML-файлы — реестр фактов, допущений, решений, документов и источников.
- Перед внешним изменением обязательны `preview` и diff; применение возможно только после проверки и с decision ID.

См. [GOOGLE_SETUP.md](GOOGLE_SETUP.md), [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md), [AGENTS.md](AGENTS.md).

## Локальный CLI

```bash
cd docs-platform/app
npm ci
npm run registry:validate
npm run registry:list
npm run documents:list
npm run decisions:list
npm run change:preview -- ../changes/example-change.yaml
npm run change:reverse:preview -- ../changelog/change-receipts/CHG-XXX.yaml --change-id CHG-ROLLBACK-XXX --decision DEC-ROLLBACK-XXX
npm run timeline:validate
npm run timeline:generate
npm run capex:register:validate
```

`change:preview` не пишет в registry: показывает затронутые сущности, before/after и ошибки validation. `change:apply` принимает только change set со статусом `approved`, ссылающийся на существующее approved decision; он создаёт backup, повторно валидирует результат и делает rollback при ошибке.

Обязательный жизненный цикл содержательной итерации: proposal → approved decision → approved change set → preview → apply того же payload/SHA-256 → validation → verification receipt → append-only timeline. Rollback создаётся как новый reverse change set и не удаляет историю.

Локальный OAuth, folder guard и Google API подключены. Секреты, token, folder ID и runtime-файлы не входят в Git.

## Verified local execution

Проверено 2026-08-01: docs-platform unit tests, TypeScript, registry validation, CAPEX register schema/reference validation, Google folder guard и Google Sheets readback прошли успешно. Governed apply создаёт backup и receipt с before/after hashes; reverse preview подтверждает восстановление исходного registry hash.

## Guarded Google Workspace sandbox

Реализован локальный CLI для OAuth Desktop Application, Drive, Docs и Sheets. Он использует только `drive.file`: официальные Docs и Sheets methods в используемом сценарии допускают этот минимальный scope. Внешний доступ дополнительно ограничен local `projectFolderId` и проверкой родителя каждого файла.

```bash
npm run google:doctor
npm run google:auth
npm run google:folder:authorize
npm run google:folder:inspect
npm run google:publish:preview
npm run google:publish:apply -- --apply --decision DEC-006
npm run capex:sheet:preview
npm run capex:sheet:apply -- --apply --decision DEC-007
npm run google:test:create
npm run google:test:read
npm run google:test:update -- --preview
```

`google:test:update -- --apply` требует approved DEC-002, успешного внутреннего preview, project-folder guard и интерактивного ввода `APPLY_TEST_UPDATE`. `google:test:cleanup` требует `DELETE_TEST_FILES`, работает исключительно по локальному manifest и не меняет registry. После создания файлов CLI готовит локальный proposed change set для `TEST-DOC-001` и `TEST-SHEET-001`; registry напрямую не редактируется.

`google:folder:authorize` использует Google Picker с единственным scope `drive.file`. Google Docs publisher ограничен тремя зарегистрированными документами и `DEC-006`. CAPEX Sheet publisher ограничен `DOC-CAPEX-EQUIPMENT-REGISTER`, точным именем файла, пятью листами и `DEC-007`; повторный запуск обновляет единственный файл и отказывается выбирать дубликаты. Оба publisher выполняют API readback и сохраняют безопасные receipts. Registry обновляется отдельно через governed change set.

До ручной OAuth-авторизации не запускать команды создания, чтения, update или cleanup. Инструкция подготовки находится в `GOOGLE_SETUP.md`.
