# Functional domain map

Machine-readable источник истины: `verification/domains.json`. Паттерны могут относить один файл к нескольким доменам; это намеренно для shared boundaries. Downstream closure применяется только по явно записанным зависимостям.

| Домен | Основные inputs | Upstream / downstream | Targeted и parity | Visual / release |
|---|---|---|---|---|
| `financial` | `financial-model.yaml`, financial engine, schemas, projection, tests | upstream CAPEX/Revenue; downstream Investor/Economics/Launch | validate, projection check, financial unit/formula suite | none by default; required |
| `investor-summary` | summary YAML/projection, summary engine/schemas/tests | upstream Financial; downstream Economics/Launch | validate, projection, summary parity | none; required |
| `capex` | CAPEX YAML/BOM, capex engine/schemas/tests, configurator projection/UI | downstream Financial | web snapshot and CAPEX domain tests | conditional `/capex-configurator`; required |
| `revenue-model` | Revenue YAML, schema/engine/test, web data projection | downstream Revenue UI and Financial | schema and deterministic model tests | none; required |
| `revenue-ui` | `RevenueModel.tsx/.css`, runtime projection | upstream Revenue Model | TypeScript and web snapshot/route | conditional `/revenue-model`; required |
| `launch-budget` | Investor Start YAML/engine, Launch component/libs/tests | upstream Financial/CAPEX | start schema, launch calculations, model integration | conditional `/launch-budget`; required |
| `economics-ui` | Economics component/CSS/content/lib/tests | upstream Financial/Investor Summary | Economics data parity and TypeScript | conditional `/economics`; required |
| `site-core` | app shell, shared styles/content/UI, Vite config | no business downstream | site TypeScript | conditional `/`; required |
| `governance` | governance code, registry, changes, changelog, context, schemas/tests | isolated from site visual | registry/timeline/context/consistency; integration tests at level 2 | none; required |
| `google-publisher` | local Google/MCP code and publisher tests | external action is separate | pure local unit tests only | no visual; not regular release-required |
| `deployment` | prerender/server/sealed-build/deployment state | upstream site-core | local deployment-state unit test | production build only as release gate |
| `documentation` | Markdown policies and docs | isolated unless another pattern also matches | final newline/NUL/diff checks | none; required |
| `verification` | this catalog, orchestrator scripts/tests, npm aliases | runner changes invalidate every receipt hash | config and orchestrator unit tests | none; required |

## Closure examples

- `docs-platform/working/financial-model.yaml` → `financial`, then parity profiles for `investor-summary`, `economics-ui`, `launch-budget`; visual impact `none`.
- `src/components/Economics.css` → only direct `economics-ui`, impact `high`; Revenue, Launch, CAPEX, governance and production build остаются skipped.
- `docs-platform/app/src/governance/timeline.ts` → only `governance`.
- `docs-platform/app/test/financial-model.test.ts` → only `financial`; test-definition hash invalidates that domain, without downstream or visual checks.
- lockfile → dependency fingerprint всех соответствующих Node domains меняется; classifier консервативно планирует затронутые local domains.

`upstream` участвует в dependency hash домена. `downstream` определяет execution closure. Тестовый файл и runner/config входят в hash даже тогда, когда source data не менялись.
