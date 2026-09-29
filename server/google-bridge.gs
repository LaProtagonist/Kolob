/**
 * Колобочная — мост между Google Таблицей и сайтом.
 *
 * Куда вставлять: в таблице «Расширения» → «Apps Script», заменить весь код этим файлом.
 * Как включать: «Начать развёртывание» → «Новое развёртывание» → «Веб-приложение»,
 * запуск «От моего имени», доступ «Все». Адрес веб-приложения передаётся команде
 * `npm run sheet:connect` на компьютере разработчика.
 *
 * Таблица остаётся закрытой. Сайт получает только лист «Вводные» и только по ключу,
 * который сервер сайта сообщает мосту при первом подключении.
 */

var SHEET_INPUTS = 'Вводные';
var INPUT_HEADERS = ['Ключ', 'Название', 'Значение', 'Единица', 'Пояснение'];
var KEY_PROPERTY = 'BRIDGE_KEY';
var KEY_MIN_LENGTH = 32;

function doGet(e) {
  return respond_(handle_((e && e.parameter) || {}, {}));
}

function doPost(e) {
  var body = {};
  try {
    body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (error) {
    body = {};
  }
  return respond_(handle_(body, body));
}

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Колобочная')
    .addItem('Проверить лист «Вводные»', 'checkInputsSheet')
    .addItem('Сбросить связь с сайтом', 'resetBridgeKey')
    .addToUi();
}

function checkInputsSheet() {
  var sheet = ensureSheet_(SpreadsheetApp.getActive(), SHEET_INPUTS, INPUT_HEADERS);
  SpreadsheetApp.getUi().alert('Лист «' + SHEET_INPUTS + '» на месте, строк с вводными: ' + Math.max(sheet.getLastRow() - 1, 0) + '.');
}

function resetBridgeKey() {
  PropertiesService.getScriptProperties().deleteProperty(KEY_PROPERTY);
  SpreadsheetApp.getUi().alert('Связь сброшена. Сайт перестанет получать вводные, пока команда подключения не будет запущена снова.');
}

function handle_(params, body) {
  var properties = PropertiesService.getScriptProperties();
  var stored = properties.getProperty(KEY_PROPERTY);
  var key = String(params.key || '');
  var action = String(params.action || '');

  if (action === 'pair') {
    if (stored) return { ok: false, error: 'мост уже связан с сайтом; сбросьте связь в меню «Колобочная»' };
    if (key.length < KEY_MIN_LENGTH) return { ok: false, error: 'ключ слишком короткий' };
    properties.setProperty(KEY_PROPERTY, key);
    return { ok: true, paired: true };
  }

  if (!stored || key !== stored) return { ok: false, error: 'ключ не подходит' };
  if (action === 'ping') return { ok: true, sheet: SpreadsheetApp.getActive().getName() };
  if (action === 'inputs') return readInputs_();
  if (action === 'seed') return seedInputs_(body.inputs || []);
  return { ok: false, error: 'неизвестное действие' };
}

function readInputs_() {
  var sheet = SpreadsheetApp.getActive().getSheetByName(SHEET_INPUTS);
  if (!sheet) return { ok: false, error: 'нет листа «' + SHEET_INPUTS + '»' };
  var rows = sheet.getDataRange().getValues();
  var inputs = [];
  for (var index = 1; index < rows.length; index++) {
    var key = String(rows[index][0] || '').trim();
    if (!key) continue;
    inputs.push({ key: key, value: rows[index][2], row: index + 1 });
  }
  return { ok: true, readAt: new Date().toISOString(), inputs: inputs };
}

function seedInputs_(items) {
  var sheet = ensureSheet_(SpreadsheetApp.getActive(), SHEET_INPUTS, INPUT_HEADERS);
  var rows = sheet.getDataRange().getValues();
  var known = {};
  for (var index = 1; index < rows.length; index++) known[String(rows[index][0] || '').trim()] = true;

  var added = [];
  items.forEach(function (item) {
    if (!item || !item.key || known[item.key]) return;
    added.push([String(item.key), String(item.title || ''), item.value, String(item.unit || ''), String(item.comment || '')]);
    known[item.key] = true;
  });
  if (added.length) sheet.getRange(sheet.getLastRow() + 1, 1, added.length, INPUT_HEADERS.length).setValues(added);

  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, INPUT_HEADERS.length).setFontWeight('bold').setBackground('#171717').setFontColor('#f7b91e');
  if (sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).setFontColor('#8a8a8a');
    sheet.getRange(2, 3, sheet.getLastRow() - 1, 1).setBackground('#fff4cc').setFontWeight('bold');
    sheet.getRange(2, 5, sheet.getLastRow() - 1, 1).setWrap(true);
  }
  sheet.setColumnWidth(1, 250);
  sheet.setColumnWidth(2, 330);
  sheet.setColumnWidth(3, 140);
  sheet.setColumnWidth(4, 110);
  sheet.setColumnWidth(5, 460);
  return { ok: true, added: added.length, total: sheet.getLastRow() - 1 };
}

function ensureSheet_(book, name, headers) {
  var sheet = book.getSheetByName(name);
  if (!sheet) {
    var first = book.getSheets()[0];
    var reusable = book.getSheets().length === 1 && first.getLastRow() === 0;
    sheet = reusable ? first.setName(name) : book.insertSheet(name, 0);
  }
  if (sheet.getLastRow() === 0) sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  return sheet;
}

function respond_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}
