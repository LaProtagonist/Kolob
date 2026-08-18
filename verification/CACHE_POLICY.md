# Verification cache policy

Cache находится в `.cache/verification/`, игнорируется Git и не является governance artifact.

Структура:

- `state.json` — PASS/FAIL receipts;
- `last-run.json` — компактный machine-readable отчёт;
- `last-release.json` — последний release report;
- `logs/` — полный stdout/stderr отдельных checks;
- `screenshots/` — selective high-impact review artifacts;
- `visual-last.json` — компактный browser report.

Domain fingerprint включает:

- все files домена, совпавшие с machine map;
- relevant upstream domain files;
- test files и определения выбранных checks;
- verification scripts/config и map/cache version;
- root/app lockfiles;
- Node major, OS и architecture;
- verification level/profile.

PASS reuse разрешён только при полном совпадении fingerprint. Никогда не reuse FAIL, другой profile/level, изменившиеся tests, dependency/lock hash, runner/config hash или environment fingerprint. Повреждённый cache трактуется как пустой.

Visual receipt использует те же component/CSS/content/upstream inputs, visual config, viewport config и runner version. Изменение любого из них инвалидирует screenshot reuse.

`npm run verify:status` пересчитывает current targeted fingerprints и показывает `CURRENT PASS`, `STALE` или `MISSING`. `npm run verify:invalidate` безопасно удаляет только точный каталог `.cache/verification/`.
