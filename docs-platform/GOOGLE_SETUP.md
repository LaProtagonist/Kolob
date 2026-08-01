# Google Cloud и OAuth: план без подключения

## API

В отдельном Google Cloud project включить Google Drive API, Google Docs API и Google Sheets API. Google Picker API требуется для явного выбора уже существующей проектной папки при сохранении минимального scope `drive.file`.

## OAuth-клиент и scopes

Для локального запуска TypeScript/Node.js использовать OAuth client типа **Desktop app** с Authorization Code + PKCE; redirect URI и client configuration фиксируются в проектной документации, но не коммитятся. Для будущего локального web-интерфейса можно завести отдельный client типа Web application — не переиспользовать один client для обоих сценариев.

Для текущего sandbox достаточно одного scope: `https://www.googleapis.com/auth/drive.file`. Официальные методы Google Docs `documents.get` и `documents.create`, а также Google Sheets `spreadsheets.get` и `spreadsheets.create` допускают этот scope; он даёт доступ только к файлам, созданным приложением или явно открытым/переданным ему. Поэтому `documents` и `spreadsheets` сейчас не запрашиваются: они не нужны для минимального сценария и шире по охвату данных.

`drive.file` не является ограничением одной папкой. Программа дополнительно проверяет `projectFolderId`, MIME-тип и прямого родителя каждого файла перед чтением, записью или удалением. Выбор и listing ограничены точным именем папки либо её непосредственными дочерними объектами.

Официальные источники: [выбор Drive scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth), [Docs documents.get](https://developers.google.com/workspace/docs/api/reference/rest/v1/documents/get), [Sheets spreadsheets.create](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets/create), [OAuth для desktop apps](https://developers.google.com/identity/protocols/oauth2/native-app).

Не запрашивать широкий `drive` scope без отдельного решения. При чтении дерева папок, если `drive.file` недостаточен для выбранного сценария, сначала пересмотреть UX выбора папки и оформить decision record, а не повышать scope автоматически.

## Локальное хранение и Git

Хранить OAuth client configuration и refresh tokens вне репозитория, например в профиле пользователя: `%LOCALAPPDATA%\\KolobochnayaDocsPlatform\\`. Токены шифровать средствами ОС или хранить в credential manager. В `.gitignore` должны быть:

```gitignore
docs-platform/.credentials/
docs-platform/.tokens/
docs-platform/runtime/
docs-platform/.secrets/
docs-platform/config/google.json
client_secret*.json
credentials*.json
token*.json
.env
.env.*
*.pem
```

Никаких реальных token, API key, client ID, client secret, document ID или folder ID в этих документах не размещать.

## Минимизация доступа

1. Пользователь вручную создаёт или выбирает папку `Колобочная — Investment` в Google Drive.
2. Приложение получает доступ только через явный picker/открытие этой папки и сохраняет её ID в локальном защищённом runtime-конфиге.
3. Каждый вызов валидирует, что document/spreadsheet является дочерним объектом разрешённой папки или имеет разрешённый registry ID.
4. Любые операции list/search ограничиваются этим корнем; запретить рекурсивные операции за его пределами.
5. В `preview` показывать целевой ID, имя и родителя; `apply` отклонять при несовпадении allowlist.
6. Не использовать service account с доступом к личному Drive; при будущем shared drive — отдельная минимальная группа и отдельное решение.

## Локальный sandbox

Локальные credentials и token лежат в `.secrets/`; `config/google.json` хранит только ID выбранной папки, её имя и `testMode`. Локальный manifest с ID тестовых файлов и подготовленный change set тоже лежат в `.secrets/` и не попадают в Git. Созданные тестовые файлы проверяются по manifest и folder guard; cleanup никогда не ищет их по всему Drive.

После обычного OAuth-входа существующая папка может оставаться невидимой для приложения, потому что `drive.file` выдаёт доступ только к явно выбранным объектам. В этом случае запустить из `docs-platform/app`:

```bash
npm run google:folder:authorize
```

Команда выводит URL для Google Picker и ожидает локальный callback. Она не открывает системный браузер, не запрашивает более широкий scope и сохраняет новый token только после выбора ровно настроенного `projectFolderId`.

## CAPEX Equipment Register

Структурированный research-реестр публикуется отдельным детерминированным publisher:

```bash
npm run capex:sheet:preview
npm run capex:sheet:apply -- --apply --decision DEC-007
```

Цель жёстко ограничена нативной Google Sheet `03 — CAPEX — Реестр оснащения пилотного объекта` внутри проверенной проектной папки. При отсутствии registry ID publisher ищет только непосредственных детей папки и только по точному имени; при двух совпадениях останавливается. Повторный запуск обновляет найденный зарегистрированный файл, сохраняет стабильный порядок `item_id`, не записывает `tbd` в числовые колонки, не меняет sharing и проверяет пять листов повторным чтением через Sheets API.

Sheet ID сохраняется только через governed change set. Полный folder ID, OAuth credentials, token и локальный `config/google.json` в Git и journal не сохраняются.
