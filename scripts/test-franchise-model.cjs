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
    const root = document.querySelector(".fm-page");
    const copy = root.cloneNode(true);
    copy.querySelectorAll("[data-provenance], code").forEach((n) => n.remove());
    // innerText on the live surface respects collapsed details; ignore machine-readable source metadata.
    const items = [];
    const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (walk.nextNode()) {
      const node = walk.currentNode,
        parent = node.parentElement;
      if (
        parent.closest("[data-provenance],code") ||
        !parent.getClientRects().length
      )
        continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      if (range.getBoundingClientRect().height > 0)
        items.push(node.textContent);
    }
    for (const el of root.querySelectorAll(
      "[title], [aria-label], input, select",
    )) {
      if (!el.getClientRects().length || el.closest("[data-provenance]"))
        continue;
      for (const name of ["title", "aria-label", "placeholder"])
        if (el.getAttribute(name)) items.push(el.getAttribute(name));
      if (el instanceof HTMLInputElement && el.type === "text")
        items.push(el.value);
      if (el instanceof HTMLSelectElement)
        items.push(...[...el.options].map((o) => o.text));
    }
    return items;
  });
  const remaining = strings
    .map((t) =>
      t
        .replace(/CAPEX-\d{2}-\d{3}/g, "")
        .replace(/v0\.[12]/g, "")
        .replace(/\b(?:EBITDA|FCF|IRR|MOIC|FTE|IT|POS|KDS|BAR|GROW)\b/g, ""),
    )
    .filter((t) => /[A-Za-z]/.test(t));
  assert.deepEqual(
    [...new Set(remaining)],
    [],
    "Russian terminology; source identifiers and named equipment abbreviations are separate metadata",
  );
  const tails = strings.filter((t) =>
    /\d+[.,]\d{4,}/.test(t.replace(/\d{2}\.\d{2}\.\d{4}/g, "")),
  );
  assert.deepEqual(tails, [], "No visible long decimal tails");
  const unformatted = await page
    .locator(".fm-number input")
    .evaluateAll((nodes) =>
      nodes
        .filter(
          (n) =>
            n.getClientRects().length && /^-?\d{5,}(?:[.,]\d+)?$/.test(n.value),
        )
        .map((n) => ({ label: n.getAttribute("aria-label"), value: n.value })),
    );
  assert.deepEqual(unformatted, [], "Large numeric inputs must be grouped");
}
async function expandTab(page) {
  await page
    .locator(
      '[role="tabpanel"] details:not(.fm-detailed):not([data-provenance])',
    )
    .evaluateAll((nodes) => nodes.forEach((n) => (n.open = true)));
  await page
    .locator(".fm-quality-blocks details")
    .evaluateAll((nodes) => nodes.forEach((n) => (n.open = true)));
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
      assert.equal(await digits("fm-initial-draw"), "≈22,49млн₽");
      assert.equal(await digits("fm-burn"), "≈1,95млн₽/мес.");
      assert.equal(await digits("fm-franchise-ebitda"), "900тыс.₽/мес.");
      assert.equal(await digits("fm-irr"), "Недостаточноданных");
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
        page.getByRole("textbox", { name: label, exact: true });
      await input("Операционный резерв").fill("3");
      await page.waitForFunction(() =>
        localStorage
          .getItem("kolobochnaya.control.franchise-model.v1")
          ?.includes("reserve_months"),
      );
      assert.equal(await digits("fm-initial-draw"), "≈20,54млн₽");
      await page.reload();
      await page.getByTestId("fm-initial-draw").waitFor();
      assert.equal(await digits("fm-initial-draw"), "≈20,54млн₽");
      await page
        .getByRole("button", {
          name: "Сбросить: Операционный резерв",
          exact: true,
        })
        .click();
      assert.equal(await digits("fm-initial-draw"), "≈22,49млн₽");
      scenarios++;
      await page.getByRole("tab", { name: /Франчайзинговая точка/ }).click();
      await input("Франчайзи: выручка в день").fill("150000");
      assert.equal(await digits("fm-franchise-ebitda"), "675тыс.₽/мес.");
      await page
        .getByRole("combobox", { name: "Фактические расходы", exact: true })
        .selectOption("1");
      await input("Фактическая аренда").fill("1000000");
      await input("Фактическая аренда").blur();
      assert.equal(
        await digits("fm-franchise-ebitda"),
        "675тыс.₽/мес.",
        "Target card stays target; actual is displayed separately",
      );
      assert.match(
        await page.locator('[role="tabpanel"]').innerText(),
        /Отклонение/,
      );
      assert.equal(await digits("fm-settlement"), "57%");
      scenarios++;
      // Clearing a required field keeps an editable INVALID form, not a render crash.
      await input("Франчайзи: средний чек").fill("");
      assert.equal(await digits("fm-initial-draw"), "Недостаточноданных");
      await input("Франчайзи: средний чек").fill("1165.4");
      await page
        .getByRole("button", {
          name: "Сбросить к рабочему сценарию",
          exact: true,
        })
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
      await page
        .getByTestId("fm-network-details")
        .locator("summary")
        .first()
        .click();
      assert.ok(
        (await page.getByTestId("fm-network-table").innerText()).includes(
          "Не проверено",
        ),
      );
      await page
        .getByRole("button", {
          name: "Сбросить к рабочему сценарию",
          exact: true,
        })
        .click();
      await page
        .getByRole("button", { name: "+ Добавить расширение", exact: true })
        .click();
      await expandTab(page);
      assert.match(
        await page.locator(".fm-quality-blocks").innerText(),
        /заполните инвестиции/,
      );
      scenarios++;
      await page
        .getByRole("button", {
          name: "Сбросить к рабочему сценарию",
          exact: true,
        })
        .click();
      await expandTab(page);
      await page.locator(".fm-reference summary").click();
      await terminologyAudit(page);
      await page.locator(".fm-reference summary").click();
      await page.getByRole("tab", { name: /Инвестор/ }).click();
      await page
        .getByRole("button", {
          name: "+ Добавить запрос финансирования",
          exact: true,
        })
        .click();
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
      assert.notEqual(await digits("fm-irr"), "Недостаточноданных");
      await page.getByRole("tab", { name: /Инвестор/ }).click();
      await page
        .getByTestId("fm-investor-details")
        .locator("summary")
        .first()
        .click();
      assert.ok(
        (await page.getByTestId("fm-investor-table").innerText()).includes(
          "М60",
        ),
      );
      scenarios++;
      await page
        .getByRole("button", {
          name: "Сбросить к рабочему сценарию",
          exact: true,
        })
        .click();
      await page.reload();
      await page.getByTestId("fm-initial-draw").waitFor();
      await page.getByRole("tab", { name: /Инвестор/ }).click();
      assert.ok(await page.getByTestId("fm-investor-blocked").isVisible());
      assert.ok(await page.getByTestId("fm-shadow").isVisible());
      assert.equal(
        await page.getByTestId("fm-investor-details").getAttribute("open"),
        null,
      );
      await page.getByRole("tab", { name: /Сеть/ }).click();
      assert.equal(
        await page.getByTestId("fm-network-details").getAttribute("open"),
        null,
      );
      assert.match(await page.locator(".fm-milestones").innerText(), /М60/);
      await page.getByRole("button", { name: "Рубли", exact: true }).click();
      assert.equal(await digits("fm-settlement"), "3420000₽");
      await page.getByRole("button", { name: "Проценты", exact: true }).click();
      assert.equal(await digits("fm-settlement"), "57%");
      for (const detail of await page
        .locator(".fm-quality-blocks details")
        .all()) {
        const text = await detail.locator("summary").innerText();
        const count = Number(text.match(/\d+/)[0]);
        assert.equal(await detail.locator("li").count(), count);
      }
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
        const directory = path.join(
          root,
          "analysis/screenshots/franchise-model-v02-2026-09-13",
        );
        fs.mkdirSync(directory, { recursive: true });
        const names = [
            "first-node",
            "own-point",
            "franchise-point",
            "head-company",
            "network",
            "investor",
          ],
          manifest = [];
        await page.setViewportSize({ width: 1440, height: 1000 });
        for (let tab = 0; tab < names.length; tab++) {
          await page.evaluate((key) => localStorage.removeItem(key), key);
          await page.reload();
          await page.getByTestId("fm-initial-draw").waitFor();
          await page.getByRole("tab").nth(tab).click();
          await expandTab(page);
          await terminologyAudit(page);
          const closedInputs = await page
            .locator(
              '[role="tabpanel"] details:not([open]):not(.fm-detailed):not([data-provenance]) input',
            )
            .count();
          assert.equal(closedInputs, 0, "All active-tab input groups expanded");
          assert.equal(
            await page.locator('[role="tabpanel"] .fm-detailed[open]').count(),
            0,
            "Monthly detail tables remain collapsed",
          );
          await page.evaluate(() => document.fonts.ready);
          const overflowing = await page
            .locator(".fm-table-scroll")
            .evaluateAll((nodes) =>
              nodes
                .filter(
                  (n) =>
                    n.getClientRects().length &&
                    n.scrollWidth > n.clientWidth + 1,
                )
                .map((n) => ({ width: n.clientWidth, content: n.scrollWidth })),
            );
          assert.deepEqual(
            overflowing,
            [],
            "Desktop tables expose every column",
          );
          await page.evaluate(() => scrollTo(0, 0));
          const file = `franchise-model-${String(tab + 1).padStart(2, "0")}-${names[tab]}-full.png`;
          await page.screenshot({
            path: path.join(directory, file),
            fullPage: true,
          });
          manifest.push({
            file,
            viewport: { width: 1440, height: 1000 },
            fullPage: true,
            title: await page.getByRole("tab").nth(tab).innerText(),
            height: await page.evaluate(
              () => document.documentElement.scrollHeight,
            ),
            mainParametersExpanded: true,
            monthlyDetailsCollapsed: true,
            state: "Unmodified v0.2 working scenario",
          });
          if (tab === 0) {
            const bottom = await page
              .locator(".fm-tabs")
              .evaluate((n) => n.getBoundingClientRect().bottom + scrollY);
            await page.setViewportSize({width:1440,height:Math.ceil(bottom)});
            await page.screenshot({path:path.join(directory,'franchise-model-overview.png')});
            await page.setViewportSize({width:1440,height:1000});
          }
        }
        fs.writeFileSync(
          path.join(directory, "manifest.json"),
          JSON.stringify(manifest, null, 2),
        );
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
