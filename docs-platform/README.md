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
