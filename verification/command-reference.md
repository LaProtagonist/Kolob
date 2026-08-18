# Existing verification command audit

Оценки стоимости получены из структуры scripts и исторических verification receipts; отдельный старый full suite ради benchmark не запускался. Runner сохраняет реальные durations по мере обычного использования.

| Существующая команда / script | Что проверяет | Домен | Оценка | Browser | Production build | Cacheable |
|---|---|---|---:|---|---|---|
| root `npm test` | snapshots + Revenue + all-page browser + весь docs-platform suite | cross-cutting | минуты, очень дорого | да | нет, требует готовый `dist` | только как full boundary, не default |
| `npm run build` | validators, TypeScript, Vite build, prerender всех routes и review screenshots | site/deployment | минуты | да | да | release receipt only |
| `npm run build:spa` | canonical snapshot checks, TypeScript, Vite bundle | site/data | десятки секунд | нет | да (SPA) | да по build inputs |
| `npm run prerender` | 13 routes, desktop/mobile screenshots, review HTML | deployment | 1–3 минуты | да | требует `dist` | только release hash |
| `node scripts/test-site.cjs` | all routes, CAPEX/Launch/Revenue interactions, desktop/mobile layout | site + 3 UI domains | 1–3 минуты | да | использует `dist`, сам не build | слишком широкий для мелкой правки |
| `node scripts/verify-site.cjs` | 8 routes × 4 viewports, screenshots, menu/form | site | 1–3 минуты | да | нет, нужен server | только полный visual audit |
| `scripts/test-economics-data.test.ts` | Financial/Investor parity, scenarios/P&L/route metadata | economics | секунды | нет | нет | да |
| `scripts/test-economics-route.cjs` | Economics DOM/scenarios/overflow + 2 screenshots | economics | десятки секунд | да | нет, нужен server | selective visual only |
| `scripts/test-launch-budget-financials.test.ts` | Launch ↔ Financial projection reconciliation | launch | секунды | нет | нет | да |
| `npm --prefix docs-platform/app test` | каждый `app/test/*.test.ts` отдельным process | all platform | минуты | нет | нет | только full boundary |
| `financial:model:validate/check` | schema/formula source и current projection | financial | секунды | нет | нет | да |
| `investor:summary:validate/check` | summary schema/current projection/parity | investor-summary | секунды | нет | нет | да |
| `revenue:model:validate`, `revenue:web:check` | canonical Revenue schema и web snapshot | revenue | секунды | нет | нет | да |
| `capex:web:check` | canonical CAPEX → web snapshot | capex | секунды | нет | нет | да |
| `investor:start:validate` | Investor Start model/current data | launch | секунды | нет | нет | да |
| `registry:validate`, `timeline:validate`, `context:validate` | narrow governance projections/invariants | governance | секунды | нет | нет | да до release gate |
| `history:validate`, `artifact:validate` | immutable history/tags/snapshots и artifact manifests | governance | секунды–десятки | нет | нет | да до release boundary |
| `governance:validate` | combined lifecycle consistency | governance | десятки секунд | нет | нет | да до mandatory release rerun |
| `financial:sheet:check`, `investor:summary:sheet:check` | deterministic local Google Sheets payload contract | financial / investor / google | секунды | нет | нет | да; live readback не вызывается |
| `capex:register:validate`, `capex:price:validate`, `capex:configuration:validate` | CAPEX schemas, references и configuration/BOM rules | capex | секунды | нет | нет | да |
| `build:reproduce:sealed` | clean sealed checkout/install/build hash proof | deployment | очень дорого | да через prerender | да | только applicable sealed boundary |
| `deployment:drift:check` | local/receipt drift classification | deployment | секунды | нет | нет | да; no deployment |
| `audit:content/links/seo/assets/routes` | built-content/static HTML audits | site/deployment | секунды–десятки | нет | обычно требует `dist` | да по dist hash |
| `npm --prefix docs-platform/mcp test` / `mcp:test` | MCP service contract and guards | google-publisher | секунды–десятки | нет | нет | да; без live Google API |
| `google:*`, `*:sheet:preview/apply/readback` | live Google operations | google-publisher | external/variable | нет | нет | не часть local verification |

## docs-platform test inventory

| Test files | Domain | Cost / external behavior |
|---|---|---|
| `financial-model.test.ts` | financial | targeted medium; local deterministic |
| `investor-financial-summary.test.ts` | investor-summary | targeted fast/medium; local |
| `revenue-model.test.ts` | revenue-model | targeted fast/medium; local |
| `investor-start-model.test.ts` | launch-budget | integration medium; local |
| `capex-content-state`, `capex-equipment-*`, `capex-modular-configurator`, `capex-price-research`, `capex-remaining-prices`, `capex-web-configurator` | capex | domain medium; local |
| `capex-sheet-publisher`, `financial-sheet-publisher`, `investor-financial-summary-publisher`, `google`, `google-publisher` | google-publisher | pure local unit/mocked contracts; no live API |
| `governance-history-v2`, `governance-rollback`, `governance-supersede`, `governance-timeline`, `registry` | governance | medium; some isolated temporary mutation/restore inside tests |
| `deployment-state` | deployment | fast/medium; local state logic only |
| `foundation`, `business-model-architecture`, `capex-equipment-specification` | documentation/governance/CAPEX provenance | local historical invariants |

Новые `verify:*` aliases не удаляют эти scripts. `verification/domains.json` выбирает их адресно и ставит дешёвые schema/static checks перед unit/browser/build.

Untracked manual review files в `output/review/` не являются canonical test definitions, не входят в domain inputs и не были изменены. Versioned screenshot paths представлены `scripts/test-economics-route.cjs`, `scripts/test-site.cjs`, `scripts/verify-site.cjs` и `scripts/prerender-dist.cjs`.

Для source-only TypeScript docs-platform используется `verification/tsconfig.platform.json`: основной app `tsconfig.json` намеренно охватывает ещё tests/MCP и через cross-project test imports втягивает browser JSON modules, поэтому не является дешёвым package-source check.
