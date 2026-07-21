# Google Cloud и OAuth: план без подключения

## API

В отдельном Google Cloud project включить Google Drive API, Google Docs API и Google Sheets API. При необходимости позже — Google Picker API для явного выбора папки пользователем; на этом этапе не требуется.

## OAuth-клиент и scopes

Для локального запуска TypeScript/Node.js использовать OAuth client типа **Desktop app** с Authorization Code + PKCE; redirect URI и client configuration фиксируются в проектной документации, но не коммитятся. Для будущего локального web-интерфейса можно завести отдельный client типа Web application — не переиспользовать один client для обоих сценариев.

Минимальные scopes:

- `https://www.googleapis.com/auth/drive.file` — доступ к файлам, которые приложение создало или которые пользователь явно открыл/выбрал;
- `https://www.googleapis.com/auth/documents` — чтение и запись разрешённых Google Docs;
- `https://www.googleapis.com/auth/spreadsheets` — чтение и запись разрешённых Google Sheets.

Не запрашивать широкий `drive` scope без отдельного решения. При чтении дерева папок, если `drive.file` недостаточен для выбранного сценария, сначала пересмотреть UX выбора папки и оформить decision record, а не повышать scope автоматически.

## Локальное хранение и Git

Хранить OAuth client configuration и refresh tokens вне репозитория, например в профиле пользователя: `%LOCALAPPDATA%\\KolobochnayaDocsPlatform\\`. Токены шифровать средствами ОС или хранить в credential manager. В `.gitignore` должны быть:

```gitignore
docs-platform/.credentials/
docs-platform/.tokens/
docs-platform/runtime/
client_secret*.json
credentials*.json
token*.json
*.pem
```

Никаких реальных token, API key, client ID, client secret, document ID или folder ID в этих документах не размещать.

## Минимизация доступа

1. Пользователь вручную создаёт или выбирает папку `Колобочная / Investment` в Google Drive.
2. Приложение получает доступ только через явный picker/открытие этой папки и сохраняет её ID в локальном защищённом runtime-конфиге.
3. Каждый вызов валидирует, что document/spreadsheet является дочерним объектом разрешённой папки или имеет разрешённый registry ID.
4. Любые операции list/search ограничиваются этим корнем; запретить рекурсивные операции за его пределами.
5. В `preview` показывать целевой ID, имя и родителя; `apply` отклонять при несовпадении allowlist.
6. Не использовать service account с доступом к личному Drive; при будущем shared drive — отдельная минимальная группа и отдельное решение.
