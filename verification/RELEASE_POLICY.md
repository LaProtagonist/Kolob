# Release policy

`npm run verify:release` используется непосредственно перед seal/deployment, а не после обычной правки.

## Domain receipts

Orchestrator вычисляет current targeted hash каждого `releaseRequired` domain. Current PASS reuse; stale/missing domain запускается один раз. Google publisher исключён из обычного release, если отдельный publication workflow не входит в scope.

## Mandatory gates

После успешных domain checks непосредственно запускаются и не берутся из cache:

1. diff/worktree check;
2. registry validation;
3. timeline validation;
4. generated context validation;
5. governance consistency;
6. site TypeScript integration;
7. production build/prerender.

`build:reproduce:sealed` выполняется с `npm run verify:release -- --sealed`, когда проверяется уже применимый sealed state. Gate помечается `NOT_APPLICABLE` до этого момента.

Если domain или gate падает, release останавливается и сообщает `RELEASE BLOCKED`; дорогие последующие gates не запускаются. Production deployment никогда не выполняется этой командой.

Для просмотра будущего plan без выполнения checks/build используется `npm run verify:release -- --dry-run`. Dry-run не создаёт PASS evidence.
