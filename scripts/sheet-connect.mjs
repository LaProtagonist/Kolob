// Подключает Google Таблицу к сайту: связывает мост ключом, заполняет лист «Вводные»
// недостающими строками и сообщает адрес моста серверу.
//
// Запуск: npm run sheet:connect -- "<адрес веб-приложения>" ["<ссылка на таблицу>"]
// Повторный запуск безопасен: значения, уже введённые в таблице, не меняются.

import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const server = process.env.SERVER || "root@155.212.245.24";
const host = process.env.KOLOB_HOST || "colob.spi.ski";
const remoteFile = process.env.REMOTE_BRIDGE_FILE || "/srv/kolob-data/google-bridge.json";
const schemaFile = path.join(root, "server", "inputs-schema.json");
const bridgePrefix = "https://script.google.com/";

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function ssh(command, input = "") {
  return new Promise((resolve, reject) => {
    const child = spawn("ssh", ["-o", "ConnectTimeout=20", "-o", "ConnectionAttempts=1", server, command], { stdio: ["pipe", "pipe", "inherit"] });
    let output = "";
    child.stdout.on("data", (chunk) => { output += chunk; });
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve(output) : reject(new Error(`ssh завершился с кодом ${code}`))));
    child.stdin.end(input);
  });
}

async function bridge(url, key, action, payload) {
  const response = payload
    ? await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payload, action, key }) })
    : await fetch(`${url}?${new URLSearchParams({ action, key })}`);
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`мост ответил не данными, а страницей (код ${response.status}). Проверьте, что доступ к веб-приложению — «Все».`);
  }
}

const [url, sheetUrl = ""] = process.argv.slice(2);
if (!url || !url.startsWith(bridgePrefix) || !url.endsWith("/exec")) {
  fail(`Нужен адрес веб-приложения вида ${bridgePrefix}macros/s/…/exec\nЗапуск: npm run sheet:connect -- "<адрес>" "<ссылка на таблицу>"`);
}
if (host !== "colob.spi.ski" || !remoteFile.startsWith("/srv/kolob-data/")) fail(`Неожиданная цель: ${host} ${remoteFile}`);
if (sheetUrl && !sheetUrl.startsWith("https://docs.google.com/spreadsheets/")) fail("Ссылка на таблицу должна начинаться с https://docs.google.com/spreadsheets/");

const schema = JSON.parse(fs.readFileSync(schemaFile, "utf8"));
const seed = schema.inputs.map((item) => ({
  key: item.key,
  title: item.title,
  value: item.default,
  unit: item.unit || "",
  comment: item.comment || "",
  type: item.type || "number",
  choices: item.choices,
  allowed: item.allowed,
  min: item.min,
  max: item.max,
  optional: item.optional === true,
}));

let key = "";
const existing = await ssh(`cat '${remoteFile}' 2>/dev/null || true`);
try {
  const saved = JSON.parse(existing);
  if (saved.url === url && typeof saved.key === "string") key = saved.key;
} catch {
  key = "";
}

if (key && (await bridge(url, key, "ping")).ok) {
  process.stdout.write("Мост уже связан с сайтом, ключ прежний.\n");
} else {
  key = randomBytes(32).toString("hex");
  const paired = await bridge(url, key, "pair");
  if (!paired.ok) fail(`Связать не удалось: ${paired.error}`);
  process.stdout.write("Мост связан с сайтом.\n");
}

const seeded = await bridge(url, key, "seed", { inputs: seed });
if (!seeded.ok) fail(`Заполнить лист «Вводные» не удалось: ${seeded.error}`);
process.stdout.write(`Лист «Вводные»: добавлено строк ${seeded.added}, всего ${seeded.total}; списки и цвета обновлены. Лист «Заявки»: записей ${seeded.leads ?? 0}.\n`);

await ssh(`umask 077 && cat > '${remoteFile}.next' && mv '${remoteFile}.next' '${remoteFile}'`, `${JSON.stringify({ url, key, sheetUrl }, null, 2)}\n`);
process.stdout.write("Адрес моста записан на сервер.\n");

const check = await fetch(`https://${host}/api/inputs`).then((response) => response.json()).catch(() => null);
if (!check || !check.ok) {
  fail("Сервер сайта ещё не отдаёт вводные. Обновите серверную часть: npm run backend:deploy — и откройте https://colob.spi.ski/control/inputs");
}
process.stdout.write(`Сайт получил вводные: источник «${check.source}», значений ${Object.keys(check.inputs).length}.\n`);
process.stdout.write(`Проверка: https://${host}/control/inputs\n`);
