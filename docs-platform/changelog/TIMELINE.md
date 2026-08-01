# Хронологический журнал governed iterations

> Этот файл генерируется из `events.ndjson` и не редактируется вручную. История до внедрения NDJSON остаётся в `changes.log`, датированных journal-файлах, backups и sync receipts; отсутствующие legacy-поля не восстанавливаются по догадкам.

| UTC timestamp | Event | Iteration | Status | Action | Decision | Change set | Validation | Summary |
|---|---|---|---|---|---|---|---|---|
| 2026-08-01T17:59:17.257Z | EVT-ITR-CAPEX-REGISTER-2026-08-01-01-001 | ITR-CAPEX-REGISTER-2026-08-01-01 | proposed | proposal_recorded | DEC-007 | CHG-012 | pending | Proposal зафиксировал перенос 124 существующих research-записей и явные границы: без новых позиций, моделей, цен, поставщиков и итогового CAPEX. |
| 2026-08-01T17:59:17.258Z | EVT-ITR-CAPEX-REGISTER-2026-08-01-01-002 | ITR-CAPEX-REGISTER-2026-08-01-01 | approved | decision_approved | DEC-007 | CHG-012 | pending | DEC-007 утвердил структурно идентичный payload и обязательный lifecycle journal; содержание оборудования и бюджет не утверждены. |
| 2026-08-01T17:59:17.259Z | EVT-ITR-CAPEX-REGISTER-2026-08-01-01-003 | ITR-CAPEX-REGISTER-2026-08-01-01 | applied | payload_and_google_sheet_applied | DEC-007 | CHG-012 | passed | Approved YAML/CSV применены; после прерванного первого create повторный preview нашёл единственный Sheet и безопасно завершил update без дубликата. |
| 2026-08-01T17:59:17.260Z | EVT-ITR-CAPEX-REGISTER-2026-08-01-01-004 | ITR-CAPEX-REGISTER-2026-08-01-01 | verified | readback_validation_and_reverse_preview_verified | DEC-007 | CHG-012 | passed | 124/124/0, schemas, references, tests, Google API readback, source hash and governed reverse preview проверены; reverse preview восстанавливает исходный registry hash. |

## Проверка цепочки

- Событий: 4.
- Последний event hash: `8cd4c79d17fc628ebc8a71da5be7e8ddb2313cdd0c9642027b0c0c174b7e962a`.
- Полная машинная запись, approved payload SHA-256, before/after hashes и rollback reference находятся в `events.ndjson`.
