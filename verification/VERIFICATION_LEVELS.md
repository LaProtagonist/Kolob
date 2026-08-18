# Verification levels

## Level 0 — STATIC / FAST

Цель — секунды и ранний отказ. Сюда входят `git diff --check`, deterministic config/document assertions, schema validator затронутого домена и package TypeScript там, где он является самой дешёвой корректной проверкой.

Команда: `npm run verify:fast`.

## Level 1 — TARGETED

Проверяет непосредственно изменённый домен. Примеры:

- Financial Model: schema, current projection, formulas и determinism;
- Economics: data parity, TypeScript и route/browser только при visual impact;
- Revenue: canonical model/web snapshot либо Revenue route для UI change;
- Launch Budget: canonical start model и расчёты;
- Governance: registry, timeline, context и consistency.

Это default level команды `npm run verify:affected`.

## Level 2 — INTEGRATION

Используется после логического блока или для пересечения доменов. Downstream closure выполняет только dependency/parity checks, а не полный targeted suite каждой зависимой области.

Пример: Financial Model → Investor Summary → Economics → Launch Budget. CAPEX visual, Revenue visual и unrelated governance suite в этот plan не входят.

Команда: `npm run verify:affected -- --level integration`.

## Level 3 — RELEASE

Release не означает слепой повтор всех тестов. Orchestrator:

1. вычисляет current fingerprints release-required domains;
2. reuse текущие PASS receipts;
3. запускает stale/missing domain checks;
4. после них непосредственно выполняет обязательные release gates.

Команда: `npm run verify:release`. `--sealed` дополнительно включает sealed reproducibility gate, когда он применим.
