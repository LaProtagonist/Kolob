# Kolob verification system

Эта система сокращает стоимость локальных итераций без снижения корректности: изменённые файлы детерминированно относятся к доменам, проверки запускаются в порядке от дешёвых к дорогим, а актуальные PASS receipts переиспользуются.

Главный принцип: **Targeted by default, full verification only at lifecycle boundaries.**

Правила находятся в этом каталоге, machine-readable карта — в `verification/domains.json`, исполняемые модули — в `scripts/verification/`. Локальный cache, подробные логи и selective screenshots хранятся в `.cache/verification/` и не коммитятся.

| Изменение | Каноническая команда |
|---|---|
| Financial Model | `npm run verify:financial` |
| Investor Summary и его parity | `npm run verify:investor` |
| Economics UI или другая текущая UI-область | `npm run verify:affected` |
| Governance | `npm run verify:governance` |
| Только affected visual pages | `npm run verify:visual` |
| Release/seal boundary | `npm run verify:release` |

Основные правила:

- после обычной правки использовать `npm run verify:affected`;
- не заменять orchestrator ручной последовательностью из множества тестов;
- не запускать автоматически root `npm test`, production build, prerender или screenshots всех страниц;
- не читать подробные PASS logs и не открывать screenshots без причины;
- Google API/readback и deployment не входят в обычную локальную verification;
- `npm run verify:release` предназначен только для lifecycle/release boundary.

Подробнее: [testing policy](TESTING_POLICY.md), [domain map](DOMAIN_MAP.md), [levels](VERIFICATION_LEVELS.md), [visual QA](VISUAL_QA.md), [cache](CACHE_POLICY.md), [release](RELEASE_POLICY.md), [agent workflow](AGENT_WORKFLOW.md), [command audit](command-reference.md).
