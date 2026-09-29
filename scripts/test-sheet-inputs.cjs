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

const sheet = { rows: [], mode: "ok", requests: 0 };

function startBridge() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://127.0.0.1:${bridgePort}`);
    sheet.requests += 1;
    if (sheet.mode === "down") {
      res.writeHead(500, { "Content-Type": "text/html" });
      res.end("<html>error</html>");
      return;
    }
    const allowed = url.searchParams.get("key") === bridgeKey && sheet.mode !== "forbidden";
    const payload = !allowed
      ? { ok: false, error: "ключ не подходит" }
      : url.searchParams.get("action") === "inputs"
        ? { ok: true, readAt: new Date().toISOString(), inputs: sheet.rows }
        : { ok: false, error: "неизвестное действие" };
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

    sheet.rows = [{ key: "checks_per_day", value: 999 }];
    for (const mode of ["down", "forbidden"]) {
      sheet.mode = mode;
      await request("/control/inputs/refresh", { method: "POST", headers: { Cookie: cookie } });
      const kept = await inputs();
      assert.equal(kept.source, "cache", `${mode}: the last good copy is served`);
      assert.equal(kept.inputs.checks_per_day, 888, `${mode}: values survive a sheet failure`);
    }

    await stop(backend);
    backend = startBackend(dataDir, schemaFile);
    await waitForServer(backend);
    const afterRestart = await inputs();
    assert.equal(afterRestart.inputs.checks_per_day, 888, "the last good copy survives a backend restart");
    assert.equal(afterRestart.inputs.rent_per_month, 1200000.5);
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
