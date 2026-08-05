AUTO-GENERATED — DO NOT EDIT MANUALLY

# Codex handoff — Колобочная

## 1. Назначение проекта

Проект ведёт локальные канонические инвестиционные документы и их governance-историю. Бизнес-содержание меняется только через отдельно утверждённые решения; этот handoff является машинной проекцией, а не источником истины.

## 2. Текущая ветка и governed iteration

- Branch: `master`.
- Latest closed iteration: `ITR-GOVERNANCE-HISTORY-V2-2026-08-05-01`.
- Latest iteration tag: `iteration/ITR-GOVERNANCE-HISTORY-V2-2026-08-05-01`.
- Latest content commit: `bcba7114dc62f6fbc8669a42dbbba49b7f8be77f`.
- Текущий Git HEAD намеренно не записывается: его вычисляет `npm run project:onboard`.

## 3. Timeline head

- Event: `EVT-ITR-GOVERNANCE-HISTORY-V2-2026-08-05-01-COMMITTED`.
- Hash: `020f084e89321eab6a9db6afa14692aac6513c2f3cc72e993253e8b108d4c206`.
- generated_from_event_hash: `020f084e89321eab6a9db6afa14692aac6513c2f3cc72e993253e8b108d4c206`.

## 4. Канонические документы

| Document | Status | Local path | SHA-256 |
|---|---|---|---|
| DOC-AGENTS | approved | `docs-platform/AGENTS.md` | `a232bccb51c4e584f02f313727745acdfa406b11dea5aa05b37daeb6b988bfdf` |
| DOC-AUDIT | approved | `docs-platform/AUDIT.md` | `f43cb183f4c025ba74d4f77c2a498cb0ad07e7b0622e47f38afd6212173689e7` |
| DOC-BUSINESS-MODEL-ARCHITECTURE | approved | `docs-platform/01-business-model-architecture.md` | `1584d836a159f6e3c5859ccf539830248b2cd782ed2c7005c5963ac8730c556b` |
| DOC-CAPEX-CONFIGURATIONS | research | `docs-platform/working/capex-configurations.yaml` | `3810fa84efa969d8d95e2f0b0b49ede044b854d9be21ac92f5787d9ff8369f3c` |
| DOC-CAPEX-EQUIPMENT-REGISTER | research | `docs-platform/working/capex-equipment-register.yaml` | `e5e835ecae0d0d433afd24cff8923026097d115d87c234f1af475c463bb8f6e0` |
| DOC-CAPEX-EQUIPMENT-SPECIFICATION | research | `docs-platform/working/capex-equipment-specification.md` | `2157364e09699173fecfbfe861edf4e6fac85a0437e23aebe100caebeab599d6` |
| DOC-CAPEX-GENERATED-EQUIPMENT-BOM | research | `docs-platform/working/configurations/CFG-PILOT-001/equipment-bom.yaml` | `671375dd8ac2a2387a9afa71104e08df21704493c67810f7d313d29ae0e38035` |
| DOC-CAPEX-MODULES | research | `docs-platform/working/capex-modules.yaml` | `2fb31d90b852a5aaae6500d99412c7fabba0bbe9187f08106e3f37c7a52ae33a` |
| DOC-CAPEX-POINT-FORMATS | research | `docs-platform/working/capex-point-formats.yaml` | `4b6d5a8806f696f499dbbab8fa061020c7ba77b670eb2a1f7d3ccdcc78b2e523` |
| DOC-CAPEX-PRICE-RESEARCH | research | `docs-platform/working/capex-price-research.yaml` | `96d2ba3e55b02843d05ebeffc6e8c3e3c400e82392a5d95b16cd321e4d5e5b3d` |
| DOC-FOUNDATION | approved | `docs-platform/00-foundation.md` | `5b4d457184c055ba11f8c4d05cc263139d2eb4f623981bcdc198c0114a50c0bb` |
| DOC-INVESTMENT-MEMO | proposed | `docs-platform/templates/investment-memorandum.md` | `464e46d307aaa98e57cab3a098cd639e212d32b51f82a06688de228f0e7fb4cd` |
| DOC-INVESTOR-START-MODEL | research | `docs-platform/working/investor-start-model.yaml` | `3bf792a1a0c0dfd21e7c87399025f51effde1f08c910c987003cd341472494b1` |
| DOC-PILOT-CAPEX-ASSUMPTIONS | research | `docs-platform/working/pilot-capex-assumptions.yaml` | `25e11d4db20050b3a95cab40797ef0a29e56fad93c73d33d4a39415a8071d4ac` |
| DOC-README | approved | `docs-platform/README.md` | `04e947f296a158a1c37ceb8d4c959d1f4e31cf609d16c99bee2d3c3b79b824ab` |

## 5. Текущая рабочая тема

Governance History v2 and portable Codex context

## 6. Decisions и change sets

- Open decisions: none.
- Open change sets: `CHG-EXAMPLE-001`.

## 7. Открытые вопросы

- Archive pending review artifacts in durable storage before treating visual verification as portable.
- Create deployment receipts when the next governed deployment is performed.
- Decide whether malformed superseded legacy YAML evidence should receive a separate correction event.

## 8. Google / MCP / deployment

- Google: `{"configured":true,"historical_receipts":8,"receipts_with_machine_readback_hash":5,"live_drift_check":"not_run_by_context_build"}`.
- MCP: `{"implementation_present":true,"canonical_access":"registry_document_ids_only","live_status":"not_probed_by_context_build"}`.
- Deployment: `{"status":"not_configured","receipts":0,"production_url":null}`.

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
