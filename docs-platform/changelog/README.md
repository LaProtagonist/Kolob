# Журнал изменений

Существующая история сохраняется без переписывания:

- `changes.log` — краткий журнал применённых change sets;
- датированные `*-CHG-*.md` — человекочитаемые apply journals;
- `backups/` — снимки registry до изменения;
- `change-receipts/` — before/after payload, hashes и обратимые операции;
- `google-sync/` — Google sync/readback receipts;
- `iteration-receipts/` и `payloads/` — applied iteration receipts и неизменяемые approved payload snapshots.

Начиная с итерации `ITR-CAPEX-REGISTER-2026-08-01-01`, единый машинный хронологический индекс хранится в `events.ndjson`. Файл только дополняется; прошлые строки нельзя редактировать или удалять. Каждое событие содержит hash предыдущего события и собственный SHA-256, поэтому изменение старой строки обнаруживается validation.

`TIMELINE.md` генерируется командой `npm run timeline:generate` из `events.ndjson` и не редактируется вручную. Legacy-история остаётся в прежних файлах; отсутствующие у неё поля не восстанавливаются по догадкам.

Rollback выполняется только новым approved reverse change set. Команда `change:reverse:preview` строит обратные операции из receipt и проверяет восстановление исходного registry hash. Применение reverse change не удаляет исходный change set, receipt или события.
