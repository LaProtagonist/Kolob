# Правила работы с инвестиционными документами

> С 30.09.2026 действуют короткие правила из корневого `AGENTS.md`. Пункты ниже о предложениях, решениях, квитанциях, «печати» итераций и обязательной команде `project:onboard` сохранены как описание архива решений и условием работы больше не являются. Пункты о честности данных (1, 4, 10) остаются в силе.

1. Не выдавать гипотезы, исследования и черновики за утверждённые факты.
2. Не менять утверждённые тексты без отдельного решения в `registry/decisions.yaml`.
3. Каждое изменение должно иметь `decision_id`; статусы: `idea`, `research`, `proposed`, `approved`, `superseded`, `rejected`.
4. Не придумывать финансовые показатели. Каждая цифра имеет источник или явно помечена как `assumption`.
5. Связанные изменения применяются ко всем затронутым документам и ссылкам в registry.
6. Перед изменением внешних Google-документов сформировать preview и diff; применять только проверенный набор изменений.
7. Не удалять ручные комментарии в Google Docs и не заменять формулы в Google Sheets статическими числами.
8. Google Docs не являются единственным источником истины. Факты, допущения и решения ведутся в `registry/`.
9. Финансовые расчёты размещать в Google Sheets; тексты и инвестиционные материалы — в Google Docs.
10. При конфликте источников фиксировать конфликт в `AUDIT.md` или decision record, а не выбирать версию молча.
11. Никакой агент не редактирует registry напрямую для содержательных изменений: они применяются только через approved change set.
12. Техническое исправление схемы или форматирования допускается напрямую, но фиксируется в `changelog/`.
13. Любая операция Google Workspace проходит folder guard; тестовые файлы создаются только в выделенной папке и изменяются только после preview, approved decision и интерактивного подтверждения.
14. ChatGPT не получает произвольный доступ к Google Drive: MCP принимает только `document_id` из `registry/documents.yaml` и проверяет project folder.
15. Любое содержательное изменение через MCP сначала проходит preview; apply принимает только существующий preview ID и approved decision ID.
16. MCP не создаёт решения, не повышает change set из `proposed` в `approved` и не является источником бизнес-решений.
17. Содержательные решения утверждает владелец проекта. Codex обслуживает инфраструктуру и governance-механизм, а не принимает бизнес-решения.
18. Каждая содержательная итерация обязана пройти состояния `proposed → approved → applied → verified` через proposal, approved decision, preview, apply, verification receipt и append-only chronological event log. Допустимы также `rejected`, `superseded`, `failed`, `rolled_back` только по разрешённым переходам.
19. Утверждённый payload применяется дословно либо структурно идентично утверждённой версии. Proposal, decision/change set, apply и verification должны ссылаться на один и тот же payload и SHA-256; apply не пересказывает и не реконструирует утверждённые данные.
20. Машинный хронологический журнал — `changelog/events.ndjson`; он только дополняется. Старые события нельзя редактировать или удалять, исправление фиксируется новым событием. `changelog/TIMELINE.md` генерируется из NDJSON и вручную не редактируется.
21. Rollback выполняется новым governed reverse change set: rollback request → reverse preview → approved rollback decision → reverse apply → validation → verification → rollback receipt. Rollback не удаляет исторические события и никогда не выполняется через `git reset`.
22. При начале каждого нового Codex-чата первой проектной командой выполнять `npm run project:onboard`; затем читать корневой `AGENTS.md`, этот файл и перечисленные командой актуальные машинные проекции. На новом компьютере перед onboarding выполнить `git fetch --all --tags`.
23. Content commit не может содержать собственный hash. Его hash фиксирует следующая стадия `iteration:seal` отдельным append-only `committed` event и отдельным seal commit.
24. CAPEX строится из четырёх уровней: единый Equipment Register → функциональные модули → профили форматов точек → отдельные конфигурации конкретных объектов.
25. Конфигурация конкретной точки никогда не изменяет Equipment Register, базовый модуль или профиль формата напрямую. Все отличия хранятся в `capex-configuration-overrides.yaml` и применяются только при генерации BOM.
26. Функциональные модули ссылаются на оборудование по стабильному `item_id`, форматы — на модули по `module_id`; копии оборудования в модулях, форматах и конфигурациях запрещены.
27. Финансовая модель должна получать комплектацию конкретного объекта из сгенерированного Equipment BOM, а не из общего реестра оборудования или текстовой CAPEX-спецификации.
28. `context/CODEX_HANDOFF.md`, `context/PROJECT_STATE.yaml` и `changelog/TIMELINE.md` — генерируемые проекции; вручную их не редактировать. Источник lifecycle — append-only `changelog/events.ndjson`.
29. Каждый будущий governed content commit содержит trailers `Iteration-ID`, `Decision-ID`, `Change-Set-ID`, `Approved-Payload-SHA256`, `Before-State-SHA256`, `After-State-SHA256`, `Timeline-Head-SHA256`. Без них iteration нельзя закрыть.
30. Governed iteration завершена только после seal. Force-push и rebase sealed commits запрещены; annotated iteration tags нельзя перезаписывать и при разрешённом push их отправляют вместе с commits.
31. Одна governed iteration не смешивается с несвязанными правками. Git notes не являются каноническим источником связи. Старые events и receipts не редактируются; correction — только новое событие.
32. Последовательный rollback работает только для последних итераций в обратном порядке. Извлечение исторической средней итерации оформляется новым compensating change и отдельным approved decision; `git reset` запрещён.
33. Testing and verification MUST follow `verification/README.md` and `verification/TESTING_POLICY.md`. Use `npm run verify:affected` by default and `npm run verify:release` only at lifecycle or release boundaries.
