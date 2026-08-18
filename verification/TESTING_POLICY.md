# Testing policy

## Default rule

По умолчанию тестируется только затронутая область. После локальной правки агент:

1. определяет affected domains через `npm run verify:affected`;
2. выполняет минимальный plan в порядке static → type → unit → integration → browser → screenshot;
3. при PASS продолжает работу;
4. не повторяет checks, если их domain fingerprint не изменился.

Нельзя автоматически превращать маленькую правку в цепочку `npm test` → production build → prerender → screenshots всех страниц → governance validation → повторный full suite.

## Когда допустим release level

`npm run verify:release` выполняется только:

- перед content commit/seal;
- перед deployment;
- по явному запросу владельца;
- после фундаментального изменения build, test или governance infrastructure.

Release orchestration проверяет receipts, запускает stale/missing domains и затем всегда выполняет применимые release gates. Совпадающий current PASS разрешено reuse вместо физического повтора domain test.

## Scope rules

- Documentation-only: documentation/static и diff check; governance только для governance docs. Financial, CAPEX, browser и screenshots запрещены без иной зависимости.
- Pure UI: site TypeScript, page-specific data/route check, browser при low/high impact, screenshot только при high impact. Unrelated financial, CAPEX, Google и governance checks не запускаются.
- Financial: Financial Model schema/projection/formulas/determinism, затем Investor Summary, Economics и Launch parity. Browser и screenshots не нужны при изменении только значений/формул.
- Governance: registry/timeline/context/governance checks; site/browser не запускаются без browser-visible change.
- Google: локальные pure unit tests допустимы при изменении publisher code. Live API, publish и readback — только в явно утверждённом publication workflow.

## Fail-fast

При failure текущий pipeline останавливается, краткая ошибка выводится в консоль, полный stdout/stderr остаётся в `.cache/verification/logs/`. Downstream expensive checks, browser, screenshot и build после upstream failure не запускаются.

## Existing commands

Старые команды не удаляются и остаются для ручной диагностики. Канонический путь агентов — `verify:*`. Полный `npm test` не является default verification.
