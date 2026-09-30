const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const projectRoot = path.resolve(__dirname, "..");
const port = Number(process.env.SHEET_INPUTS_TEST_PORT || 19_000 + (process.pid % 900));
const bridgePort = port + 1;
const baseUrl = `http://127.0.0.1:${port}`;
const password = "sheet-inputs-test-password";
const bridgeKey = "sheet-inputs-test-bridge-key-0123456789abcdef";
const sheetUrl = "https://docs.google.com/spreadsheets/d/test/edit";

const schema = {
  inputs: [
    { key: "checks_per_day", title: "Чеков в день", unit: "чеков", type: "integer", min: 0, max: 10000, default: 300 },
    { key: "rent_per_month", title: "Аренда в месяц", unit: "₽", type: "number", min: 0, max: 100000000, default: 500000 },
    { key: "bar_enabled", title: "Бар", unit: "", type: "boolean", default: true },
    { key: "equipment_level", title: "Оборудование", unit: "", type: "choice", choices: ["minimal", "base", "reserve"], default: "base" },
  ],
};

const sheet = { rows: [], mode: "ok", requests: 0, updates: [], marks: [], leads: [] };

function readBody(req) {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => resolve(body));
  });
}

// Mirrors sameValue_ of the Apps Script: booleans as да/нет, numbers by value.
function same(value) {
  if (value === null || value === undefined) return "";
  if (value === true) return "да";
  if (value === false) return "нет";
  const text = String(value).trim();
  const number = Number(text.replace(/[\s ]/g, "").replace(",", "."));
  return text !== "" && !Number.isNaN(number) ? String(number) : text;
}

// A stand-in for the Apps Script bridge: rows, leads, marks and update conflicts live in memory.
function startBridge() {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://127.0.0.1:${bridgePort}`);
    sheet.requests += 1;
    if (sheet.mode === "down") {
      res.writeHead(500, { "Content-Type": "text/html" });
      res.end("<html>error</html>");
      return;
    }
    const body = req.method === "POST" ? JSON.parse((await readBody(req)) || "{}") : {};
    const params = { ...Object.fromEntries(url.searchParams), ...body };
    const allowed = params.key === bridgeKey && sheet.mode !== "forbidden";
    let payload = { ok: false, error: "неизвестное действие" };
    if (!allowed) payload = { ok: false, error: "ключ не подходит" };
    else if (params.action === "inputs") payload = { ok: true, readAt: new Date().toISOString(), inputs: sheet.rows };
    else if (params.action === "update") {
      const saved = [];
      const conflicts = [];
      for (const change of body.changes || []) {
        const row = sheet.rows.find((item) => item.key === change.key);
        if (!row) conflicts.push({ key: change.key, reason: "нет строки в таблице" });
        else if (same(row.value) !== same(change.expected)) conflicts.push({ key: change.key, reason: "значение уже изменено в таблице", current: row.value });
        else { row.value = change.value; saved.push(change.key); }
      }
      sheet.updates.push(body.changes);
      payload = { ok: true, saved, conflicts };
    } else if (params.action === "mark") { sheet.marks.push(body.rejected); payload = { ok: true }; }
    else if (params.action === "lead") { sheet.leads.push(body.lead); payload = { ok: true, row: sheet.leads.length + 1 }; }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(payload));
  });
  return new Promise((resolve) => server.listen(bridgePort, "127.0.0.1", () => resolve(server)));
}

async function request(pathname, options = {}) {
  return fetch(`${baseUrl}${pathname}`, { redirect: "manual", ...options });
}

async function inputs() {
  const response = await request("/api/inputs");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("cache-control") || "", /no-store/);
  return response.json();
}

async function waitForServer(child) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      if ((await request("/health")).status === 200) return;
    } catch {
      // The service is still starting.
    }
    if (child.exitCode !== null) throw new Error(`Backend exited with ${child.exitCode}`);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Backend did not become ready");
}

function startBackend(dataDir, schemaFile) {
  return spawn("python3", ["server/contact_server.py"], {
    cwd: projectRoot,
    env: {
      ...process.env,
      CONTACT_SERVER_HOST: "127.0.0.1",
      CONTACT_SERVER_PORT: String(port),
      CONTACT_DATA_DIR: dataDir,
      CONTACT_ADMIN_PASSWORD: password,
      CONTACT_ADMIN_SECRET: "sheet-inputs-test-secret",
      CONTACT_COOKIE_SECURE: "0",
      CONTACT_BRIDGE_URL_PREFIX: "http://127.0.0.1:",
      CONTACT_INPUTS_SCHEMA_FILE: schemaFile,
      CONTACT_INPUTS_MAX_AGE: "3600",
    },
    stdio: "ignore",
  });
}

async function stop(child) {
  if (child.exitCode !== null) return;
  child.kill("SIGTERM");
  await new Promise((resolve) => child.once("close", resolve));
}

async function run() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "kolob-sheet-inputs-"));
  const schemaFile = path.join(dataDir, "inputs-schema.json");
  fs.writeFileSync(schemaFile, JSON.stringify(schema));
  const bridge = await startBridge();
  let backend = startBackend(dataDir, schemaFile);

  try {
    await waitForServer(backend);

    const defaults = await inputs();
    assert.equal(defaults.source, "defaults", "without a connected sheet the site runs on defaults");
    assert.deepEqual(defaults.inputs, { checks_per_day: 300, rent_per_month: 500000, bar_enabled: true, equipment_level: "base" });
    assert.equal(sheet.requests, 0, "no sheet request before the bridge is connected");

    fs.writeFileSync(path.join(dataDir, "google-bridge.json"), JSON.stringify({ url: `http://127.0.0.1:${bridgePort}/exec`, key: bridgeKey, sheetUrl }));
    sheet.rows = [
      { key: "checks_per_day", value: 777 },
      { key: "rent_per_month", value: "1 200 000,50" },
      { key: "bar_enabled", value: "нет" },
      { key: "equipment_level", value: "reserve" },
      { key: "unknown_row", value: 1 },
    ];
    const fromSheet = await inputs();
    assert.equal(fromSheet.source, "google", "the first visit after connection reads the sheet");
    assert.deepEqual(fromSheet.inputs, { checks_per_day: 777, rent_per_month: 1200000.5, bar_enabled: false, equipment_level: "reserve" });
    assert.equal("errors" in fromSheet, false, "validation details stay out of the public answer");

    sheet.rows[0].value = 888;
    const requestsBefore = sheet.requests;
    assert.equal((await inputs()).inputs.checks_per_day, 777, "within the freshness window the copy is reused");
    assert.equal(sheet.requests, requestsBefore, "a fresh copy does not trigger a sheet request");

    assert.equal((await request("/control/inputs")).status, 303, "the inputs page requires a session");
    assert.equal((await request("/control/inputs/refresh", { method: "POST" })).status, 303, "refresh requires a session");
    assert.equal(sheet.requests, requestsBefore, "an anonymous refresh does not reach the sheet");

    const login = await request("/control/login", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ password, next: "/control/inputs" }),
    });
    assert.equal(login.headers.get("location"), "/control/inputs");
    const cookie = login.headers.getSetCookie()[0].split(";", 1)[0];

    const refreshed = await request("/control/inputs/refresh", { method: "POST", headers: { Cookie: cookie } });
    assert.equal(refreshed.status, 303);
    assert.equal(refreshed.headers.get("location"), "/control/inputs");
    assert.equal((await inputs()).inputs.checks_per_day, 888, "a forced refresh picks up the edit at once");

    sheet.rows = [
      { key: "checks_per_day", value: "много" },
      { key: "rent_per_month", value: -5 },
      { key: "bar_enabled", value: "" },
      { key: "equipment_level", value: "gold" },
    ];
    await request("/control/inputs/refresh", { method: "POST", headers: { Cookie: cookie } });
    assert.deepEqual((await inputs()).inputs, { checks_per_day: 888, rent_per_month: 1200000.5, bar_enabled: false, equipment_level: "reserve" }, "rejected cells keep the last accepted values");
    const page = await request("/control/inputs", { headers: { Cookie: cookie } });
    assert.equal(page.status, 200);
    assert.match(page.headers.get("x-robots-tag") || "", /noindex/);
    const html = await page.text();
    assert.equal((html.match(/Не принято/g) || []).length, 4, "every rejected cell is explained on the inputs page");
    assert.match(html, /Чеков в день/);
    assert.match(html, /Открыть таблицу/);
    assert.ok(html.includes(sheetUrl), "the inputs page links to the sheet");
    assert.ok(!html.includes(bridgeKey), "the bridge key never reaches a page");
    assert.match(html, /<select name="value__equipment_level"/, "fixed options are edited through a list");
    assert.match(html, /<input name="value__rent_per_month"/, "free numbers are edited through a field");
    assert.deepEqual(sheet.marks.at(-1).map((item) => item.key).sort(), ["bar_enabled", "checks_per_day", "equipment_level", "rent_per_month"], "rejected cells are marked in the sheet");

    // Editing from the admin page writes only the changed cells and reports what the sheet refused.
    sheet.rows = [
      { key: "checks_per_day", value: 888 },
      { key: "rent_per_month", value: 1200000.5 },
      { key: "bar_enabled", value: "нет" },
      { key: "equipment_level", value: "reserve" },
    ];
    await request("/control/inputs/refresh", { method: "POST", headers: { Cookie: cookie } });
    assert.deepEqual(sheet.marks.at(-1), [], "accepted cells clear the marks");
    sheet.rows[1].value = 1300000;
    const saveForm = new URLSearchParams({
      value__checks_per_day: "1 000",
      value__rent_per_month: "1 250 000",
      value__bar_enabled: "да",
      value__equipment_level: "reserve",
    });
    const saved = await request("/control/inputs/save", { method: "POST", headers: { Cookie: cookie, "Content-Type": "application/x-www-form-urlencoded" }, body: saveForm });
    assert.equal(saved.status, 303);
    const notice = decodeURIComponent(new URL(saved.headers.get("location"), baseUrl).searchParams.get("m"));
    assert.match(notice, /Записано в таблицу: Чеков в день, Бар/);
    assert.match(notice, /Аренда в месяц: значение уже изменено в таблице, сейчас там «1 300 000»/);
    const lastUpdate = sheet.updates.at(-1);
    assert.deepEqual(lastUpdate.map((change) => change.key).sort(), ["bar_enabled", "checks_per_day", "rent_per_month"], "unchanged cells are not sent");
    assert.deepEqual(lastUpdate.find((change) => change.key === "checks_per_day"), { key: "checks_per_day", expected: 888, value: 1000 });
    const afterSave = await inputs();
    assert.equal(afterSave.inputs.checks_per_day, 1000);
    assert.equal(afterSave.inputs.bar_enabled, true);
    assert.equal(afterSave.inputs.rent_per_month, 1300000, "the sheet's newer value wins over the stale form");
    assert.equal((await request("/control/inputs/save", { method: "POST", body: saveForm })).status, 303, "saving requires a session");
    const badForm = new URLSearchParams({ value__checks_per_day: "abc" });
    const badSave = await request("/control/inputs/save", { method: "POST", headers: { Cookie: cookie, "Content-Type": "application/x-www-form-urlencoded" }, body: badForm });
    assert.match(decodeURIComponent(new URL(badSave.headers.get("location"), baseUrl).searchParams.get("m")), /Чеков в день: нужно число/);
    assert.equal((await inputs()).inputs.checks_per_day, 1000, "a rejected form value changes nothing");

    // A lead reaches the «Заявки» sheet without its technical fields; failures wait in a queue.
    const leadBody = { name: "Тест Тестов", contact: "+7 000 000-00-00", email: "", company: "ООО Тест", interest: "франшиза", comment: "=проверка", consent: true };
    const sent = await request("/api/contact", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(leadBody) });
    assert.equal(sent.status, 200);
    await new Promise((resolve) => setTimeout(resolve, 400));
    assert.equal(sheet.leads.length, 1, "the lead is forwarded to the sheet");
    assert.equal(sheet.leads[0].name, "Тест Тестов");
    assert.equal(sheet.leads[0].source, "colob.spi.ski");
    assert.ok(!("meta" in sheet.leads[0]) && !("consent" in sheet.leads[0]), "address and browser details stay on the server");
    assert.ok(fs.existsSync(path.join(dataDir, "contacts.jsonl")), "the server file remains the primary copy");
    sheet.mode = "down";
    await request("/api/contact", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...leadBody, name: "Второй" }) });
    await new Promise((resolve) => setTimeout(resolve, 400));
    assert.equal(sheet.leads.length, 1);
    assert.equal(fs.readFileSync(path.join(dataDir, "bridge-queue.jsonl"), "utf8").trim().split("\n").length, 1, "an undelivered lead waits in the queue");
    sheet.mode = "ok";
    await request("/control/inputs/refresh", { method: "POST", headers: { Cookie: cookie } });
    await new Promise((resolve) => setTimeout(resolve, 400));
    assert.equal(sheet.leads.length, 2, "the queue is delivered on the next contact with the sheet");
    assert.equal(sheet.leads[1].name, "Второй");
    assert.ok(!fs.existsSync(path.join(dataDir, "bridge-queue.jsonl")), "the delivered queue is removed");

    sheet.rows = [{ key: "checks_per_day", value: 999 }];
    for (const mode of ["down", "forbidden"]) {
      sheet.mode = mode;
      await request("/control/inputs/refresh", { method: "POST", headers: { Cookie: cookie } });
      const kept = await inputs();
      assert.equal(kept.source, "cache", `${mode}: the last good copy is served`);
      assert.equal(kept.inputs.checks_per_day, 1000, `${mode}: values survive a sheet failure`);
    }

    await stop(backend);
    backend = startBackend(dataDir, schemaFile);
    await waitForServer(backend);
    const afterRestart = await inputs();
    assert.equal(afterRestart.inputs.checks_per_day, 1000, "the last good copy survives a backend restart");
    assert.equal(afterRestart.inputs.rent_per_month, 1300000);
  } finally {
    await stop(backend);
    bridge.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
}

run().then(
  () => process.stdout.write("Sheet inputs integration: PASS\n"),
  (error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  },
);
