# CODEX handoff: «Колобочная»

Статус: операционный навигационный документ

Дата проверки: 2026-07-31

Проверенный Git commit: `ed6d00607a5cd8cc635f5fdc79877ccf467baabd` (`Last web fix`)

Проверенная ветка: `master`, синхронизирована с `origin/master`

> При начале нового Codex-чата сначала прочитать AGENTS.md и docs-platform/context/CODEX_HANDOFF.md, затем проверить git status и актуальность registry.

В текущем commit корневой `AGENTS.md` не хранится в Git. Единственная отслеживаемая вложенная инструкция — `docs-platform/AGENTS.md`; она действует на весь `docs-platform/`. Если рабочая среда предоставляет корневой `AGENTS.md` отдельно, сначала применить его, затем более узкий `docs-platform/AGENTS.md`.

Этот handoff помогает найти действующие источники, но не заменяет Foundation, registry, decisions, change sets и канонические документы.

## 1. Назначение проекта

«Колобочная» — существующий проект инвесторского сайта и управляемой платформы инвестиционных документов. Foundation v1.0 определяет проект как основу для создания и развития компании, способной масштабировать новый формат общественного питания федерального уровня. Стратегические решения должны оцениваться по влиянию на устойчивость, масштабируемость и долгосрочную ценность компании.

## 2. Структура репозитория

- `src/` — React/Vite/TypeScript-сайт; редактируемый публичный контент находится в `src/content/`.
- `public/` — подготовленные web-медиа.
- `scripts/` — сборка, prerender, проверки сайта и подготовка медиа.
- `server/` — backend формы контакта.
- `rules-project.md` — правила архитектуры, контента, визуальной системы, тестирования и публикации сайта.
- `docs-platform/` — governed document system: registry, schemas, standards, templates, change sets, changelog, Google Workspace CLI и MCP.
- `docs-platform/app/` — локальный CLI registry и guarded Google Workspace integration.
- `docs-platform/mcp/` — отдельный MCP-пакет с review-only режимом по умолчанию.

Каталоги `Madia/`, `reference/` и исходные аналитические материалы исключены корневым `.gitignore` и в текущем клоне отсутствуют. Локальный `analysis/` также игнорируется и не является каноническим источником.

## 3. Карта источников истины

Приоритет источников задан в `docs-platform/standards/source-policy.md`:

1. первичный документ или подтверждение;
2. утверждённый текст;
3. опубликованный код сайта;
4. аналитический материал;
5. гипотеза.

Практическая карта:

- Базовые принципы проекта: `docs-platform/00-foundation.md` и точные тексты в `docs-platform/registry/principles.yaml`.
- Факты, допущения, решения, документы, источники и зависимости: `docs-platform/registry/*.yaml`.
- Утверждённый публичный текст: `src/content/approved-copy.ts`; не перефразировать без отдельного согласования.
- Текущее опубликованное содержание: остальные файлы `src/content/*.ts`.
- Ограничения сайта и публикации: `rules-project.md`.
- Статус и история содержательных изменений: `docs-platform/changes/`, `docs-platform/changelog/` и `registry/decisions.yaml`.
- Google Docs и Google Sheets — управляемые рабочие представления, но не единственный источник истины.
- `docs-platform/templates/` — заготовки со статусами `idea`/`proposed`, а не утверждённые бизнес-документы.

## 4. Действующие инструкции и стандарты

Для `docs-platform/` обязательны:

- `docs-platform/AGENTS.md`;
- `docs-platform/standards/approval-policy.md`;
- `docs-platform/standards/document-style.md`;
- `docs-platform/standards/financial-model-standard.md`;
- `docs-platform/standards/source-policy.md`;
- `docs-platform/standards/terminology.md`;
- схемы `docs-platform/schemas/*.schema.json`.

Ключевые правила:

- не смешивать факты, research, proposed и assumptions;
- не придумывать финансовые показатели;
- не менять утверждённый текст без отдельного approved decision;
- не вносить содержательные правки в registry напрямую;
- применять содержательные изменения только через approved change set с preview, validation, журналом и rollback;
- не считать выбор или покупку конкретного помещения утверждёнными;
- не менять Google Docs/Sheets без folder guard, preview/diff, approved decision и явного подтверждения;
- не заменять формулы Google Sheets статическими числами и не удалять ручные комментарии Google Docs.

## 5. Утверждённые канонические документы

### Foundation v1.0

- Файл: `docs-platform/00-foundation.md`.
- Registry ID: `DOC-FOUNDATION`.
- Статус: `approved`.
- Версия: `1.0`.
- Decision: `DEC-003`.
- Change sets: `CHG-003`, `CHG-004`.
- Принципы: `PRP-FND-001`—`PRP-FND-007`, все `approved` и `governing`.
- Commit добавления: `6da1821cad295d7cee2dfabd7837eb9438be91b7`.
- Тест `foundation.test.ts` подтверждает точное совпадение Markdown и `registry/principles.yaml`.

### Business Model Architecture v1.0

В текущем репозитории отсутствует:

- нет канонического Markdown-файла;
- нет `PRP-BMA-001`—`PRP-BMA-010`;
- нет документа в `registry/documents.yaml`;
- нет соответствующего decision и change set;
- Git-история не содержит `PRP-BMA-001`.

`registry/dependencies.yaml` содержит только целевую зависимость от Foundation с названием `Business Model Architecture` и пустым `document_id`. Поэтому внешнюю или чат-версию нельзя восстанавливать по памяти: для регистрации нужен точный утверждённый исходный текст и отдельный governed change set.

Других утверждённых канонических бизнес-документов в registry нет. `DOC-README`, `DOC-AGENTS` и `DOC-AUDIT` имеют статус `approved`, но являются техническим руководством, политикой и аудитом. `DOC-INVESTMENT-MEMO` — только `proposed` template.

## 6. Последние approved decisions и change sets

Approved decisions:

- `DEC-001` — локальная платформа и registry как структурированный источник; Google Docs/Sheets — производные представления.
- `DEC-002` — финансовая модель должна сравнивать `PURCHASE`, `RENT` и `MASTER_LEASE`; это не выбор конкретного помещения.
- `DEC-003` — регистрация Foundation v1.0 и семи неизменяемых PRP-блоков.

Approved change sets:

- `CHG-002` — уточнён исследовательский статус сценария покупки.
- `CHG-003` — добавлены источник утверждения Foundation и `DEC-003`.
- `CHG-004` — зарегистрированы Foundation, семь principles и карта зависимостей.

`example-change.yaml` имеет статус `proposed` и не должен применяться. Не применять существующие change sets повторно во время onboarding.

## 7. Состояние registry

Проверено 2026-07-31 командой `npm run registry:validate`: `OK`.

| Registry | Количество | Состояние |
|---|---:|---|
| facts | 3 | все `approved` |
| assumptions | 3 | все `research`; сценарии помещения |
| decisions | 3 | все `approved` |
| metrics | 0 | финансовые метрики отсутствуют |
| documents | 7 | 4 `approved`, 1 `proposed`, 2 `research` test records |
| sources | 6 | lifecycle status схемой не предусмотрен |
| principles | 7 | все Foundation v1.0, `approved` |
| dependencies | 1 | Foundation как governing source |

Approved facts: правильное название «Колобочная», базовая категория «еда в пути» и самостоятельное выращивание части растительных ингредиентов. Исторические, медийные и операционные утверждения сайта требуют первичной доказательной привязки для инвестиционного пакета.

## 8. Google Workspace integration

Код интеграции присутствует и покрыт офлайн-тестами. Используется минимальный scope `drive.file`, отдельная project folder guard, preview и интерактивные подтверждения.

На проверенном компьютере отсутствуют ожидаемые локальные компоненты:

- `docs-platform/config/google.json`;
- локальные OAuth credentials;
- OAuth token;
- test manifest;
- локальный pending registry change для sandbox-файлов.

Это ожидаемое состояние нового клона, а не повреждение. Для восстановления позднее потребуются Desktop OAuth client, локальный config выбранной папки, OAuth token и доступ к зарегистрированной проектной папке. Не запускать OAuth и не создавать/изменять Google-файлы без отдельной задачи владельца.

## 9. MCP integration

- Пакет: `docs-platform/mcp/`.
- Режим по умолчанию: `review`.
- Review публикует ровно девять инструментов чтения и preview; apply-инструменты не регистрируются.
- Write-mode требует точных `MCP_CAPABILITY_MODE=write` и `MCP_WRITE_ACK=I_UNDERSTAND` и предназначен только для отдельного локального обслуживающего сценария.
- Доступ ограничен зарегистрированными document IDs и project folder guard.
- Preview хранится локально 24 часа; audit лог редактирует секреты.

На проверенном компьютере отсутствуют `tunnel-client`, локальный tunnel profile, runtime API key и `.runtime/`. Tunnel к ChatGPT не подключён. `mcp:smoke` не запускался, потому что он читает зарегистрированные Google test files и требует отсутствующую локальную Google-конфигурацию.

## 10. Команды проверки

Использовать современный Node.js; проверка 2026-07-31 выполнена на Node `24.14.0`. Системный Node `18.18.2` недостаточен для Vite 7. Если `node_modules` отсутствует, выполнять `npm ci` в соответствующем package, не обновляя зависимости произвольно.

Сайт, из корня репозитория:

```bash
npm test
npm exec -- tsc --noEmit
```

Docs platform:

```bash
cd docs-platform/app
npm test
npm exec -- tsc --noEmit
npm run registry:validate
npm run mcp:test
```

MCP отдельно:

```bash
cd docs-platform/mcp
npm test
npm run check
```

Результаты 2026-07-31:

- сайт: 9 маршрутов, mobile menu и form fallback — без failures;
- root TypeScript — OK;
- docs-platform: 24/24 теста, TypeScript — OK;
- registry validation — OK;
- MCP: 21/21 тест, TypeScript — OK.

## 11. Правила содержательных изменений

1. Зафиксировать первичный источник и статус утверждения.
2. Создать decision record; содержательное изменение требует `approved` decision.
3. Подготовить change set в `docs-platform/changes/`.
4. Выполнить `change:preview` и проверить diff/validation.
5. Применять только approved change set, связанный с существующим approved decision.
6. Проверить registry, changelog и все зависимые документы.
7. Для Google дополнительно проверить folder guard, revision/hash и явное интерактивное подтверждение.

Foundation v1.0 и `src/content/approved-copy.ts` нельзя редактировать как обычный текст. Шаблоны и аналитические материалы не повышать до `approved` без решения владельца.

## 12. Текущая стадия работы

Репозиторий содержит рабочий инвесторский сайт, governed registry, guarded Google Workspace CLI, review-only MCP и Foundation v1.0. Финансовая модель не создана: `metrics` пуст, числовых финансовых assumptions нет, а три текущих assumptions фиксируют только исследуемые сценарии помещения.

Business Model Architecture пока не зарегистрирована. Поэтому детальная архитектура бизнеса, Financial Model, Infrastructure Strategy, Network Development Model и инвестиционный меморандум не имеют утверждённых канонических версий в текущем registry.

## 13. Следующая рабочая задача

Сначала устранить разрыв по Business Model Architecture: получить от владельца точный утверждённый исходный текст, не реконструировать его, зарегистрировать документ через decision/change set и добавить автоматическую проверку канонических блоков по образцу Foundation.

После этого — отдельным заданием сформировать реестр исходных данных для финансовой модели и сравнения трёх сценариев помещения. Любая рабочая спецификация оборудования или CAPEX, которой нет в repository/registry, должна передаваться отдельным точным заданием и не должна восстанавливаться по догадкам.

## 14. Известные открытые вопросы

- Нет зарегистрированной Business Model Architecture v1.0.
- Нет финансовой модели, метрик, числовых assumptions, единиц, периодов и владельцев показателей.
- Не определены первичные источники для истории, медийных охватов, состава продукта и операционных данных.
- Не указан именованный владелец/утверждающий будущих решений, кроме общей роли `project owner`.
- Локальная Google/MCP-конфигурация на этом компьютере не восстановлена.
- `docs-platform/AUDIT.md` и `rules-project.md` содержат старый Windows-путь; перечисленные в аудите исходные `analysis/`, `Madia/` и `reference/` не входят в текущий Git clone.
- `docs-platform/README.md`, `SELF_REVIEW.md` и `changelog/README.md` содержат исторические формулировки, устаревшие относительно уже реализованных тестов, MCP и Foundation. Не исправлять их в onboarding; оформить отдельное техническое изменение.

## 15. Git-состояние на дату проверки

- Repository HEAD до создания этого handoff был чистым.
- Ветка: `master`.
- Upstream: `origin/master`, ahead/behind `0/0`.
- Последний commit: `ed6d00607a5cd8cc635f5fdc79877ccf467baabd`, 2026-07-24, `Last web fix`; он относится к сайту и `src/content/`.
- Последний содержательный commit docs-platform: `6da1821cad295d7cee2dfabd7837eb9438be91b7`, 2026-07-23, `feat(docs-platform): add Foundation v1.0`.
- Дата проверки: 2026-07-31.
