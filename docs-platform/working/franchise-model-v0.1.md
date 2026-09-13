# Модель сети и франшизы v0.1

Статус: **research / working**, отдельный инженерный сценарий. Не baseline и не инвестиционная презентация.

Маршрут: `/control/franchise-model`. Канонический parameter layer: [franchise-model-v0.1.json](franchise-model-v0.1.json). Источник — задание владельца 13.09.2026 и приведённые в нём ориентиры финансового аудита. Decision: `DEC-FRANCHISE-MODEL-V01-2026-09-13-01` утверждает реализацию стенда, а не финансовые гипотезы.

## Архитектура

- `src/lib/franchise-model-types.ts`: собственные contracts для параметров, сценариев, точек, расширений, funding и результатов.
- `src/lib/franchise-model-scenario.ts`: чтение research JSON, defaults, provenance, reset. JSON импортируется только из защищённого Control entry graph.
- `src/lib/franchise-model-engine.ts`: чистые функции без browser state, Current Base, Financial Model v0.2 и Network Planning adapters.
- `src/lib/franchise-model-storage.ts`: валидация и хранение версии 1, отдельное от Investor Terminal.
- `src/components/FranchiseModel.tsx` / `.css`: шесть разделов, денежный поток, чувствительность, сравнение до трёх сценариев.

Все новые assumption IDs имеют префикс `ASM-FRANCHISE-MODEL-V01-`. Они не добавляются в approved assumptions registry. Статусы: CONFIRMED / WORKING / REFERENCE / MISSING / DERIVED. Пользовательский ввод становится WORKING, включая явно принятый ноль. Исходные нулевые MISSING не делают итоговый FCF полным.

## Финансовые правила

Все продажи — **net retail sales**, без косвенных налогов. Юридическая схема, бухгалтерское признание и gross-to-net conversion не моделируются. Central settlement — внутреннее экономическое представление; юридическая структура может позднее разделяться на поставки, роялти, маркетинговые, технологические и иные платежи.

Retail FTE по каждой роли = позиций на смене × часов в день × дней / продуктивных часов на FTE × coverage. Рабочие 120 тыс. ₽/FTE — полная стоимость работодателя, не утверждённая зарплата. 27% labor floor не используется.

Initial draw = независимые стартовые статьи + software v1 + computing + предоплата + депозит + резерв. Резерв = fixed burn × месяцы. Площадь — физический вход; изменение м² не пересчитывает произвольно аренду, ремонт или оборудование. Эти суммы редактируются независимо. Депозит не возвращается в горизонте автоматически. Предоплаченная аренда остаётся расходом P&L, но не оплачивается повторно в cash flow первых месяцев. Стартовый запас — первоначальное финансирование; модель предполагает далее равномерное пополнение по переменной себестоимости без отдельного рабочего капитала.

Own P&L включает локальные расходы, retail labor, управленческое распределение аренды и прямые производственные расходы. При консолидации распределение аренды встроенной точки исключается; аренда узла оплачивается один раз. Fixed production payroll и центральные расходы не умножаются на точки. CAPEX дополнительных / отдельно стоящих собственных точек требует отдельного ввода; инвестиции франчайзи не оплачиваются HeadCo.

Нормативный settlement = net sales − норматив труда − норматив аренды − норматив OPEX − целевая EBITDA. При defaults: 100 − 15 − 8 − 5 − 15 = 57 ₽. Actual franchise EBITDA = sales − фактические локальные расходы − неизменный нормативный settlement. Отдельная доля royalty — только информационное выделение внутри settlement, не повторный расход.

Recurring HeadCo contribution исключает взносы открытия, налоги и CAPEX. Gross entry fee показан отдельно. Net opening contribution = fee − onboarding, и остаётся N/A до ввода onboarding. Known-basis subtotal явно исключает неопределённые расходы; он не разрешает итоговый investor waterfall. Собственная точка показывает операционный вклад до налогов и CAPEX, а не автономный налоговый FCF. Простой срок возврата CAPEX франчайзи по EBITDA — управленческий proxy, не дисконтированный payback и не прибыль после налогов.

Tax controls — только явный management proxy: максимум налога на положительный результат и минимальной доли HeadCo cash inflow. Ставки по умолчанию отсутствуют. Maintenance CAPEX задаётся отдельной месячной суммой. Эти controls не утверждают юридическую налоговую базу или режим.

Rollout — illustrative working schedule. Каждая включённая точка активируется с указанного месяца и сразу выходит на заданную выручку; сезонность и ramp-up отсутствуют. Мощность измеряется числом торговых точек, не технологической производительностью. Превышение помечает текущий и последующие месяцы UNVALIDATED; позднее расширение не стирает более раннее нарушение.

## Funding и waterfall

M0 draw равен потребности, а не commitment. Явный режим «Весь commitment в M0» служит сравнением альтернативы. Manual capital calls и автоматические draws для требуемого growth CAPEX используют только остаток commitment. Операционные убытки не запускают автоматическое финансирование. Все draws отрицательны в investor CF.

Cash balance ведётся с M0. Operating reserve, неиспользованные drawdowns и committed-but-undrawn капитал не распределяются. Будущий заданный CAPEX, не покрытый остатком commitment, резервируется из cash до waterfall. Неопределённая стоимость требуемого расширения блокирует инвесторский расчёт.

Distributable = min(положительный текущий FCF после расходов/налогов/maintenance/growth CAPEX, cash выше reserve floor и защиты будущего CAPEX). Восстановление резерва уменьшает или приостанавливает выплаты. При недостатке commitment или отрицательном cash balance результаты INVALID. Отрицательные показатели сохраняются видимыми.

Investor distribution = min(share × distributable, остаток cap). Cap = multiple × накопленные фактические draws. Новые draws увеличивают cap; equity OFF даёт нулевые выплаты после cap. При equity ON требуется явная доля после cap.

Principal return — первое покрытие накопленных на тот месяц draws накопленными distributions. Поздний draw может снова создать outstanding principal. Cap completion — первое достижение конечного cap после всех фактических draws в выбранном горизонте. Cash MOIC = distributions / actual draws. Cash IRR рассчитывается по M0…Mn, без terminal value, с месячным временем; нет единственного найденного корня — N/A.

Сумма retained allocations — историческая сумма удержаний. Свободный сохранённый cash исключает резерв и оставшиеся деньги инвестора, а также учитывает уже понесённые расходы роста/убытки. Это разные показатели.

## Результат исходного working scenario

- Кассир: 2,50909 FTE; повар: 2,50909 FTE; retail payroll: 602 181,82 ₽/мес.
- Production payroll: 360 000 ₽; manager/technologist: 75 000 ₽/мес.
- Monthly fixed burn: **1 947 181,82 ₽**; central fixed без retail: **1 345 000 ₽**.
- Reserve 4 месяца: **7 788 727,27 ₽**.
- Стартовые статьи без резерва: **15 383 993,33 ₽**.
- Initial draw: **23 172 720,60 ₽**; undrawn commitment: **16 827 279,40 ₽** до дополнительных calls.
- При 200 000 ₽/день: 6 000 000 ₽/мес.; 171,6149 чека/день.
- Franchise EBITDA: **900 000 ₽, 15%**; settlement: **3 420 000 ₽, 57%**.
- Сырьё: 1 800 000 ₽; потери: 72 000 ₽; упаковка: 143 012,41 ₽ на зрелую точку.
- Предварительный вклад зрелой франшизы до central fixed: **1 124 987,59 ₽/мес.**
- С M18: 1 собственная + 4 франчайзи; system sales 30 млн ₽/мес.; HeadCo recurring cash inflow 19,68 млн ₽/мес.
- В M24/M36/M60: 4 активных франчайзи; загрузка 5/5 по рабочей гипотезе.
- Известная часть recurring HeadCo contribution: **6 537 756,11 ₽/мес.**, до отсутствующих расходов и налогов; это не итоговый FCF.
- Investor principal, cap completion, Cash IRR/MOIC, retained cash для 90/10, 80/20 и 70/30: **N/A** до определения необходимых cash-flow inputs. Никакой подгонки под historical shadow analysis.

## MISSING inputs

Franchise point CAPEX (только franchisee payback); onboarding cost; локальный OPEX собственной точки; software на активную точку; дополнительные переменные производственные затраты; налоговые proxies; maintenance CAPEX. При отдельной / дополнительной собственной точке нужны её аренда и CAPEX. При расширении — CAPEX/OPEX/FTE события. При equity — post-cap share. При manual call — сумма.

Нулевые software/extra production в исходном JSON — технически показанные MISSING, не подтверждённые нулевые расходы. Без их явного задания инвесторские показатели N/A.

## Current Base comparator

Только чтение: initial capital 40 019 924,66 ₽; 300 checks/day; average check 1 165,40 ₽; mature revenue 10 488 600 ₽/мес.; mature FCF 2 045 009,80 ₽; project cash recovery M21. Это project cash recovery старой интегрированной модели, **не investor payback**. Software v1 и computing отсутствуют в старых 40,02 млн ₽.

Shadow analysis из задания: 90/10 — principal M22, cap M28, IRR ~20,36%; 80/20 — M25/M32/~18,17%; 70/30 — M29/M35/~15,96%. Это reference; полный исторический cash-flow ряд не подставляется в новый engine и не реконструируется из этих агрегатов.

## State и изоляция

`kolobochnaya.control.franchise-model.v1`: `{schemaVersion: 1, activeId, compareIds, scenarios}`. У сценария: `{schemaVersion, id, name, custom, inputs, edited, rollout, expansions, capitalCalls}`. Сценарии сохраняются в браузере; reset, duplicate, rename и удаление custom поддерживаются. Сравнение до 3; максимум 30 сценариев, 120 событий каждого вида, горизонт 1–120 месяцев. Повреждённый store не перезаписывается при чтении. Новый route не монтирует InvestorConfigurationProvider.

Current Base, Financial Model v0.2, Foundation/BMA, approved assumptions, Network Planning и публичный Investor Terminal не изменяются. Новые engine/data не включаются в public entry graph, sitemap или prerender. Google и deployment отсутствуют.

## Полный реестр исходных параметров

| Параметр | Значение | Единица | Статус | Assumption ID |
|---|---:|---|---|---|
| Площадь первого узла | 120 | м² | WORKING | `ASM-FRANCHISE-MODEL-V01-AREA` |
| Торговая функция внутри узла | 1 |  | WORKING | `ASM-FRANCHISE-MODEL-V01-EMBEDDED` |
| Аренда узла | 350000 | ₽/мес. | REFERENCE | `ASM-FRANCHISE-MODEL-V01-RENT` |
| Предоплата аренды | 1 | мес. | WORKING | `ASM-FRANCHISE-MODEL-V01-PREPAY` |
| Депозит аренды | 2 | мес. | REFERENCE | `ASM-FRANCHISE-MODEL-V01-DEPOSIT` |
| Ремонт / подготовка | 3500000 | ₽ | REFERENCE | `ASM-FRANCHISE-MODEL-V01-FITOUT` |
| Оборудование | 5298993.33 | ₽ | REFERENCE | `ASM-FRANCHISE-MODEL-V01-EQUIPMENT` |
| Мебель | 425000 | ₽ | REFERENCE | `ASM-FRANCHISE-MODEL-V01-FURNITURE` |
| Видеонаблюдение | 70000 | ₽ | REFERENCE | `ASM-FRANCHISE-MODEL-V01-VIDEO` |
| Сигнализация | 35000 | ₽ | REFERENCE | `ASM-FRANCHISE-MODEL-V01-ALARM` |
| Маркетинг запуска | 700000 | ₽ | REFERENCE | `ASM-FRANCHISE-MODEL-V01-LAUNCH` |
| Форма | 180000 | ₽ | REFERENCE | `ASM-FRANCHISE-MODEL-V01-UNIFORMS` |
| Первоначальный товарный запас | 1000000 | ₽ | REFERENCE | `ASM-FRANCHISE-MODEL-V01-INVENTORY` |
| Software platform v1 | 2500000 | ₽ | WORKING | `ASM-FRANCHISE-MODEL-V01-SOFTWARE-V1` |
| Вычислительная инфраструктура | 625000 | ₽ | WORKING | `ASM-FRANCHISE-MODEL-V01-COMPUTING` |
| Прочий стартовый CAPEX | 0 | ₽ | WORKING | `ASM-FRANCHISE-MODEL-V01-OTHER-STARTUP` |
| Операционный резерв | 4 | мес. | WORKING | `ASM-FRANCHISE-MODEL-V01-RESERVE-MONTHS` |
| Кассиров одновременно | 1 | чел. | WORKING | `ASM-FRANCHISE-MODEL-V01-CASHIERS` |
| Поваров одновременно | 1 | чел. | WORKING | `ASM-FRANCHISE-MODEL-V01-COOKS` |
| Часов работы в день | 12 | ч. | WORKING | `ASM-FRANCHISE-MODEL-V01-HOURS` |
| Рабочих дней для staffing | 30 | дн./мес. | WORKING | `ASM-FRANCHISE-MODEL-V01-STAFF-DAYS` |
| Продуктивных часов на FTE | 165 | ч./мес. | WORKING | `ASM-FRANCHISE-MODEL-V01-FTE-HOURS` |
| Коэффициент покрытия | 1.15 | × | WORKING | `ASM-FRANCHISE-MODEL-V01-COVERAGE` |
| Кассир: полная стоимость FTE | 120000 | ₽/FTE/мес. | WORKING | `ASM-FRANCHISE-MODEL-V01-CASHIER-COST` |
| Повар: полная стоимость FTE | 120000 | ₽/FTE/мес. | WORKING | `ASM-FRANCHISE-MODEL-V01-COOK-COST` |
| Производственный штат | 3 | FTE | WORKING | `ASM-FRANCHISE-MODEL-V01-PRODUCTION-FTE` |
| Производство: полная стоимость FTE | 120000 | ₽/FTE/мес. | WORKING | `ASM-FRANCHISE-MODEL-V01-PRODUCTION-COST` |
| Менеджер / технолог | 0.5 | FTE | WORKING | `ASM-FRANCHISE-MODEL-V01-MANAGER-FTE` |
| Менеджер: полная стоимость FTE | 150000 | ₽/FTE/мес. | WORKING | `ASM-FRANCHISE-MODEL-V01-MANAGER-COST` |
| Коммунальные расходы | 200000 | ₽/мес. | REFERENCE | `ASM-FRANCHISE-MODEL-V01-UTILITIES` |
| Минимальный центральный маркетинг | 150000 | ₽/мес. | WORKING | `ASM-FRANCHISE-MODEL-V01-CENTRAL-MARKETING` |
| Постоянная логистика | 100000 | ₽/мес. | WORKING | `ASM-FRANCHISE-MODEL-V01-FIXED-LOGISTICS` |
| Центральные накладные расходы | 100000 | ₽/мес. | WORKING | `ASM-FRANCHISE-MODEL-V01-OVERHEAD` |
| Регулярное software | 10000 | ₽/мес. | REFERENCE | `ASM-FRANCHISE-MODEL-V01-RECURRING` |
| Способ задания выручки | 0 |  | WORKING | `ASM-FRANCHISE-MODEL-V01-OWN-MODE` |
| Собственная точка: выручка в день | 200000 | ₽/день | WORKING | `ASM-FRANCHISE-MODEL-V01-OWN-REVENUE` |
| Собственная точка: чеков в день | 171.6148961729878 | чеков/день | WORKING | `ASM-FRANCHISE-MODEL-V01-OWN-CHECKS` |
| Собственная точка: средний чек | 1165.4 | ₽ | REFERENCE | `ASM-FRANCHISE-MODEL-V01-OWN-CHECK` |
| Собственная точка: дней работы | 30 | дн./мес. | WORKING | `ASM-FRANCHISE-MODEL-V01-OWN-DAYS` |
| Управленческая доля аренды retail | 25.0 | % | WORKING | `ASM-FRANCHISE-MODEL-V01-RETAIL-ALLOCATION` |
| Собственная точка: локальный OPEX | N/A | ₽/мес. | MISSING | `ASM-FRANCHISE-MODEL-V01-OWN-LOCAL` |
| Аренда отдельно стоящей собственной точки | N/A | ₽/мес. | MISSING | `ASM-FRANCHISE-MODEL-V01-OWN-EXTERNAL-RENT` |
| CAPEX дополнительной собственной точки | N/A | ₽ | MISSING | `ASM-FRANCHISE-MODEL-V01-OWN-GROWTH-CAPEX` |
| Франчайзи: выручка в день | 200000 | ₽/день | WORKING | `ASM-FRANCHISE-MODEL-V01-FRANCHISE-REVENUE` |
| Франчайзи: средний чек | 1165.4 | ₽ | REFERENCE | `ASM-FRANCHISE-MODEL-V01-FRANCHISE-CHECK` |
| Франчайзи: дней работы | 30 | дн./мес. | WORKING | `ASM-FRANCHISE-MODEL-V01-FRANCHISE-DAYS` |
| Норматив локального труда | 15.0 | % | WORKING | `ASM-FRANCHISE-MODEL-V01-NORM-LABOR` |
| Норматив аренды | 8.0 | % | WORKING | `ASM-FRANCHISE-MODEL-V01-NORM-RENT` |
| Норматив локального OPEX | 5.0 | % | WORKING | `ASM-FRANCHISE-MODEL-V01-NORM-OPEX` |
| Целевая EBITDA франчайзи | 15.0 | % | WORKING | `ASM-FRANCHISE-MODEL-V01-TARGET` |
| Выделенная часть settlement: роялти | 0 | % | WORKING | `ASM-FRANCHISE-MODEL-V01-ROYALTY` |
| Фактические расходы | 0 |  | WORKING | `ASM-FRANCHISE-MODEL-V01-ACTUAL-MODE` |
| Фактический локальный труд | 900000 | ₽/мес. | WORKING | `ASM-FRANCHISE-MODEL-V01-ACTUAL-LABOR` |
| Фактическая аренда | 480000 | ₽/мес. | WORKING | `ASM-FRANCHISE-MODEL-V01-ACTUAL-RENT` |
| Фактический локальный OPEX | 300000 | ₽/мес. | WORKING | `ASM-FRANCHISE-MODEL-V01-ACTUAL-OPEX` |
| CAPEX точки франчайзи | N/A | ₽ | MISSING | `ASM-FRANCHISE-MODEL-V01-FRANCHISE-CAPEX` |
| Паушальный взнос | 1000000 | ₽ | WORKING | `ASM-FRANCHISE-MODEL-V01-ENTRY-FEE` |
| Открытие / сопровождение нового франчайзи | N/A | ₽/точку | MISSING | `ASM-FRANCHISE-MODEL-V01-ONBOARDING` |
| Сырьё от net retail sales | 30.0 | % | REFERENCE | `ASM-FRANCHISE-MODEL-V01-RAW` |
| Потери от стоимости сырья | 4.0 | % | REFERENCE | `ASM-FRANCHISE-MODEL-V01-WASTE` |
| Упаковка на чек | 27.77777777777778 | ₽/чек | REFERENCE | `ASM-FRANCHISE-MODEL-V01-PACKAGING` |
| Переменный сетевой маркетинг | 3.0 | % | WORKING | `ASM-FRANCHISE-MODEL-V01-NETWORK-MARKETING` |
| Доставка активному франчайзи | 50000 | ₽/точку/мес. | WORKING | `ASM-FRANCHISE-MODEL-V01-DELIVERY` |
| Поддержка активного франчайзи | 50000 | ₽/точку/мес. | WORKING | `ASM-FRANCHISE-MODEL-V01-SUPPORT` |
| Software на активную точку | 0 | ₽/точку/мес. | MISSING | `ASM-FRANCHISE-MODEL-V01-POINT-SOFTWARE` |
| Прочие переменные производственные затраты | 0 | ₽/точку/мес. | MISSING | `ASM-FRANCHISE-MODEL-V01-EXTRA-PRODUCTION` |
| Мощность первого узла | 5 | торговых точек | WORKING | `ASM-FRANCHISE-MODEL-V01-CAPACITY` |
| Горизонт расчёта | 60 | мес. | WORKING | `ASM-FRANCHISE-MODEL-V01-HORIZON` |
| Обязательство инвестора | 40000000 | ₽ | WORKING | `ASM-FRANCHISE-MODEL-V01-COMMITMENT` |
| Финансирование | 0 |  | WORKING | `ASM-FRANCHISE-MODEL-V01-FUNDING-MODE` |
| Доля инвестора до cap | 80.0 | % | WORKING | `ASM-FRANCHISE-MODEL-V01-SHARE` |
| Предельный возврат на фактический draw | 1.25 | × | WORKING | `ASM-FRANCHISE-MODEL-V01-RETURN-CAP` |
| Целевая Cash IRR | 20.0 | % | WORKING | `ASM-FRANCHISE-MODEL-V01-TARGET-IRR` |
| Equity после cap | 0 |  | WORKING | `ASM-FRANCHISE-MODEL-V01-EQUITY` |
| Доля инвестора после cap при equity | N/A | % | MISSING | `ASM-FRANCHISE-MODEL-V01-POST-CAP-SHARE` |
| Управленческий налог на положительный результат | N/A | % | MISSING | `ASM-FRANCHISE-MODEL-V01-TAX-PROFIT` |
| Минимальный налог от HeadCo inflow | N/A | % | MISSING | `ASM-FRANCHISE-MODEL-V01-TAX-SALES` |
| Maintenance CAPEX | N/A | ₽/мес. | MISSING | `ASM-FRANCHISE-MODEL-V01-MAINTENANCE` |
