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

Рекомендуется вариант B: он сохраняет проверяемость, предотвращает массовую перезапись и позволяет разделить подготовку, согласование и применение. На текущем этапе не подключаются аккаунт Google, OAuth и секреты.

## Границы ответственности

- Финансовые расчёты живут в Google Sheets; формулы не заменяются статическими числами.
- Инвестиционные тексты и решения для чтения — в Google Docs.
- Локальные YAML-файлы — реестр фактов, допущений, решений, документов и источников.
- Перед внешним изменением обязательны `preview` и diff; применение возможно только после проверки и с decision ID.

См. [GOOGLE_SETUP.md](GOOGLE_SETUP.md), [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md), [AGENTS.md](AGENTS.md).

## Локальный CLI

```powershell
cd docs-platform/app
npm install
npm run registry:validate
npm run registry:list
npm run documents:list
npm run decisions:list
npm run change:preview -- ../changes/example-change.yaml
```

`change:preview` не пишет в registry: показывает затронутые сущности, before/after и ошибки validation. `change:apply` принимает только change set со статусом `approved`, ссылающийся на существующее approved decision; он создаёт backup, повторно валидирует результат и делает rollback при ошибке.

Жизненный цикл: создать исследование → оформить decision record → получить approved decision → подготовить change set → preview → apply → проверить changelog и связанные документы.

Текущие ограничения: нет Google API, OAuth, токенов, базы данных или веб-интерфейса; CLI изменяет только `registry/*.yaml`.

## Verified local execution

Проверено 2026-07-21 на Windows.

- Node.js `v24.14.1`, npm `11.11.0`.
- Выполнены `npm install`, `npm test`, `npm run registry:validate`, list-команды и сценарии `change:preview`/`change:apply`.
- Тесты: 10 passed, 0 failed. Registry validation: OK.
- Proposed change set корректно отклоняется до записи; approved CHG-002 создаёт backup и журнал с before/after, затем проходит validation.

Известные ограничения: MCP и реальные инвестиционные материалы не подключены.

## Guarded Google Workspace sandbox

Реализован локальный CLI для OAuth Desktop Application, Drive, Docs и Sheets. Он использует только `drive.file`: официальные Docs и Sheets methods в используемом сценарии допускают этот минимальный scope. Внешний доступ дополнительно ограничен local `projectFolderId` и проверкой родителя каждого файла.

```powershell
npm run google:doctor
npm run google:auth
npm run google:folder:inspect
npm run google:test:create
npm run google:test:read
npm run google:test:update -- --preview
```

`google:test:update -- --apply` требует approved DEC-002, успешного внутреннего preview, project-folder guard и интерактивного ввода `APPLY_TEST_UPDATE`. `google:test:cleanup` требует `DELETE_TEST_FILES`, работает исключительно по локальному manifest и не меняет registry. После создания файлов CLI готовит локальный proposed change set для `TEST-DOC-001` и `TEST-SHEET-001`; registry напрямую не редактируется.

До ручной OAuth-авторизации не запускать команды создания, чтения, update или cleanup. Инструкция подготовки находится в `GOOGLE_SETUP.md`.
