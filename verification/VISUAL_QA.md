# Visual QA policy

Screenshot не является обязательной проверкой каждой UI-правки.

## Review-artifact rule

По умолчанию после итерации сохраняется один full-page screenshot изменённой страницы на desktop viewport. Проверка responsive layout остаётся обязательной, но выполняется browser checks без отдельных сохранённых screenshot для 1440, 1024, 768 и 390 px.

Дополнительный screenshot допускается только при mobile-specific проблеме, скрытом состоянии, отдельном запросе владельца или необходимости показать конкретный визуальный дефект. Внутренние cache-артефакты visual runner не заменяют этот один review artifact.

## Impact classifier

| Impact | Типичные изменения | Проверка |
|---|---|---|
| `none` | formula/YAML/JSON data, tests, aria/data attributes, internal refactor без DOM/layout | no browser, no screenshot |
| `low` | TSX text/copy или DOM change без layout markers | selected route DOM, HTTP, console, visibility, overflow; no screenshot by default |
| `high` | CSS, className/style, grid/flex, responsive, spacing, typography, position/sticky, крупный block или перестановка markup | selected route desktop + mobile machine checks and screenshots |

При сомнении classifier выбирает более высокий impact. Агент может явно вызвать `npm run verify:visual -- economics` (также `revenue`, `launch`, `capex`, `site`) для high-impact selected review.

## Dev server

Visual runner сначала проверяет `http://127.0.0.1:5173`. Существующий локальный server reuse. Если его нет, запускается один Vite dev server на время всех selected domains. Production build, prerender и static dist server в обычном visual workflow не используются.

## Machine-first checks

Перед review artifact runner проверяет HTTP/render success, required DOM visibility, console/page errors, root content и horizontal overflow. High impact создаёт только screenshots affected route в `.cache/verification/screenshots/` для desktop и mobile.

Агент не открывает screenshot автоматически. Это требуется только для реальной layout-оценки, при machine failure, по просьбе владельца или перед важным UI approval.

Regression invariant: Economics CSS не может вызвать Revenue/Launch/Summary screenshots, production prerender или full site suite.
