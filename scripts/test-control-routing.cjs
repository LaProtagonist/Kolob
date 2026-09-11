const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const projectRoot = path.resolve(__dirname, "..");
const controlRoot = path.join(projectRoot, "control-dist");
const distRoot = path.join(projectRoot, "dist");
const port = Number(process.env.CONTROL_ROUTING_TEST_PORT || 18_000 + (process.pid % 1_000));
const baseUrl = `http://127.0.0.1:${port}`;
const password = "control-routing-test-password";
const controlRoutes = [
  ["/control", "Control"],
  ["/control/franchise-platform", "Стратегия масштабирования сети"],
  ["/control/capex", "CAPEX-конфигуратор"],
  ["/control/launch-budget", "Расчёт стоимости запуска"],
  ["/control/revenue", "Расчёт объёма продаж"],
  ["/control/economics", "Экономика объекта"],
];
const legacyRedirects = new Map([
  ["/investor/franchise-platform/petrogradka", "/petrogradka"],
  ["/investor/franchise-platform", "/control/franchise-platform"],
  ["/capex-configurator", "/control/capex"],
  ["/launch-budget", "/control/launch-budget"],
  ["/revenue-model", "/control/revenue"],
  ["/economics", "/control/economics"],
]);

function read(file) {
  return fs.readFileSync(file, "utf8");
}

function responseCookie(response) {
  const values = typeof response.headers.getSetCookie === "function"
    ? response.headers.getSetCookie()
    : [response.headers.get("set-cookie")].filter(Boolean);
  assert.ok(values.length, "login must set a session cookie");
  return values[0].split(";", 1)[0];
}

async function request(pathname, options = {}) {
  return fetch(`${baseUrl}${pathname}`, { redirect: "manual", ...options });
}

async function waitForServer(child) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      if ((await request("/health")).status === 200) return;
    } catch {
      // The service is still starting.
    }
    if (child.exitCode !== null) throw new Error(`Control test backend exited with ${child.exitCode}`);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Control test backend did not become ready");
}

function assertProductionArtifacts() {
  assert.ok(fs.existsSync(path.join(controlRoot, "control.html")), "Control build must exist before access testing");
  assert.ok(fs.existsSync(path.join(distRoot, "petrogradka", "index.html")), "Petrogradka must be prerendered");
  assert.ok(!fs.existsSync(path.join(distRoot, "__review")), "deployable dist must not contain __review");

  const petrogradka = read(path.join(distRoot, "petrogradka", "index.html"));
  assert.match(petrogradka, /<meta name="robots" content="noindex, nofollow"/);
  assert.match(petrogradka, /<link rel="canonical" href="https:\/\/colob\.spi\.ski\/petrogradka"/);
  assert.match(petrogradka, /<meta property="og:url" content="https:\/\/colob\.spi\.ski\/petrogradka"/);
  assert.doesNotMatch(petrogradka, /href="\/control|href="\/investor\/franchise-platform/);

  const terminal = read(path.join(distRoot, "investor-terminal", "index.html"));
  assert.match(terminal, /<meta name="robots" content="noindex, nofollow"/);
  assert.match(terminal, /href="\/investor-terminal"/);
  assert.doesNotMatch(terminal, /href="\/control|href="\/capex-configurator|href="\/launch-budget|href="\/revenue-model|href="\/economics|href="\/investor\/franchise-platform/);

  const sitemap = read(path.join(distRoot, "sitemap.xml"));
  for (const privatePath of ["/investor-terminal", "/petrogradka", "/control", ...legacyRedirects.keys()]) {
    assert.equal(sitemap.includes(privatePath), false, `sitemap must not include ${privatePath}`);
  }

  const publicFiles = fs.readdirSync(path.join(distRoot, "assets"))
    .filter((file) => file.endsWith(".js") || file.endsWith(".css"))
    .map((file) => read(path.join(distRoot, "assets", file)))
    .join("\n");
  for (const protectedCopy of [
    "CAPEX-конфигуратор",
    "Стратегия масштабирования сети",
    "Расчёт стоимости запуска",
    "Стоимость текущей комплектации оборудования",
    "hidden_internal_document_ids",
    "decision_boundaries",
    "priceResearch",
    "sourceHashes",
    "googleUrl",
    "/control/",
    "/investor/franchise-platform",
  ]) {
    assert.equal(publicFiles.includes(protectedCopy), false, `public assets expose protected content: ${protectedCopy}`);
  }

  const caddy = read(path.join(projectRoot, "scripts", "activate-colob-caddy-route.remote.sh"));
  assert.match(caddy, /@kolob_review path \/__review \/__review\/\*/);
  assert.match(caddy, /respond 404/);
  assert.match(caddy, /\/control \/control\/\*/);
}

async function run() {
  assertProductionArtifacts();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "kolob-control-routing-"));
  const server = spawn("python3", ["server/contact_server.py"], {
    cwd: projectRoot,
    env: {
      ...process.env,
      CONTACT_SERVER_HOST: "127.0.0.1",
      CONTACT_SERVER_PORT: String(port),
      CONTACT_DATA_DIR: dataDir,
      CONTACT_ADMIN_PASSWORD: password,
      CONTACT_ADMIN_SECRET: "control-routing-test-secret",
      CONTACT_COOKIE_SECURE: "0",
      CONTROL_STATIC_ROOT: controlRoot,
    },
    stdio: "ignore",
  });

  try {
    await waitForServer(server);

    for (const [route] of controlRoutes) {
      const response = await request(`${route}?source=direct`);
      assert.equal(response.status, 303, `${route} must require a server-side session`);
      assert.match(response.headers.get("location") || "", /^\/control\/login\?next=/);
      assert.match(response.headers.get("x-robots-tag") || "", /noindex/);
      assert.doesNotMatch(await response.text(), /CAPEX-конфигуратор|Стратегия масштабирования сети/);
    }

    const controlHtml = read(path.join(controlRoot, "control.html"));
    const firstAsset = controlHtml.match(/src="(\/control\/assets\/[^\"]+)"/)?.[1];
    assert.ok(firstAsset, "Control HTML must reference an asset under /control/assets");
    const unauthenticatedAsset = await request(firstAsset);
    assert.equal(unauthenticatedAsset.status, 303, "Control JavaScript asset must not be served before authentication");

    for (const [source, target] of legacyRedirects) {
      const response = await request(`${source}?from=legacy`);
      assert.equal(response.status, 308, `${source} must return a permanent HTTP redirect`);
      assert.equal(response.headers.get("location"), `${target}?from=legacy`);
    }

    const authenticated = await request("/control/login", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ password, next: "/control/capex" }),
    });
    assert.equal(authenticated.status, 303);
    assert.equal(authenticated.headers.get("location"), "/control/capex");
    const cookie = responseCookie(authenticated);

    for (const [route] of controlRoutes) {
      const response = await request(route, { headers: { Cookie: cookie } });
      assert.equal(response.status, 200, `${route} opens with the shared session`);
      assert.match(response.headers.get("x-robots-tag") || "", /noindex/);
      assert.match(await response.text(), /\/control\/assets\//);
    }
    const leads = await request("/leads", { headers: { Cookie: cookie } });
    assert.equal(leads.status, 200, "the Control session must also authorize /leads");
    assert.match(leads.headers.get("x-robots-tag") || "", /noindex/);
    assert.equal((await request("/api/leads")).status, 401, "unauthorized leads API remains protected");
    assert.equal((await request("/api/leads.csv", { headers: { Cookie: cookie } })).status, 200, "CSV export keeps working with the shared session");

    process.env.PLAYWRIGHT_BROWSERS_PATH = path.join(projectRoot, ".playwright-browsers");
    const { chromium } = require("playwright");
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    try {
      await page.goto(`${baseUrl}/control/capex?source=browser`, { waitUntil: "networkidle" });
      assert.match(page.url(), /\/control\/login\?next=/);
      await page.locator('input[name="password"]').fill(password);
      await page.getByRole("button", { name: "Открыть Control" }).click();
      await page.waitForURL(`${baseUrl}/control/capex?source=browser`);
      await page.getByRole("heading", { name: "CAPEX-конфигуратор" }).waitFor();

      for (const [route, heading] of controlRoutes) {
        await page.goto(`${baseUrl}${route}`, { waitUntil: "networkidle" });
        assert.ok((await page.locator("h1").first().innerText()).includes(heading), `${route} renders its protected page`);
        await page.reload({ waitUntil: "networkidle" });
        assert.ok((await page.locator("h1").first().innerText()).includes(heading), `${route} persists after reload`);
      }

      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(`${baseUrl}/control`, { waitUntil: "networkidle" });
      await page.locator('summary[aria-label="Навигация Control"]').click();
      assert.equal(await page.locator('.control-navigation nav a[href="/control/economics"]').count(), 1, "mobile Control navigation exposes every internal tool");
      const size = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
      assert.ok(size.document <= size.viewport + 1 && size.body <= size.viewport + 1, `Control mobile overflow: ${JSON.stringify(size)}`);

      await page.goto(`${baseUrl}/control/logout`, { waitUntil: "networkidle" });
      assert.match(page.url(), /\/control\/login$/);
      const afterLogout = await request("/control/economics");
      assert.equal(afterLogout.status, 303, "protected content closes immediately after logout");
    } finally {
      await context.close();
      await browser.close();
    }
  } finally {
    if (server.exitCode === null) server.kill("SIGTERM");
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
}

run().then(
  () => process.stdout.write("Control routing and auth integration: PASS\n"),
  (error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  },
);
