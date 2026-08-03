# CODEX handoff: «Колобочная»

Статус: операционный навигационный документ

Дата проверки: 2026-08-03

Последний проверенный Git commit до текущей итерации рабочего CAPEX-конфигуратора: `8e01e675ebc739844202126e671620a7ad8cb7f9` (`docs(docs-platform): add preliminary CAPEX price research`)

Проверенная ветка: `master`; на момент начала текущей задачи ahead/behind относительно `origin/master`: `7/0`

> При начале нового Codex-чата сначала прочитать доступный корневой AGENTS.md, docs-platform/AGENTS.md и docs-platform/context/CODEX_HANDOFF.md; затем прочитать актуальный docs-platform/changelog/TIMELINE.md, последние approved decisions и applied change sets; после этого проверить git status и актуальность registry.

В текущем commit корневой `AGENTS.md` не хранится в Git. Единственная отслеживаемая вложенная инструкция — `docs-platform/AGENTS.md`; она действует на весь `docs-platform/`. Если рабочая среда предоставляет корневой `AGENTS.md` отдельно, сначала применить его, затем более узкий `docs-platform/AGENTS.md`.

Этот handoff помогает найти действующие источники, но не заменяет Foundation, registry, decisions, change sets и канонические документы.

## 1. Назначение проекта

«Колобочная» — существующий проект инвесторского сайта и управляемой платформы инвестиционных документов. Foundation v1.0 определяет проект как основу для создания и развития компании, способной масштабировать новый формат общественного питания федерального уровня. Стратегические решения должны оцениваться по влиянию на устойчивость, масштабируемость и долгосрочную ценность компании.

## 2. Структура репозитория

- `src/` — React/Vite/TypeScript-сайт; редактируемый публичный контент находится в `src/content/`.
- `src/components/CapexConfigurator.tsx` и `src/content/capex-configurator-data.json` — скрытый внутренний CAPEX-инструмент и его детерминированный generated snapshot; маршрут `/capex-configurator` имеет `noindex, nofollow`, отсутствует в публичной навигации и sitemap.
- `public/` — подготовленные web-медиа.
- `scripts/` — сборка, prerender, проверки сайта и подготовка медиа.
- `server/` — backend формы контакта.
- `rules-project.md` — правила архитектуры, контента, визуальной системы, тестирования и публикации сайта.
- `docs-platform/` — governed document system: registry, schemas, standards, templates, change sets, changelog, Google Workspace CLI и MCP.
- `docs-platform/working/` — зарегистрированные рабочие материалы со статусами ниже `approved`; не являются каноническими документами.
- `docs-platform/changelog/events.ndjson` — append-only хронологический индекс governed iterations; `TIMELINE.md` — его автоматически генерируемое представление.
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

- Управляющие документы проекта: `docs-platform/00-foundation.md`, `docs-platform/01-business-model-architecture.md` и точные тексты их PRP-блоков в `docs-platform/registry/principles.yaml`.
- Исходная рабочая CAPEX-спецификация: `docs-platform/working/capex-equipment-specification.md`; неизменённый research-источник 124 записей.
- Канонический структурированный источник для будущих CAPEX-итераций: `docs-platform/working/capex-equipment-register.yaml`; статус `research`. CSV и Google Sheet генерируются из YAML и не заменяют его.
- Первичная ценовая оценка пищевой части: `docs-platform/working/capex-price-research.yaml`; отдельный зарегистрированный research-источник сценариев MINIMUM, BASE и SCALE_READY. Он не утверждает модели, поставщиков, КП, окончательные количества или итоговый CAPEX.
- Модульный CAPEX хранится раздельно: `capex-modules.yaml` ссылается на Equipment Register через `capex-module-items.yaml`; `capex-point-formats.yaml` ссылается на модули; `capex-configurations.yaml` и `capex-configuration-overrides.yaml` задают конкретный объект; BOM генерируется в `working/configurations/<configuration-id>/`.
- Web-представление CAPEX формируется командой `npm run capex:web:sync` из Equipment Register, Price Research, Modules, Module Items, Point Formats, Configurations, Overrides, registry и timeline. `src/content/capex-configurator-data.json` нельзя редактировать вручную; `npm run capex:web:check` обнаруживает устаревшие source hashes.
- Факты, допущения, решения, документы, источники и зависимости: `docs-platform/registry/*.yaml`.
- Утверждённый публичный текст: `src/content/approved-copy.ts`; не перефразировать без отдельного согласования.
- Текущее опубликованное содержание: остальные файлы `src/content/*.ts`.
- Ограничения сайта и публикации: `rules-project.md`.
- Статус и история содержательных изменений: proposal/iteration/change set в `docs-platform/changes/`, decisions в registry, receipts и append-only `docs-platform/changelog/events.ndjson`.
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
- применять только exact approved payload с тем же SHA-256; жизненный цикл — `proposed → approved → applied → verified`;
- выполнять rollback новым approved reverse change set без удаления истории и без `git reset`;
- хранить переносимые before-payloads файловых CAPEX-итераций в `docs-platform/changelog/rollback-payloads/`; игнорируемый локальный backup используется только для аварийного восстановления незавершённого apply;
- не считать выбор или покупку конкретного помещения утверждёнными;
- не менять Google Docs/Sheets без folder guard, preview/diff, approved decision и явного подтверждения;
- не заменять формулы Google Sheets статическими числами и не удалять ручные комментарии Google Docs.
- не дублировать оборудование в модулях, форматах или конфигурациях; отличия конкретной точки хранить только как overrides, а финансовую модель строить по сгенерированному BOM.
- не считать публичную цену утверждённой закупочной ценой: до отдельного решения все текущие цены имеют статус `research`, а позиции `quote_required` требуют коммерческого предложения или уточнения конфигурации.
- сохранять `/capex-configurator` внутренним рабочим маршрутом: без публичного меню, sitemap, инвесторского режима, unit economics и неподтверждённых показателей; итог называется «Стоимость текущей комплектации оборудования» и не выдаётся за полный CAPEX запуска.

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

- Файл: `docs-platform/01-business-model-architecture.md`.
- Registry ID: `DOC-BUSINESS-MODEL-ARCHITECTURE`.
- Статус: `approved`.
- Версия: `1.0`.
- Decision: `DEC-004`.
- Change sets: `CHG-005`, `CHG-006`.
- Принципы: `PRP-BMA-001`—`PRP-BMA-010`, все `approved` и `governing`.
- Основание: Foundation v1.0 через `DEP-FOUNDATION-DERIVED-DOCUMENTS`.
- Производные документы: Financial Model, Investment Memorandum, Infrastructure Strategy и Network Development Model через `DEP-BMA-DERIVED-DOCUMENTS`.
- Тест `business-model-architecture.test.ts` проверяет точное совпадение Markdown, change set и registry по фиксированным SHA-256 каждого блока.

Других утверждённых канонических бизнес-документов в registry нет. `DOC-README`, `DOC-AGENTS` и `DOC-AUDIT` имеют статус `approved`, но являются техническим руководством, политикой и аудитом. `DOC-INVESTMENT-MEMO` остаётся только `proposed` template.

### CAPEX — Equipment Specification v0.1

- Файл: `docs-platform/working/capex-equipment-specification.md`.
- Registry ID: `DOC-CAPEX-EQUIPMENT-SPECIFICATION`.
- Статус: `research`; это working draft, а не approved canonical document.
- Decision регистрации: `DEC-005`; решение утверждает регистрацию, но не оборудование, цены, модели, финансовые показатели или итоговый CAPEX.
- Change sets: `CHG-007`, `CHG-008`.
- Основания: Foundation v1.0 и Business Model Architecture v1.0.
- Состав: 124 рабочие позиции в четырёх модулях; цены и итоговый CAPEX отсутствуют.

### CAPEX Equipment Register v0.1

- Файл-источник: `docs-platform/working/capex-equipment-register.yaml`.
- Генерируемое представление: `docs-platform/working/capex-equipment-register.csv`.
- Registry ID: `DOC-CAPEX-EQUIPMENT-REGISTER`.
- Статус: `research`; это структурированное представление исходного working draft, а не утверждённый бюджет или закупочный перечень.
- Исходное создание: `DEC-007`, `CHG-011`, `CHG-012`, iteration `ITR-CAPEX-REGISTER-2026-08-01-01`. Модульное расширение: `DEC-008`, `CHG-013`, `CHG-014`, iteration `ITR-CAPEX-MODULAR-CONFIGURATOR-2026-08-01-01`. Первичная ценовая оценка: `DEC-009`, `CHG-015`, `CHG-016`, iteration `ITR-CAPEX-PRICE-RESEARCH-2026-08-02-01`. Коррекция пароконвектомата и внутренний web-конфигуратор: `DEC-010`, `CHG-017`, `CHG-018`, iteration `ITR-CAPEX-WEB-CONFIGURATOR-2026-08-03-01`.
- Зависимость от текстового источника: `DEP-CAPEX-SPEC-EQUIPMENT-REGISTER`. Цепочка будущей Financial Model теперь проходит Equipment Register → Modules → Point Formats → Configuration → Generated Equipment BOM.
- Покрытие: 124 исходные записи сохранены структурно идентично, добавлены 27 research-записей `CAPEX-05-001`—`CAPEX-05-027`; всего equipment `151`, mapped `151`, unmapped `0`. Из 47 самостоятельных закупочных записей разрешённой food-side области 39 получили research-оценку, 8 оставлены без цены; CAPEX-05 и итоговый CAPEX не оценивались.
- Research-сценарии на дату проверки: MINIMUM `2 026 758 RUB`, BASE `3 094 765 RUB`, SCALE_READY `4 344 021,46 RUB`. Это сумма охваченных позиций по исследовательским количествам, а не утверждённый бюджет объекта. `CAPEX-01-009` учитывается одной профессиональной единицей во всех трёх сценариях и только при наличии `MOD-PREP`; второй аппарат не добавляется автоматически в SCALE_READY.
- Модули: 12; форматы точек: 7; пустая шаблонная конфигурация: `CFG-TEMPLATE-001` (`FMT-CUSTOM`); её BOM содержит 0 строк и не является реальным объектом.
- Google Sheet: `03 — CAPEX — Реестр оснащения пилотного объекта`; одиннадцать листов: `Описание`, `Конфигуратор`, `Комплектация`, `Переопределения`, `Оснащение`, `Модули`, `Форматы точек`, `Состав форматов`, `Открытые параметры`, `Недостающие разделы`, `Справочники`; ценовые колонки добавлены в существующий файл, API readback passed.

## 6. Последние approved decisions и change sets

Approved decisions:

- `DEC-001` — локальная платформа и registry как структурированный источник; Google Docs/Sheets — производные представления.
- `DEC-002` — финансовая модель должна сравнивать `PURCHASE`, `RENT` и `MASTER_LEASE`; это не выбор конкретного помещения.
- `DEC-003` — регистрация Foundation v1.0 и семи неизменяемых PRP-блоков.
- `DEC-004` — регистрация Business Model Architecture v1.0 и десяти неизменяемых PRP-блоков.
- `DEC-005` — регистрация CAPEX — Equipment Specification v0.1 со статусом `research` без утверждения её содержания как закупки или бюджета.
- `DEC-006` — техническая публикация ровно трёх существующих документов в Google Drive без переутверждения или изменения их содержания и статусов.
- `DEC-007` — структурное преобразование 124 research-записей в CAPEX Equipment Register, публикация Sheet и обязательный lifecycle journal; не утверждает модели, цены, поставщиков, окончательные количества, новый состав или итоговый CAPEX.
- `DEC-008` — добавление 27 research-записей CAPEX-05, модульной архитектуры, семи профилей форматов, шаблонной конфигурации и обновление существующей Sheet; смысл первых 124 записей не изменён, реальные параметры, цены и итоговый CAPEX не утверждены.
- `DEC-009` — первичная research-оценка публичных цен 47 самостоятельных food-side позиций в трёх сценариях и обновление существующей Sheet; не утверждает модели, поставщиков, КП, окончательные количества или итоговый CAPEX.
- `DEC-010` — одна профессиональная единица `CAPEX-01-009` для `MOD-PREP` во всех research-сценариях, пересчёт по существующим единичным ценам, обновление существующей Sheet и подключение внутреннего конфигуратора к детерминированному canonical snapshot; не утверждает второй аппарат, новые цены, финальный CAPEX, финансовую модель или публичную инвесторскую версию.

Approved change sets:

- `CHG-002` — уточнён исследовательский статус сценария покупки.
- `CHG-003` — добавлены источник утверждения Foundation и `DEC-003`.
- `CHG-004` — зарегистрированы Foundation, семь principles и карта зависимостей.
- `CHG-005` — добавлены источник утверждения Business Model Architecture и `DEC-004`.
- `CHG-006` — зарегистрированы Business Model Architecture, десять principles и карты зависимостей.
- `CHG-007` — добавлены источник рабочей CAPEX-спецификации и `DEC-005`.
- `CHG-008` — зарегистрирован research-документ и его зависимости от Foundation и Business Model Architecture.
- `CHG-009` — добавлены источник задания на Google-публикацию и `DEC-006`.
- `CHG-010` — зарегистрированы Google file IDs трёх опубликованных документов без изменения их содержательных полей и статусов.
- `CHG-011` — добавлены первичный источник задания и approved `DEC-007`.
- `CHG-012` — зарегистрированы research-реестр, его Google Sheet ID, зависимости и расширенная область `DEC-007`.
- `CHG-013` — добавлены первичный источник модульного задания и approved `DEC-008`.
- `CHG-014` — зарегистрированы Modules, Point Formats, Configurations, Generated BOM и новая цепочка зависимостей; предыдущая прямая зависимость Register→Financial Model помечена `superseded`, история не удалена.
- `CHG-015` — зарегистрированы первичный источник задания на ценовое исследование и approved `DEC-009`.
- `CHG-016` — зарегистрированы research-документ ценовой оценки, 102 карточки-источника, зависимость от Equipment Register и техническое обновление существующей записи Register.
- `CHG-017` — добавлены первичный источник задания и approved `DEC-010`.
- `CHG-018` — применена точная коррекция `CAPEX-01-009` в Equipment Register, module-item rule и Price Research, пересчитаны research-суммы и обновлены технические registry metadata.

`example-change.yaml` имеет статус `proposed` и не должен применяться. Не применять существующие change sets повторно во время onboarding.

## 7. Состояние registry

Проверено 2026-08-03 командой `npm run registry:validate`: `OK`.

| Registry | Количество | Состояние |
|---|---:|---|
| facts | 3 | все `approved` |
| assumptions | 3 | все `research`; сценарии помещения |
| decisions | 10 | все `approved`; `DEC-010` ограничен одной единицей пароконвектомата, research-пересчётом, существующей Sheet и внутренним web-инструментом |
| metrics | 0 | финансовые метрики отсутствуют |
| documents | 15 | 5 `approved`, 1 `proposed`, 9 `research`, включая CAPEX source draft, Register, Modules, Point Formats, Configurations, Generated BOM и Price Research |
| sources | 115 | прежние источники, задания текущих iterations и 102 карточки цен; lifecycle status схемой не предусмотрен |
| principles | 17 | 7 Foundation и 10 Business Model Architecture, все `approved` |
| dependencies | 11 | 10 `approved`, 1 `superseded`; Price Research зависит от Equipment Register, а CAPEX dependency chain заканчивается Generated BOM→будущая Financial Model |

Approved facts: правильное название «Колобочная», базовая категория «еда в пути» и самостоятельное выращивание части растительных ингредиентов. Исторические, медийные и операционные утверждения сайта требуют первичной доказательной привязки для инвестиционного пакета.

## 8. Google Workspace integration

Интеграция восстановлена на проверенном компьютере в изолированном каталоге проекта. Используется только scope `drive.file`, project folder guard и явный выбор папки через Google Picker. Локальные `docs-platform/.secrets/`, `docs-platform/.runtime/` и `docs-platform/config/google.json` исключены из Git; их значения не переносить в handoff или changelog.

Проверенная папка: `Колобочная — Investment`. Авторизация выполнена аккаунтом проекта LaPro Crea во внутреннем браузере; системные браузеры и токены других проектов не использовались. `google:doctor` подтверждает credentials, token, доступность API, редактируемую папку и отсутствие secrets в Git.

2026-08-01 через `DEC-006`, `CHG-009` и `CHG-010` созданы три нативных Google Docs:

- `00 — Foundation` — registry `DOC-FOUNDATION`, статус `approved`;
- `01 — Business Model Architecture` — registry `DOC-BUSINESS-MODEL-ARCHITECTURE`, статус `approved`;
- `02 — CAPEX — Спецификация оснащения пилотного объекта` — registry `DOC-CAPEX-EQUIPMENT-SPECIFICATION`, статус `research`.

Все три Google file IDs зарегистрированы в `registry/documents.yaml`. Audit receipts находятся в `docs-platform/changelog/google-sync/`; они фиксируют SHA-256 локального источника, действие `create`, MIME type, время синхронизации и успешное повторное чтение. Publisher жёстко ограничен этими тремя registry IDs, отказывается выбирать дубликаты и не перезаписывает документ с ручными комментариями.

Через `DEC-007` и `CHG-012` опубликована отдельная нативная Google Sheet `03 — CAPEX — Реестр оснащения пилотного объекта`. Итерация `DEC-008`/`CHG-014` обновила тот же зарегистрированный файл до одиннадцати русских вкладок. Итерация `DEC-009`/`CHG-016` добавила в этот же файл research-колонки цен, поставщиков, ссылок, дат, наличия, статуса КП и уверенности. Итерация `DEC-010`/`CHG-018` обновила существующую Sheet после перехода `CAPEX-01-009` с двух единиц на одну. Новый файл и новые листы не создавались, три Google Docs не изменялись; folder guard и API readback прошли. Последний receipt: `docs-platform/changelog/google-sync/2026-08-03-DOC-CAPEX-EQUIPMENT-REGISTER-WEB-CONFIGURATOR.yaml`.

## 9. MCP integration

- Пакет: `docs-platform/mcp/`.
- Режим по умолчанию: `review`.
- Review публикует ровно девять инструментов чтения и preview; apply-инструменты не регистрируются.
- Write-mode требует точных `MCP_CAPABILITY_MODE=write` и `MCP_WRITE_ACK=I_UNDERSTAND` и предназначен только для отдельного локального обслуживающего сценария.
- Доступ ограничен зарегистрированными document IDs и project folder guard.
- Preview хранится локально 24 часа; audit лог редактирует секреты.

На проверенном компьютере отсутствуют `tunnel-client`, локальный tunnel profile и runtime API key. Tunnel к ChatGPT не подключён. Локальная Google-конфигурация восстановлена для CLI проекта, но MCP tunnel отдельно не настраивался.

## 10. Команды проверки

Для production-сборки сайта использовать современный Node.js. Текущие tests и `tsc --noEmit` 2026-08-02 дополнительно проверены на системном Node `18.18.2`; если `node_modules` отсутствует, выполнять `npm ci` в соответствующем package, не обновляя зависимости произвольно.

Сайт, из корня репозитория:

```bash
npm test
npm exec -- tsc --noEmit
npm run build
npm run capex:web:sync
npm run capex:web:check
npm run audit:content
npm run audit:links
npm run audit:seo
npm run audit:assets
npm run audit:routes
```

Docs platform:

```bash
cd docs-platform/app
npm test
npm exec -- tsc --noEmit
npm run registry:validate
npm run capex:register:validate
npm run capex:modules:list
npm run capex:formats:list
npm run capex:configuration:validate
npm run capex:configuration:preview -- CFG-TEMPLATE-001
npm run capex:configuration:build -- CFG-TEMPLATE-001
npm run capex:price:validate
npm run capex:price:preview
npm run capex:price:reverse:preview -- ../changelog/iteration-receipts/ITR-XXX.yaml --change-id CHG-ROLLBACK-XXX --decision DEC-ROLLBACK-XXX
npm run capex:configurator:reverse:preview -- ../changelog/iteration-receipts/ITR-XXX.yaml --change-id CHG-ROLLBACK-XXX --decision DEC-ROLLBACK-XXX
npm run capex:configurator:timeline
npm run capex:web:check
npm run capex:modular:reverse:preview -- ../changelog/iteration-receipts/ITR-XXX.yaml --change-id CHG-ROLLBACK-XXX --decision DEC-ROLLBACK-XXX
npm run capex:modular:reverse:prepare -- ../changelog/iteration-receipts/ITR-XXX.yaml --change-id CHG-ROLLBACK-XXX --decision DEC-ROLLBACK-XXX
npm run timeline:validate
npm run timeline:generate
npm run google:doctor
npm run google:folder:authorize
npm run google:publish:preview
npm run google:publish:apply -- --apply --decision DEC-006
npm run capex:sheet:preview
npm run capex:sheet:apply -- --apply --decision DEC-010
npm run google:capex:overrides:import -- --preview
npm run google:folder:inspect
npm run mcp:test
```

MCP отдельно:

```bash
cd docs-platform/mcp
npm test
npm run check
```

Результаты 2026-08-03:

- сайт: 10 маршрутов, семь CAPEX-форматов, три сценария, optional modules, поиск/фильтры, safe external links, mobile menu и form fallback — без failures, console errors, hydration errors или horizontal overflow;
- root TypeScript — OK;
- production build и prerender десяти маршрутов — OK; внутренний конфигуратор вынесен в отдельный lazy-loaded bundle;
- docs-platform: 87/87 тестов, включая register, price research, modular configurator, web snapshot, Sheet publisher, timeline, rollback, точные canonical checks и registry — OK;
- registry validation — OK;
- CAPEX register: `151/151/0`, при сохранённом source coverage `124/124`; JSON Schema и reference validation — OK;
- CAPEX configurator: 12 modules, 7 formats, 1 пустая template configuration, 153 module→item links — OK;
- CAPEX price research: 47 eligible, 39 priced, 8 unpriced, 23 `quote_required`; 99/99 уникальных публичных URL доступны на дату проверки — OK;
- Google Sheet: folder guard, native MIME, 11 русских листов, price columns, stable IDs, numeric types, сохранение ручной configurator-строки и API readback — OK;
- governed reverse preview для `CHG-018` восстанавливает исходный composite hash `1a79a014…`; apply запрещён без нового approved rollback decision;
- append-only timeline содержит четыре события текущей iteration и валидную hash chain; post-timeline snapshot SHA-256: `5815fd47a3015b36f699e9037bcefb63e44e768aef8230c7491ce01cee3364c6`;
- MCP: 21/21 тест, TypeScript — OK.

## 11. Правила содержательных изменений

1. Создать proposal с `iteration_id`, точным payload и SHA-256.
2. Получить approved decision; содержательные решения утверждает владелец проекта.
3. Подготовить approved change set, ссылающийся на тот же payload и SHA-256.
4. Выполнить preview и проверить diff, hashes, references и schema validation.
5. Apply обязан использовать утверждённый payload без пересказа или реконструкции.
6. Создать apply/Google receipts, выполнить readback и verification.
7. Добавить события `proposed`, `approved`, `applied`, `verified` в append-only `events.ndjson` и сгенерировать `TIMELINE.md`.
8. Для отката создать новый reverse change set, отдельное rollback decision и receipt; старые события не удалять, `git reset` не использовать.

Для ценовой итерации reverse preview восстанавливает исходный composite hash `60b263…` из отслеживаемого `changelog/rollback-payloads/`; registry reverse preview отдельно восстанавливает hash `60ce78…` до `CHG-016`. Reverse apply не выполняет Google-изменения молча: для Sheet требуется отдельный guarded preview/apply и только затем событие `rolled_back`.

Foundation v1.0, Business Model Architecture v1.0 и `src/content/approved-copy.ts` нельзя редактировать как обычный текст. Шаблоны и аналитические материалы не повышать до `approved` без решения владельца.

## 12. Текущая стадия работы

Репозиторий содержит рабочий инвесторский сайт, governed registry, guarded Google Workspace CLI, review-only MCP, Foundation v1.0, Business Model Architecture v1.0, исходную CAPEX — Equipment Specification v0.1 и структурированный CAPEX Equipment Register v0.1. Финансовая модель не создана: `metrics` пуст, числовых финансовых assumptions нет, а три текущих assumptions фиксируют только исследуемые сценарии помещения.

Business Model Architecture зафиксировала требования к будущим Financial Model, Investment Memorandum, Infrastructure Strategy и Network Development Model, но содержание этих производных документов в рамках BMA-задачи не создавалось.

Исходный CAPEX working draft по-прежнему без цен и моделей фиксирует четыре модуля пилотного объекта: заготовочный цех; торговую кухню, бар и выдачу; выращивание зелени и микрозелени; кассу, учёт и управление заказами. Остальные CAPEX-разделы только перечислены как несформированные.

Register сохраняет все 124 source records в стабильных IDs `CAPEX-01-001`—`CAPEX-04-003` и добавляет 27 research-записей `CAPEX-05-001`—`CAPEX-05-027` для гостевой зоны и обслуживания. Всего 151 запись, 185 открытых параметров и 27 исторически сохранённых missing-section записей; CAPEX-05 и связанная стойка/выдача переведены в статус `structured`, остальные остаются `not_started`. Ни 124, ни 151 не являются числом самостоятельных закупочных единиц. По `DEC-010` пароконвектомат `CAPEX-01-009` учитывается одной единицей во всех сценариях `MOD-PREP` и отсутствует у форматов без этого модуля.

Модульная архитектура разделяет единый реестр оборудования, 12 функциональных модулей, 7 профилей форматов и отдельные конфигурации объектов. Форматы не являются оборудованием. Итоговая комплектация строится с дедупликацией и правилами `once`/`sum`/`max`/`manual`; неизвестные количества остаются пустыми со статусом уточнения, а `included_in_parent` не считается отдельной закупкой.

Первичная ценовая итерация оценила 39 из 47 самостоятельных food-side позиций в сценариях MINIMUM, BASE и SCALE_READY; 8 позиций оставлены без цены, 23 помечены `quote_required`. Все 102 карточки цен и итоговые суммы имеют статус `research`. После `DEC-010` полные research-суммы этих 47 строк равны `2 026 758`, `3 094 765` и `4 344 021,46 RUB`; CAPEX-05, инженерные работы, ремонт, запуск, сырьё, оборотный капитал и несформированные разделы не оценивались.

Внутренний маршрут `/capex-configurator` получает данные только из generated snapshot канонической CAPEX-системы. Он позволяет переключать семь существующих форматов, модули и три сценария; показывает стоимость только оценённых позиций, ценовое покрытие, незавершённые обязательные модули, источники, графики, неучтённые категории, registry-документы и последние timeline events. Маршрут отсутствует в публичном меню и sitemap и имеет `robots: noindex, nofollow`. Это не публичная инвесторская версия и не финансовая модель.

Три локальных источника опубликованы как нативные Google Docs и прошли повторное чтение через Google Docs API. Foundation подтверждён по PRP-FND-001—007; Business Model Architecture — по PRP-BMA-001—010, шести таблицам и утверждённой формулировке с `фудкортах`; CAPEX — по CAPEX-01—04, разделу «Что ещё не сформировано», 124 позициям и отсутствию цен/итогового CAPEX.

## 13. Следующая рабочая задача

Следующий шаг — ручная проверка владельцем интерфейса `/capex-configurator`, строк существующей Google Sheet и research-допущений количества. Любые дальнейшие уточнения моделей, запрос КП, включение восьми неоценённых позиций, создание публичной инвесторской версии или финансовой модели выполнять только по отдельному заданию и через новый governed lifecycle; не считать текущие суммы итоговым CAPEX.

## 14. Известные открытые вопросы

- Нет финансовой модели, метрик, числовых assumptions, единиц, периодов и владельцев показателей.
- В CAPEX working draft остаются открытыми конкретные модели, производительность, часть количеств, инженерные параметры, сценарии комплектации и 27 ещё не описанных разделов.
- Второй пароконвектомат не входит автоматически ни в один сценарий; возможное расширение мощности требует отдельного решения и расчёта производительности.
- Без цены остаются холодильная и морозильная камеры, вытяжка, газовые грили такояки, UFO-грили, система 24 дозаторов, стойки для бутылок и закрываемое хранение алкоголя; они требуют параметров помещения, решения по формату или КП.
- У 23 food-side записей стоит `quote_required`: это включает восемь неоценённых строк и оценённые high-risk ориентиры, где публичная карточка не подтверждает точную конфигурацию проекта.
- У 104 записей `inclusion_status` остаётся `tbd`, у 126 не определено `quantity_base`; это сохранённая неопределённость, а не validation error.
- Не определены первичные источники для истории, медийных охватов, состава продукта и операционных данных.
- Не указан именованный владелец/утверждающий будущих решений, кроме общей роли `project owner`.
- Локальная Google-конфигурация восстановлена; MCP tunnel, runtime API key и tunnel profile по-прежнему не настроены.
- В `changes.log` и датированном changelog зафиксировано применение `CHG-GOOGLE-TEST-DOCUMENTS`, но одноимённого change set в `docs-platform/changes/` нет; запись связана с `DEC-002`, хотя это решение относится к сравнению сценариев помещения. Это audit gap, который нельзя исправлять задним числом в onboarding.
- `docs-platform/AUDIT.md` и `rules-project.md` содержат старый Windows-путь; перечисленные в аудите исходные `analysis/`, `Madia/` и `reference/` не входят в текущий Git clone.
- Машинный timeline начинается с итерации CAPEX Register; более ранняя legacy-история остаётся в `changes.log`, датированных journals, backups и receipts и не реконструируется по догадкам.

## 15. Git-состояние на дату проверки

- До текущего итогового commit в рабочем дереве находятся только связанные изменения текущей CAPEX/web-итерации и игнорируемые локальные audit screenshots.
- Ветка: `master`.
- Upstream на момент начала задачи: `origin/master`, ahead/behind `7/0`.
- Последний проверенный commit перед текущей итерацией: `8e01e675ebc739844202126e671620a7ad8cb7f9`, 2026-08-02, `docs(docs-platform): add preliminary CAPEX price research`.
- Текущая итерация создаёт внутренний маршрут и governed CAPEX-коррекцию; hash итогового commit нельзя корректно включить внутрь того же commit и следует брать из `git log -1` после фиксации.
- Push и deployment в рамках handoff не считаются выполненными без отдельного подтверждения.
- Дата проверки: 2026-08-03.
