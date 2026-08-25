AUTO-GENERATED — DO NOT EDIT MANUALLY

# Codex handoff — Колобочная

## 1. Назначение проекта

Проект ведёт локальные канонические инвестиционные документы и их governance-историю. Бизнес-содержание меняется только через отдельно утверждённые решения; этот handoff является машинной проекцией, а не источником истины.

## 2. Текущая ветка и governed iteration

- Branch: `feat/investor-terminal-v2`.
- Latest closed iteration: `ITR-FINANCIAL-PREPARATION-PROVENANCE-2026-08-25-01`.
- Latest iteration tag: `iteration/ITR-FINANCIAL-PREPARATION-PROVENANCE-2026-08-25-01`.
- Latest content commit: `98150db139d58c47e0fb437e73213a9c0a37b556`.
- Текущий Git HEAD намеренно не записывается: его вычисляет `npm run project:onboard`.

## 3. Timeline head

- Event: `EVT-ITR-FINANCIAL-PREPARATION-PROVENANCE-2026-08-25-01-COMMITTED`.
- Hash: `c9c3181307d288284f905167090d7e2ffb872fc133c5481a236d4152080a94e2`.
- generated_from_event_hash: `c9c3181307d288284f905167090d7e2ffb872fc133c5481a236d4152080a94e2`.

## 4. Канонические документы

| Document | Status | Local path | SHA-256 |
|---|---|---|---|
| DOC-AGENTS | approved | `docs-platform/AGENTS.md` | `8589a2fb1075f53a4f114ff945a22465068996eab577bfd2e073a6dc66e61bba` |
| DOC-AUDIT | approved | `docs-platform/AUDIT.md` | `f43cb183f4c025ba74d4f77c2a498cb0ad07e7b0622e47f38afd6212173689e7` |
| DOC-BUSINESS-MODEL-ARCHITECTURE | approved | `docs-platform/01-business-model-architecture.md` | `1584d836a159f6e3c5859ccf539830248b2cd782ed2c7005c5963ac8730c556b` |
| DOC-CAPEX-CONFIGURATIONS | research | `docs-platform/working/capex-configurations.yaml` | `3810fa84efa969d8d95e2f0b0b49ede044b854d9be21ac92f5787d9ff8369f3c` |
| DOC-CAPEX-EQUIPMENT-REGISTER | research | `docs-platform/working/capex-equipment-register.yaml` | `c8853fe61ad8407ab96d0fbafb79702853842f970cbf699b6c2138b23f32c7aa` |
| DOC-CAPEX-EQUIPMENT-SPECIFICATION | research | `docs-platform/working/capex-equipment-specification.md` | `2157364e09699173fecfbfe861edf4e6fac85a0437e23aebe100caebeab599d6` |
| DOC-CAPEX-GENERATED-EQUIPMENT-BOM | research | `docs-platform/working/configurations/CFG-PILOT-001/equipment-bom.yaml` | `d001d531247e1c64820a6bd00df1db755908d483358f5f677b3ca6acb6d8fa4a` |
| DOC-CAPEX-MODULES | research | `docs-platform/working/capex-modules.yaml` | `2fb31d90b852a5aaae6500d99412c7fabba0bbe9187f08106e3f37c7a52ae33a` |
| DOC-CAPEX-POINT-FORMATS | research | `docs-platform/working/capex-point-formats.yaml` | `4b6d5a8806f696f499dbbab8fa061020c7ba77b670eb2a1f7d3ccdcc78b2e523` |
| DOC-CAPEX-PRICE-RESEARCH | research | `docs-platform/working/capex-price-research.yaml` | `b2b752f1822db8b529d58d822b83b32d44bcba9a0110ae35062d3b561f08249d` |
| DOC-FINANCIAL-MODEL | research | `docs-platform/working/financial-model.yaml` | `6a76990d3635e62ac633610754415d401edba989f1a49a463091e2cece1e329b` |
| DOC-FOUNDATION | approved | `docs-platform/00-foundation.md` | `5b4d457184c055ba11f8c4d05cc263139d2eb4f623981bcdc198c0114a50c0bb` |
| DOC-INVESTMENT-MEMO | proposed | `docs-platform/templates/investment-memorandum.md` | `464e46d307aaa98e57cab3a098cd639e212d32b51f82a06688de228f0e7fb4cd` |
| DOC-INVESTOR-FINANCIAL-SUMMARY | research | `docs-platform/working/investor-financial-summary.yaml` | `008aaa644847e09c4ae89199143e219f37eeb4e8828fd26091771965d540e212` |
| DOC-INVESTOR-START-MODEL | research | `docs-platform/working/investor-start-model.yaml` | `b81a6c4e8988a4532c9ba2749d492b3f96e37d83af822396afc82930244b2985` |
| DOC-PILOT-CAPEX-ASSUMPTIONS | research | `docs-platform/working/pilot-capex-assumptions.yaml` | `25e11d4db20050b3a95cab40797ef0a29e56fad93c73d33d4a39415a8071d4ac` |
| DOC-README | approved | `docs-platform/README.md` | `04e947f296a158a1c37ceb8d4c959d1f4e31cf609d16c99bee2d3c3b79b824ab` |
| DOC-REVENUE-MODEL | research | `docs-platform/working/revenue-model.yaml` | `ab68399813d62d861522752c8e94df9cfc5d5a48e9b7723c60f2c968c4cba721` |

## 5. Текущая рабочая тема

Financial Model preparation provenance reconciliation

## 6. Decisions и change sets

- Open decisions: none.
- Open change sets: `CHG-EXAMPLE-001`.

## 7. Открытые вопросы

- Archive pending review artifacts in durable storage before treating visual verification as portable.
- Create deployment receipts when the next governed deployment is performed.
- Decide whether malformed superseded legacy YAML evidence should receive a separate correction event.

## 8. Google / MCP / deployment

- Google: `{"configured":false,"historical_receipts":12,"receipts_with_machine_readback_hash":9,"live_drift_check":"not_run_by_context_build"}`.
- MCP: `{"implementation_present":true,"canonical_access":"registry_document_ids_only","live_status":"not_probed_by_context_build"}`.
- Deployment: `{"status":"receipts_present","receipts":5,"production_url":null}`.

## 9. Команды проверки

```bash
npm run project:onboard
npm run context:validate
npm run timeline:validate
npm run registry:validate
npm test
npx tsc --noEmit
git diff --check
```

## 10. Следующая задача

Select the next task through a new governed proposal; no business task is pre-authorized.
