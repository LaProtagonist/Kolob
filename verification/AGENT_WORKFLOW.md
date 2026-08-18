# Agent workflow

## Перед реализацией

- выполнить project onboarding и проверить worktree/governance scope;
- не запускать полный suite ради аудита;
- использовать `verification/domains.json` как источник classification, а не вручную собирать длинный test list.

## Во время работы

- после маленькой правки: `npm run verify:affected`;
- после логического блока: `npm run verify:affected -- --level integration`;
- перед visual review: `npm run verify:visual` только если affected impact low/high;
- конкретная страница: `npm run verify:visual -- economics` (или `revenue`, `launch`, `capex`, `site`);
- посмотреть cache: `npm run verify:status`;
- перед commit/seal: `npm run verify:release`.

Агенту запрещено самостоятельно заменять orchestrator последовательностью из десятков команд, если orchestrator покрывает задачу. PASS logs не перечитываются без причины; `last-run.json` является первым machine report для диагностики результата.

## Overrides and diagnostics

- `npm run verify:affected -- --no-cache` — осознанный повтор current plan;
- `npm run verify:affected -- --files path/a,path/b --dry-run` — synthetic classification/plan без тестов;
- `npm run verify:affected -- --base <git-ref>` — явная Git base;
- `npm run verify:release -- --dry-run` — release plan без domain/gate execution;
- старые full/test/browser команды — только для ручного debug, major audit или явного запроса владельца.

Google API, live readback, production smoke и deployment находятся вне обычной локальной verification и требуют отдельного разрешённого workflow.
