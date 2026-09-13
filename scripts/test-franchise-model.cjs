/* Deterministic browser scenarios detect wiring, storage, auth, and layout failures
 * that pure arithmetic and TypeScript cannot detect. Optional six expanded tab screenshots on explicit owner request. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { spawn } = require("node:child_process");
const root = path.resolve(__dirname, "..");
process.env.PLAYWRIGHT_BROWSERS_PATH = path.join(root, ".playwright-browsers");
const { chromium } = require("playwright");
const key = "kolobochnaya.control.franchise-model.v1";
const route = "/control/franchise-model";
const port = 19000 + (process.pid % 1000);
const base = `http://127.0.0.1:${port}`;
const password = "franchise-fixture-password";
const seed = JSON.parse(
  fs.readFileSync(
    path.join(root, "docs-platform/working/franchise-model-v0.1.json"),
    "utf8",
  ),
);
function fixture() {
  return {
    schemaVersion: 1,
    id: "working-v01",
    name: seed.name,
    custom: false,
    inputs: Object.fromEntries(seed.parameters.map((p) => [p.id, p.value])),
    edited: [],
    rollout: seed.rollout,
    expansions: [],
    capitalCalls: [],
  };
}
const get = async (p, opts = {}) => {
  const r = await fetch(base + p, { redirect: "manual", ...opts });
  const body = await r.text();
  return {
    status: r.status,
    ok: r.ok,
    headers: r.headers,
    text: async () => body,
  };
};
async function start(command, args) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kolob-franchise-"));
  const child = spawn(command, args, {
    cwd: root,
    env: {
      ...process.env,
      CONTACT_SERVER_HOST: "127.0.0.1",
      CONTACT_SERVER_PORT: String(port),
      CONTACT_DATA_DIR: dir,
      CONTACT_ADMIN_PASSWORD: password,
      CONTACT_ADMIN_SECRET: "franchise-fixture-secret",
      CONTACT_COOKIE_SECURE: "0",
      CONTROL_STATIC_ROOT: path.join(root, "control-dist"),
    },
    stdio: "ignore",
  });
  for (let i = 0; i < 150; i++) {
    try {
      if ((await get("/health")).ok) return { child, dir };
    } catch {}
    if (child.exitCode !== null) throw Error("Test server exited");
    await new Promise((r) => setTimeout(r, 50));
  }
  throw Error("Test server timeout");
}
async function stop(server) {
  const done = new Promise((r) => server.child.once("exit", r));
  server.child.kill();
  await done;
  fs.rmSync(server.dir, { recursive: true, force: true });
}
async function auth() {
  for (const p of [route, `${route}?source=direct`]) {
    const r = await get(p);
    assert.equal(r.status, 303);
    assert.match(r.headers.get("x-robots-tag"), /noindex/);
    assert.doesNotMatch(
      await r.text(),
      /Compact Production|Модель сети и франшизы/,
    );
  }
  const asset = fs
    .readdirSync(path.join(root, "control-dist/assets"))
    .find((p) => /^FranchiseModel-.*\.js$/.test(p));
  assert.ok(asset);
  assert.equal((await get(`/control/assets/${asset}`)).status, 303);
  const wrong = await get("/control/login", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ password: "wrong", next: route }),
  });
  assert.ok(wrong.status >= 400 || !wrong.headers.get("set-cookie"));
  const login = await get("/control/login", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ password, next: route }),
  });
  assert.equal(login.status, 303);
  assert.equal(login.headers.get("location"), route);
  const cookie = login.headers.get("set-cookie").split(";")[0];
  const yes = await get(route, { headers: { Cookie: cookie } });
  assert.equal(yes.status, 200);
  assert.match(yes.headers.get("x-robots-tag"), /noindex/);
  assert.match(await yes.text(), /\/control\/assets/);
  assert.equal(
    (await get(`/control/assets/${asset}`, { headers: { Cookie: cookie } }))
      .status,
    200,
  );
}
async function terminologyAudit(page) {
  const strings = await page.evaluate(() => {
    const root = document.querySelector(".control-shell");
    const items = [root.innerText];
    for (const el of root.querySelectorAll("[title], [aria-label], input, select")) {
      if (!el.getClientRects().length) continue;
      for (const name of ["title", "aria-label", "placeholder"]) {
        if (el.getAttribute(name)) items.push(el.getAttribute(name));
      }
      if (el instanceof HTMLInputElement && el.type === "text") items.push(el.value);
      if (el instanceof HTMLSelectElement) items.push(...[...el.options].map(o => o.text));
    }
    return items;
  });
  const remaining = strings.map(text => text.replace(/\b(?:EBITDA|FCF|IRR|MOIC|FTE)\b/g, ""))
    .filter(text => /[A-Za-z]/.test(text));
  assert.deepEqual(remaining, [], "User-facing terminology must be Russian, including tooltips and empty states");
}
async function expandTab(page) {
  await page.locator('[role="tabpanel"] details').evaluateAll(nodes => nodes.forEach(n => n.open = true));
  await page.locator('.fm-notice').evaluate(el => el.open = true);
}
async function run() {
  const started = Date.now();
  let scenarios = 0;
  let server = await start("python3", ["server/contact_server.py"]);
  try {
    await auth();
    scenarios++;
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    await context.addInitScript(
      ({ key }) => {
        if (!sessionStorage.getItem("test-seeded")) {
          localStorage.clear();
          localStorage.setItem(
            "kolobochnaya.investor-terminal.fixture",
            "do-not-mutate",
          );
          sessionStorage.setItem("test-seeded", "1");
        }
      },
      { key },
    );
    try {
      await page.goto(base + route);
      await page.getByRole("textbox", { name: "Пароль" }).fill(password);
      await page.getByRole("button", { name: "Открыть Control" }).click();
      await page.waitForURL(base + route);
      await page.getByTestId("fm-initial-draw").waitFor();
      assert.ok(
        await page
          .locator('.control-navigation a[href="/control/franchise-model"]')
          .isVisible(),
        "Desktop Control navigation must expose the new route",
      );
      const digits = async (id) =>
        (await page.getByTestId(id).innerText()).replace(/\s/g, "");
      assert.equal(await digits("fm-initial-draw"), "23172720,6₽");
      assert.equal(await digits("fm-burn"), "1947181,82₽");
      assert.equal(await digits("fm-franchise-ebitda"), "900000₽");
      assert.equal(await digits("fm-irr"), "Нерассчитано");
      assert.equal(
        await page.evaluate(() =>
          localStorage.getItem("kolobochnaya.investor-terminal.fixture"),
        ),
        "do-not-mutate",
      );
      assert.deepEqual(
        await page.evaluate(() =>
          Object.keys(localStorage).filter(
            (k) => k !== "kolobochnaya.investor-terminal.fixture",
          ),
        ),
        [],
        "Opening must not write another model state",
      );
      scenarios++;
      const input = (label) =>
        page.getByRole("spinbutton", { name: label, exact: true });
      await input("Операционный резерв").fill("3");
      await page.waitForFunction(() =>
        localStorage
          .getItem("kolobochnaya.control.franchise-model.v1")
          ?.includes("reserve_months"),
      );
      assert.equal(await digits("fm-initial-draw"), "21225538,78₽");
      await page.reload();
      await page.getByTestId("fm-initial-draw").waitFor();
      assert.equal(await digits("fm-initial-draw"), "21225538,78₽");
      await page
        .getByRole("button", {
          name: "Сбросить: Операционный резерв",
          exact: true,
        })
        .click();
      assert.equal(await digits("fm-initial-draw"), "23172720,6₽");
      scenarios++;
      await page.getByRole("tab", { name: /Франчайзинговая точка/ }).click();
      await input("Франчайзи: выручка в день").fill("150000");
      assert.equal(await digits("fm-franchise-ebitda"), "675000₽");
      await page
        .getByRole("combobox", { name: "Фактические расходы", exact: true })
        .selectOption("1");
      await input("Фактическая аренда").fill("1000000");
      assert.ok(
        (await page.getByTestId("fm-franchise-ebitda").innerText()).includes(
          "35",
        ),
      );
      assert.equal(await digits("fm-settlement"), "57%");
      scenarios++;
      // Clearing a required field keeps an editable INVALID form, not a render crash.
      await input("Франчайзи: средний чек").fill("");
      assert.equal(await digits("fm-initial-draw"), "Нерассчитано");
      await input("Франчайзи: средний чек").fill("1165.4");
      await page
        .getByRole("button", { name: "Сбросить к рабочему сценарию", exact: true })
        .click();
      scenarios++;
      await page
        .getByRole("button", { name: "Дублировать", exact: true })
        .click();
      await page
        .getByRole("textbox", { name: "Название сценария", exact: true })
        .fill("Тест сравнения");
      await page.getByTestId("fm-compare").locator("summary").first().click();
      await page
        .getByRole("button", { name: "Дублировать", exact: true })
        .click();
      assert.equal(
        await page.getByTestId("fm-compare").locator("thead th").count(),
        4,
      );
      await page
        .getByRole("button", { name: "Удалить сценарий", exact: true })
        .click();
      assert.equal(
        await page.getByTestId("fm-compare").locator("thead th").count(),
        3,
      );
      scenarios++;
      await page.getByRole("tab", { name: /Сеть/ }).click();
      await input("Мощность первого узла").fill("3");
      assert.ok(
        (await page.getByTestId("fm-network-table").innerText()).includes(
          "Не проверено",
        ),
      );
      await page
        .getByRole("button", { name: "Сбросить к рабочему сценарию", exact: true })
        .click();
      await page
        .getByRole("button", { name: "+ Добавить расширение", exact: true })
        .click();
      if ((await page.locator(".fm-notice").getAttribute("open")) === null)
        await page.locator(".fm-notice summary").click();
      assert.ok(
        (await page.locator(".fm-notice").innerText()).includes(
          "заполните инвестиции",
        ),
      );
      scenarios++;
      await page.getByRole("button", { name: "Сбросить к рабочему сценарию", exact: true }).click();
      await expandTab(page);
      await page.locator('.fm-reference summary').click();
      await terminologyAudit(page);
      await page.locator('.fm-reference summary').click();
      await page.getByRole("tab", { name: /Инвестор/ }).click();
      await page.getByRole("button", { name: "+ Добавить запрос финансирования", exact: true }).click();
      await expandTab(page);
      await terminologyAudit(page);
      scenarios++;
      // Fill explicit synthetic assumptions in isolated browser state. These are NOT scenario defaults.
      const s = fixture();
      Object.assign(s.inputs, {
        own_local: 200000,
        onboarding: 300000,
        point_software: 10000,
        extra_production: 20000,
        tax_profit: 0.07,
        tax_sales: 0.01,
        maintenance: 100000,
      });
      s.edited = [
        "own_local",
        "onboarding",
        "point_software",
        "extra_production",
        "tax_profit",
        "tax_sales",
        "maintenance",
      ];
      await page.evaluate(
        ({ key, s }) =>
          localStorage.setItem(
            key,
            JSON.stringify({
              schemaVersion: 1,
              activeId: s.id,
              compareIds: [s.id],
              scenarios: [s],
            }),
          ),
        { key, s },
      );
      await page.reload();
      await page.getByTestId("fm-irr").waitFor();
      assert.notEqual(await digits("fm-irr"), "Нерассчитано");
      await page.getByRole("tab", { name: /Инвестор/ }).click();
      assert.ok(
        (await page.getByTestId("fm-investor-table").innerText()).includes(
          "М60",
        ),
      );
      scenarios++;
      // All tabs, tables, dashboard, flow and compare are checked at every required width.
      for (const width of [1440, 1024, 768, 390]) {
        await page.setViewportSize({ width, height: 1000 });
        for (const label of [
          "Первый узел",
          "Собственная точка",
          "Франчайзинговая точка",
          "Головная компания",
          "Сеть",
          "Инвестор",
        ]) {
          await page.getByRole("tab", { name: new RegExp(label) }).click();
          await expandTab(page);
          await terminologyAudit(page);
          const size = await page.evaluate(() => ({
            viewport: innerWidth,
            doc: document.documentElement.scrollWidth,
            body: document.body.scrollWidth,
          }));
          assert.ok(
            size.doc <= width + 1 && size.body <= width + 1,
            `${width} ${label} overflow: ${JSON.stringify(size)}`,
          );
        }
        await page.getByTestId("fm-compare").locator("summary").click();
        await terminologyAudit(page);
        assert.ok(
          await page.getByTestId("fm-compare").locator("table").isVisible(),
        );
        await page.getByTestId("fm-compare").locator("summary").click();
        scenarios++;
      }
      assert.deepEqual(errors, []);
      if (process.argv.includes("--screenshots")) {
        const directory = path.join(root, "analysis/screenshots/franchise-model-ru-2026-09-13");
        fs.mkdirSync(directory, { recursive: true });
        const names = ["first-node", "own-point", "franchise-point", "head-company", "network", "investor"];
        const manifest = [];
        for (let tab = 0; tab < names.length; tab++) {
          const defaults = fixture();
          await page.evaluate(({key, defaults}) => localStorage.setItem(key, JSON.stringify({
            schemaVersion: 1, activeId: defaults.id, compareIds: [defaults.id], scenarios: [defaults],
          })), {key, defaults});
          await page.reload();
          await page.getByTestId("fm-initial-draw").waitFor();
          await page.setViewportSize({ width: 1440, height: 1000 });
          await page.getByRole("tab").nth(tab).click();
          // Blank editable rows expose conditional form controls without inventing costs.
          if (tab === 4) await page.getByRole("button", { name: "+ Добавить расширение", exact: true }).click();
          if (tab === 5) await page.getByRole("button", { name: "+ Добавить запрос финансирования", exact: true }).click();
          await expandTab(page);
          await terminologyAudit(page);
          assert.equal(await page.locator('[role="tabpanel"] details:not([open])').count(), 0);
          await page.evaluate(() => document.fonts.ready);
          const overflowing = await page.locator('.fm-table-scroll').evaluateAll(nodes => nodes
            .filter(n => n.scrollWidth > n.clientWidth + 1).map(n => ({width:n.clientWidth, content:n.scrollWidth})));
          assert.deepEqual(overflowing, [], "Desktop full-page capture must expose every table column");
          await page.evaluate(() => scrollTo(0, 0));
          const file = `franchise-model-${String(tab+1).padStart(2,"0")}-${names[tab]}-full.png`;
          await page.screenshot({ path: path.join(directory, file), fullPage: true });
          manifest.push({file, viewport:{width:1440,height:1000}, fullPage:true,
            title: await page.getByRole('tab').nth(tab).innerText(),
            height: await page.evaluate(() => document.documentElement.scrollHeight),
            allTabDetailsOpen:true, globalWarningsOpen:true,
            inputs: await page.locator('[role="tabpanel"] input, [role="tabpanel"] select').count(),
            state: tab===4 ? 'Working defaults plus one blank expansion editor row; no costs filled' :
              tab===5 ? 'Working defaults plus one blank manual capital call; no amount filled' : 'Working scenario defaults',
          });
        }
        fs.writeFileSync(path.join(directory, "manifest.json"), JSON.stringify(manifest,null,2));
      }
      await page.goto(base + "/control/logout");
      await page.goto(base + route);
      assert.match(page.url(), /\/control\/login/);
      scenarios++;
    } finally {
      await browser.close();
    }
  } finally {
    await stop(server);
  }
  server = await start(process.execPath, ["server/contact-server.mjs"]);
  try {
    await auth();
    scenarios++;
  } finally {
    await stop(server);
  }
  console.log(
    `Franchise Model: ${scenarios} deterministic browser/auth scenarios PASS; 4 widths, 6 tabs; ${((Date.now() - started) / 1000).toFixed(1)}s`,
  );
}
run().catch((e) => {
  console.error(e.stack);
  process.exitCode = 1;
});
