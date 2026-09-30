/**
 * Колобочная — мост между Google Таблицей и сайтом.
 *
 * Куда вставлять: в таблице «Расширения» → «Apps Script», заменить весь код этим файлом.
 * Как включать: «Начать развёртывание» → «Новое развёртывание» → «Веб-приложение»,
 * запуск «От моего имени», доступ «Все». Адрес веб-приложения передаётся команде
 * `npm run sheet:connect` на компьютере разработчика.
 * После замены кода: «Управление развёртываниями» → карандаш → версия «Новая» → «Развернуть».
 *
 * Таблица остаётся закрытой. Мост отвечает только на запросы с ключом, который сервер
 * сайта сообщил ему при первом подключении.
 */

var SHEET_INPUTS = 'Вводные';
var SHEET_LEADS = 'Заявки';
var SHEET_ACCESS = 'Доступ';
var ACCESS_HEADERS = ['Что', 'Ссылка', 'Обновлено'];
var INPUT_HEADERS = ['Ключ', 'Название', 'Значение', 'Единица', 'Пояснение'];
var LEAD_HEADERS = ['Дата', 'Имя', 'Компания', 'Должность', 'Контакт', 'Почта', 'Интерес', 'Комментарий', 'Источник', 'Номер заявки'];
var LEAD_FIELDS = ['createdAt', 'name', 'company', 'role', 'contact', 'email', 'interest', 'comment', 'source', 'id'];
var KEY_PROPERTY = 'BRIDGE_KEY';
var KEY_MIN_LENGTH = 32;
var VALUE_COLUMN = 3;

var COLOR_HEADER = '#171717';
var COLOR_HEADER_TEXT = '#f7b91e';
var COLOR_KEY_TEXT = '#9a9a9a';
var COLOR_VALUE = '#fff4cc';
var COLOR_VALUE_REJECTED = '#f8c9c4';
var COLOR_NOTE_TEXT = '#5f5a52';
var COLOR_ROW_EVEN = '#fbf8f1';

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
    .addItem('Проверить листы', 'checkSheets')
    .addItem('Сбросить связь с сайтом', 'resetBridgeKey')
    .addToUi();
}

function checkSheets() {
  var book = SpreadsheetApp.getActive();
  var inputs = ensureSheet_(book, SHEET_INPUTS, INPUT_HEADERS);
  var leads = ensureSheet_(book, SHEET_LEADS, LEAD_HEADERS);
  SpreadsheetApp.getUi().alert('Вводных: ' + Math.max(inputs.getLastRow() - 1, 0) + '. Заявок: ' + Math.max(leads.getLastRow() - 1, 0) + '.');
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
  if (action === 'ping') return { ok: true, sheet: SpreadsheetApp.getActive().getName(), version: 3 };
  if (action === 'inputs') return readInputs_();
  if (action === 'seed') return seedInputs_(body.inputs || []);
  if (action === 'update') return updateInputs_(body.changes || []);
  if (action === 'mark') return markRejected_(body.rejected || []);
  if (action === 'lead') return appendLead_(body.lead || {});
  if (action === 'access') return writeAccess_(body.entries || []);
  return { ok: false, error: 'неизвестное действие' };
}

function inputRows_(sheet) {
  var rows = sheet.getDataRange().getValues();
  var byKey = {};
  for (var index = 1; index < rows.length; index++) {
    var key = String(rows[index][0] || '').trim();
    if (key && !byKey[key]) byKey[key] = { row: index + 1, value: rows[index][VALUE_COLUMN - 1] };
  }
  return byKey;
}

function readInputs_() {
  var sheet = SpreadsheetApp.getActive().getSheetByName(SHEET_INPUTS);
  if (!sheet) return { ok: false, error: 'нет листа «' + SHEET_INPUTS + '»' };
  var byKey = inputRows_(sheet);
  var inputs = Object.keys(byKey).map(function (key) {
    return { key: key, value: byKey[key].value, row: byKey[key].row };
  });
  return { ok: true, readAt: new Date().toISOString(), inputs: inputs };
}

function seedInputs_(items) {
  var book = SpreadsheetApp.getActive();
  var sheet = ensureSheet_(book, SHEET_INPUTS, INPUT_HEADERS);
  var known = inputRows_(sheet);

  var added = [];
  items.forEach(function (item) {
    if (!item || !item.key || known[item.key]) return;
    added.push([String(item.key), String(item.title || ''), item.value === null || item.value === undefined ? '' : item.value, String(item.unit || ''), String(item.comment || '')]);
    known[item.key] = true;
  });
  if (added.length) sheet.getRange(sheet.getLastRow() + 1, 1, added.length, INPUT_HEADERS.length).setValues(added);

  var rows = inputRows_(sheet);
  items.forEach(function (item) {
    if (!item || !rows[item.key]) return;
    var row = rows[item.key].row;
    sheet.getRange(row, 2).setValue(String(item.title || ''));
    sheet.getRange(row, 4).setValue(String(item.unit || ''));
    sheet.getRange(row, 5).setValue(String(item.comment || ''));
    sheet.getRange(row, VALUE_COLUMN).setDataValidation(validationFor_(item));
  });
  styleInputs_(sheet);

  var leads = ensureSheet_(book, SHEET_LEADS, LEAD_HEADERS);
  styleHeader_(leads, LEAD_HEADERS.length);
  leads.setColumnWidths(1, LEAD_HEADERS.length, 170);
  leads.setColumnWidth(8, 360);

  return { ok: true, added: added.length, total: sheet.getLastRow() - 1, leads: Math.max(leads.getLastRow() - 1, 0) };
}

function validationFor_(item) {
  var rule = SpreadsheetApp.newDataValidation().setAllowInvalid(false);
  var blank = item.optional === true;
  if (item.type === 'choice') return rule.requireValueInList(item.choices || [], true).setHelpText('Выберите из списка.').build();
  if (item.type === 'boolean') return rule.requireValueInList(['да', 'нет'], true).setHelpText('Выберите «да» или «нет».').build();
  if (item.allowed && item.allowed.length) {
    return rule.requireValueInList(item.allowed.map(String), true).setHelpText('Допустимо: ' + item.allowed.join(', ') + '.').build();
  }
  var min = typeof item.min === 'number' ? item.min : 0;
  var max = typeof item.max === 'number' ? item.max : 1e12;
  var help = 'Число от ' + min + ' до ' + max + (blank ? '. Можно оставить пустым.' : '.');
  return rule.requireNumberBetween(min, max).setHelpText(help).build();
}

function styleHeader_(sheet, columns) {
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, columns).setFontWeight('bold').setBackground(COLOR_HEADER).setFontColor(COLOR_HEADER_TEXT).setVerticalAlignment('middle');
  sheet.setRowHeight(1, 34);
}

function styleInputs_(sheet) {
  styleHeader_(sheet, INPUT_HEADERS.length);
  var count = sheet.getLastRow() - 1;
  if (count > 0) {
    var body = sheet.getRange(2, 1, count, INPUT_HEADERS.length);
    body.setVerticalAlignment('middle').setFontColor('#171717').setFontWeight('normal');
    for (var index = 0; index < count; index++) {
      sheet.getRange(index + 2, 1, 1, INPUT_HEADERS.length).setBackground(index % 2 ? COLOR_ROW_EVEN : '#ffffff');
    }
    sheet.getRange(2, 1, count, 1).setFontColor(COLOR_KEY_TEXT).setFontSize(9);
    sheet.getRange(2, 2, count, 1).setFontWeight('bold');
    sheet.getRange(2, VALUE_COLUMN, count, 1).setBackground(COLOR_VALUE).setFontWeight('bold').setHorizontalAlignment('right')
      .setBorder(true, true, true, true, false, true, '#e0b94a', SpreadsheetApp.BorderStyle.SOLID);
    sheet.getRange(2, 4, count, 1).setFontColor(COLOR_NOTE_TEXT);
    sheet.getRange(2, 5, count, 1).setFontColor(COLOR_NOTE_TEXT).setFontStyle('italic').setWrap(true);
  }
  sheet.setColumnWidth(1, 210);
  sheet.setColumnWidth(2, 320);
  sheet.setColumnWidth(3, 150);
  sheet.setColumnWidth(4, 90);
  sheet.setColumnWidth(5, 470);
}

function sameValue_(left, right) {
  var normalize = function (value) {
    if (value === null || value === undefined) return '';
    if (value === true) return 'да';
    if (value === false) return 'нет';
    if (typeof value === 'number') return String(value);
    var text = String(value).trim();
    var number = Number(text.replace(/[\s ]/g, '').replace(',', '.'));
    return text !== '' && !isNaN(number) ? String(number) : text;
  };
  return normalize(left) === normalize(right);
}

function updateInputs_(changes) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var sheet = SpreadsheetApp.getActive().getSheetByName(SHEET_INPUTS);
    if (!sheet) return { ok: false, error: 'нет листа «' + SHEET_INPUTS + '»' };
    var rows = inputRows_(sheet);
    var saved = [];
    var conflicts = [];
    changes.forEach(function (change) {
      var row = change && rows[change.key];
      if (!row) {
        conflicts.push({ key: change && change.key, reason: 'нет строки в таблице' });
        return;
      }
      if (!sameValue_(row.value, change.expected)) {
        conflicts.push({ key: change.key, reason: 'значение уже изменено в таблице', current: row.value });
        return;
      }
      var value = change.value === true ? 'да' : change.value === false ? 'нет' : change.value === null ? '' : change.value;
      sheet.getRange(row.row, VALUE_COLUMN).setValue(value).setBackground(COLOR_VALUE);
      saved.push(change.key);
    });
    SpreadsheetApp.flush();
    return { ok: true, saved: saved, conflicts: conflicts };
  } finally {
    lock.releaseLock();
  }
}

function markRejected_(rejected) {
  var sheet = SpreadsheetApp.getActive().getSheetByName(SHEET_INPUTS);
  if (!sheet) return { ok: false, error: 'нет листа «' + SHEET_INPUTS + '»' };
  var rows = inputRows_(sheet);
  var notes = {};
  rejected.forEach(function (item) {
    if (item && item.key) notes[item.key] = String(item.message || 'значение не принято сайтом');
  });
  Object.keys(rows).forEach(function (key) {
    var cell = sheet.getRange(rows[key].row, VALUE_COLUMN);
    if (notes[key]) cell.setBackground(COLOR_VALUE_REJECTED).setNote('Сайт не принял это значение: ' + notes[key] + '. Считает на прежнем.');
    else cell.setBackground(COLOR_VALUE).clearNote();
  });
  return { ok: true, rejected: Object.keys(notes).length };
}

function plainText_(value) {
  var text = String(value === null || value === undefined ? '' : value);
  return /^[=+\-@]/.test(text) ? "'" + text : text;
}

function appendLead_(lead) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var sheet = ensureSheet_(SpreadsheetApp.getActive(), SHEET_LEADS, LEAD_HEADERS);
    var id = String(lead.id || '');
    if (id && sheet.getLastRow() > 1) {
      var ids = sheet.getRange(2, LEAD_HEADERS.length, sheet.getLastRow() - 1, 1).getValues();
      for (var index = 0; index < ids.length; index++) {
        if (String(ids[index][0]) === id) return { ok: true, duplicate: true };
      }
    }
    sheet.appendRow(LEAD_FIELDS.map(function (field) { return plainText_(lead[field]); }));
    return { ok: true, row: sheet.getLastRow() };
  } finally {
    lock.releaseLock();
  }
}

function writeAccess_(entries) {
  var sheet = ensureSheet_(SpreadsheetApp.getActive(), SHEET_ACCESS, ACCESS_HEADERS);
  styleHeader_(sheet, ACCESS_HEADERS.length);
  var rows = sheet.getDataRange().getValues();
  var byTitle = {};
  for (var index = 1; index < rows.length; index++) byTitle[String(rows[index][0] || '')] = index + 1;
  entries.forEach(function (entry) {
    if (!entry || !entry.title) return;
    var row = byTitle[entry.title] || sheet.getLastRow() + 1;
    sheet.getRange(row, 1, 1, 3).setValues([[String(entry.title), String(entry.link || ''), new Date()]]);
    byTitle[entry.title] = row;
  });
  sheet.setColumnWidth(1, 260);
  sheet.setColumnWidth(2, 640);
  sheet.setColumnWidth(3, 170);
  return { ok: true, entries: entries.length };
}

function ensureSheet_(book, name, headers) {
  var sheet = book.getSheetByName(name);
  if (!sheet) {
    var first = book.getSheets()[0];
    var reusable = book.getSheets().length === 1 && first.getLastRow() === 0;
    sheet = reusable ? first.setName(name) : book.insertSheet(name, book.getSheets().length);
  }
  if (sheet.getLastRow() === 0) sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  return sheet;
}

function respond_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}
