const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

const projectRoot = path.resolve(__dirname, "..");
// Verification may run multiple browser domains concurrently. A per-process
// port prevents another local Vite check from taking down this scenario.
const port = Number(process.env.INVESTOR_TERMINAL_TEST_PORT ?? 9_000 + (process.pid % 1_000));
const baseUrl = `http://127.0.0.1:${port}`;
const canonicalPaths = [
  "docs-platform/working/financial-model.yaml",
  "docs-platform/generated/financial-model-projection.json",
  "docs-platform/working/investor-financial-summary.yaml",
  "docs-platform/generated/investor-financial-summary.json",
];

function sourceHashes() {
  return Object.fromEntries(canonicalPaths.map((relativePath) => [
    relativePath,
    createHash("sha256").update(fs.readFileSync(path.join(projectRoot, relativePath))).digest("hex"),
  ]));
}

async function responds() {
  try {
    const response = await fetch(baseUrl);
    return response.ok;
  } catch {
    return false;
  }
}

async function startServer() {
  if (await responds()) return { stop: async () => {} };
  const server = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", String(port), "--strictPort"], {
    cwd: projectRoot,
    env: process.env,
    stdio: "ignore",
  });
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (await responds()) return { stop: async () => { if (server.exitCode === null) server.kill("SIGTERM"); } };
    if (server.exitCode !== null) throw new Error(`Vite exited before Investor Terminal became available (${server.exitCode}).`);
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  server.kill("SIGTERM");
  throw new Error("Investor Terminal dev server did not become available.");
}

async function run() {
  process.env.PLAYWRIGHT_BROWSERS_PATH = path.join(projectRoot, ".playwright-browsers");
  const { chromium } = require("playwright");
  const server = await startServer();
  const before = sourceHashes();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.setDefaultTimeout(10_000);
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  async function amount(testId) {
    const value = await page.getByTestId(testId).getAttribute("data-amount-rub");
    assert.ok(value !== null, `${testId} exposes a numeric value`);
    return Number(value);
  }

  async function setSwitch(testId, checked) {
    const toggle = page.getByTestId(testId);
    if ((await toggle.getAttribute("aria-checked")) !== String(checked)) await toggle.click();
    await page.waitForFunction(({ id, value }) => document.querySelector(`[data-testid="${id}"]`)?.getAttribute("aria-checked") === value, { id: testId, value: String(checked) });
  }

  async function setCount(id, count) {
    const input = page.getByTestId(`scaling-cohort-count-${id}`);
    await input.fill(String(count));
    await input.press("Tab");
    await page.waitForFunction(({ id: cohortId, count: expected }) => document.querySelector(`[data-testid="scaling-cohort-count-${cohortId}"]`)?.value === String(expected), { id, count });
  }

  try {
    await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
    await page.evaluate(() => {
      window.localStorage.clear();
      window.sessionStorage.clear();
    });
    await page.goto(`${baseUrl}/investor-terminal`, { waitUntil: "domcontentloaded" });
    const checks = page.getByTestId("terminal-checks-input");
    await checks.waitFor();
    assert.match(await page.locator(".terminal-header > div > p").innerText(), /терминал инвестора/i, "the public page name is localized");
    assert.equal(await page.locator(".terminal-tabs").getAttribute("aria-label"), "Режим терминала инвестора", "the tab accessibility label is localized");
    await page.locator(".desktop-nav").getByRole("button", { name: "Инвесторам", exact: true }).click();
    assert.deepEqual(
      await page.locator(".desktop-nav .nav-dropdown.is-open .nav-dropdown-panel a").allTextContents(),
      ["Модель развития", "Материалы проекта", "Терминал инвестора", "Обсудить участие"],
      "the desktop investor menu keeps the approved release order",
    );
    await page.locator("h1").first().click();
    assert.equal(await checks.inputValue(), "300", "the Terminal opens with the approved sales baseline");
    assert.equal(await page.getByTestId("terminal-scenario-status").innerText(), "Сценарий: готовое помещение");
    assert.equal(await page.getByLabel("Арендные каникулы").inputValue(), "2", "the Base Object receives its governed rent-free default");

    const baseObjectInvestment = await amount("terminal-start-investment");
    assert.match(await page.getByTestId("terminal-start-investment").innerText(), /^\d{1,3}(?: \d{3})* ₽$/, "money uses regular spaces as thousand separators");
    assert.match(await page.getByLabel("Способ задания подготовки помещения").getAttribute("class"), /terminal-select-control/, "economy selects use the shared select control");

    await page.locator(".terminal-tabs").getByRole("button", { name: "Масштабирование" }).click();
    await page.getByRole("heading", { name: "Масштабирование" }).waitFor();
    await page.locator("#base-object-title").waitFor();
    assert.match(await page.getByText("Базовый объект объединяет первую торговую точку с посадочным залом и заготовочное производство.").innerText(), /заготовочное производство/i, "the base object is presented as the first point plus production");
    assert.equal(await amount("scaling-base-object-total"), baseObjectInvestment, "Scaling reuses the complete Point Economics base-object result");
    assert.equal(await amount("scaling-base-object-summary"), baseObjectInvestment, "the sticky summary uses the same complete base-object result");
    assert.equal(await page.getByTestId("scaling-cohort-row-cohort-1").count(), 0, "the first point is never listed as an additional point");

    const nevskyId = "rollout-nevsky-premium";
    const foodhallId = "rollout-central-high-traffic";
    const historicId = "rollout-historic-center-core";
    const kolomnaId = "rollout-historic-center-value";
    await page.getByTestId(`scaling-cohort-row-${nevskyId}`).waitFor();
    assert.equal(await page.locator('[data-testid^="scaling-cohort-row-rollout-"]').count(), 4, "fresh state starts with four rollout groups");
    assert.equal(await page.getByTestId("scaling-additional-points").innerText(), "4", "the summary states the real number of additional points");
    assert.equal(await page.getByTestId("scaling-network-points").innerText(), "5", "the base point is counted once in the network total");
    assert.equal(await page.getByTestId("scaling-network-checks").getAttribute("data-checks-per-day"), "1015", "network checks aggregate the base object and the four approved additional profiles");
    assert.equal(await page.getByTestId(`scaling-rollout-4`).getAttribute("class"), "is-selected", "the four-point rollout is selected by default");
    assert.equal(await page.getByTestId(`scaling-cohort-area-${nevskyId}`).inputValue(), "40");
    assert.equal(await page.getByTestId(`scaling-cohort-checks-${nevskyId}`).inputValue(), "175");
    assert.equal(await page.getByTestId(`scaling-cohort-minimum-staff-${nevskyId}`).innerText(), "3", "the compact-point rounding band keeps 175 checks at three people on shift");
    assert.equal(await page.getByTestId(`scaling-cohort-bar-${nevskyId}`).getAttribute("aria-checked"), "true", "the optional bar is on for rollout points by default");
    assert.equal(await page.getByTestId(`scaling-cohort-opening-${nevskyId}`).inputValue(), "4", "the first additional point has its own opening month");
    assert.equal(await page.getByTestId(`scaling-cohort-rent-free-${nevskyId}`).inputValue(), "2", "Creative Cluster has the approved two-month rent-free period");
    assert.match(await page.getByTestId(`scaling-cohort-editor-${nevskyId}`).innerText(), /Разгон[\s\S]*Сезонность/i, "the selected group makes the time model visible without a 60-month form");

    await page.getByTestId(`scaling-cohort-row-${historicId}`).click();
    assert.equal(await page.getByTestId(`scaling-cohort-area-${historicId}`).inputValue(), "60", "the standalone seating rollout point respects the 60 m² minimum");
    assert.equal(await page.getByTestId(`scaling-cohort-rent-rate-${historicId}`).inputValue(), "3 500");
    assert.equal(await page.getByTestId(`scaling-cohort-rent-${historicId}`).inputValue(), "210 000");
    assert.equal(await page.getByLabel("Предоплата").inputValue(), "12", "street rent defaults to twelve months prepaid rent");
    assert.equal(await page.getByLabel("Обеспечительный платёж").inputValue(), "2", "street rent defaults to a two-month deposit");
    assert.equal(await page.getByLabel("Коммунальные / месяц").inputValue(), "80 000", "the approved street-seating utility default is placed directly in the field");
    assert.equal(await page.getByLabel("Видеонаблюдение").inputValue(), "70 000", "the approved street security default is placed directly in the field");
    await page.getByTestId(`scaling-cohort-rent-${historicId}`).fill("220000");
    await page.getByTestId(`scaling-cohort-rent-${historicId}`).press("Tab");
    assert.equal(await page.getByTestId(`scaling-cohort-rent-${historicId}`).inputValue(), "220 000", "money inputs format with spaces after blur");
    await page.waitForTimeout(100);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.locator(".terminal-tabs").getByRole("button", { name: "Масштабирование" }).click();
    await page.getByTestId(`scaling-cohort-row-${historicId}`).click();
    assert.equal(await page.getByTestId(`scaling-cohort-rent-${historicId}`).inputValue(), "220 000", "manual rent persists after refresh");
    await page.getByTestId("terminal-reset").click();
    assert.equal(await page.getByTestId(`scaling-cohort-row-${historicId}`).count(), 1, "reset restores the four approved rollout groups");
    await page.getByTestId(`scaling-cohort-row-${foodhallId}`).click();
    assert.equal(await page.getByTestId(`scaling-cohort-area-${foodhallId}`).inputValue(), "25", "Foodhall uses its compact area profile");
    assert.equal(await page.getByTestId(`scaling-cohort-checks-${foodhallId}`).inputValue(), "215", "Foodhall keeps its own traffic profile");
    assert.equal(await page.getByTestId(`scaling-cohort-minimum-staff-${foodhallId}`).innerText(), "5", "Foodhall traffic reaches the high-load staffing profile");
    assert.equal(await page.getByTestId(`scaling-cohort-rent-${foodhallId}`).count(), 0, "Foodhall does not inherit the street-rent input");
    assert.equal(await page.getByLabel("Процент площадке").inputValue(), "17", "Foodhall receives its revenue-share default from the planning model");
    assert.equal(await page.getByLabel("Минимальный платёж").inputValue(), "250 000", "Foodhall receives its minimum-payment default from the planning model");
    assert.equal(await page.getByLabel("Эксплуатация и коммунальные").inputValue(), "50 000", "Foodhall receives its service-and-utilities default from the planning model");
    assert.equal(await page.getByLabel("Склад").inputValue(), "20 000", "Foodhall receives its storage default from the planning model");
    assert.equal(await page.getByTestId(`scaling-cohort-editor-${foodhallId}`).locator(".cohort-static-value output").count(), 3, "Foodhall visibly excludes street prepayment, deposit and rent holidays");
    assert.match(await page.getByTestId(`scaling-cohort-editor-${foodhallId}`).innerText(), /Подготовка помещения\s*712 500 ₽/i, "Foodhall includes its venue adaptation preparation by default");
    assert.equal(await page.getByTestId(`scaling-cohort-preparation-${foodhallId}`).getByText("Показать состав").count(), 1);
    await page.getByTestId(`scaling-cohort-preparation-${foodhallId}`).getByText("Показать состав").click();
    const foodhallPreparation = page.getByTestId(`scaling-cohort-preparation-${foodhallId}`);
    assert.match(await foodhallPreparation.innerText(), /Общестроительная адаптация[\s\S]*375 000 ₽/i, "Foodhall preparation exposes the category calculation");
    assert.equal(await foodhallPreparation.locator("label").filter({ hasText: "Электроснабжение" }).locator("input").isChecked(), false, "Foodhall engineering categories remain optional");
    assert.match(await foodhallPreparation.innerText(), /Подготовка торгового зала[\s\S]*Не применяется/i, "Foodhall shared seating excludes guest-area preparation");
    await page.getByTestId(`scaling-cohort-row-${nevskyId}`).click();
    assert.equal(await page.getByTestId(`scaling-cohort-rent-rate-${nevskyId}`).inputValue(), "4 000", "Creative Cluster receives its rent-rate default from the planning model");
    assert.equal(await page.getByTestId(`scaling-cohort-rent-${nevskyId}`).inputValue(), "160 000", "Creative Cluster receives its monthly rent default from the planning model");
    assert.equal(await page.getByLabel("Предоплата").inputValue(), "1", "Creative Cluster receives its one-month prepayment default");
    assert.equal(await page.getByLabel("Обеспечительный платёж").inputValue(), "1", "Creative Cluster receives its one-month deposit default");
    assert.equal(await page.getByLabel("Коммунальные и эксплуатационные расходы").inputValue(), "30 000", "Creative Cluster receives its utility default from the planning model");
    assert.notEqual(await page.getByTestId("scaling-rollout-8").getAttribute("class"), "is-selected", "the default distribution remains four points before a preset change");
    await page.getByTestId("scaling-rollout-8").click();
    assert.equal(await page.getByTestId("scaling-network-points").innerText(), "9", "eight additional points create a nine-point network with the base object");
    await page.getByTestId("scaling-rollout-12").click();
    assert.equal(await page.getByTestId("scaling-network-points").innerText(), "13", "twelve additional points create a thirteen-point network with the base object");
    await page.getByTestId("terminal-reset").click();
    const foodhallRow = page.getByTestId(`scaling-cohort-row-${foodhallId}`);
    if ((await foodhallRow.getAttribute("aria-expanded")) !== "true") await foodhallRow.click();

    assert.match(await page.getByLabel("График производства").getAttribute("class"), /terminal-select-control/, "production schedule uses the shared select control");
    assert.match(await page.getByTestId("scaling-add-format").getAttribute("class"), /terminal-select-control/, "add-group controls use the shared select control");
    const sharedInvestment = await amount("scaling-shared-investment");
    const additionalInvestment = await amount("scaling-additional-investment");
    const expansionReserve = await amount("scaling-expansion-reserve");
    assert.ok(Math.abs((await amount("scaling-network-total")) - (baseObjectInvestment + additionalInvestment + sharedInvestment + expansionReserve)) < 0.01, "network investment includes base, additional point launch, shared infrastructure and the separate expansion reserve exactly once");

    await page.setViewportSize({ width: 1440, height: 650 });
    const stickySummary = await page.locator(".scaling-results").evaluate((element) => ({
      position: getComputedStyle(element).position,
      overflowY: getComputedStyle(element).overflowY,
      maxHeight: getComputedStyle(element).maxHeight,
      scrollHeight: element.scrollHeight,
      clientHeight: element.clientHeight,
      scrollTop: (() => { element.scrollTop = element.scrollHeight; return element.scrollTop; })(),
    }));
    assert.equal(stickySummary.position, "sticky", "desktop summary remains pinned below the site header");
    assert.equal(stickySummary.overflowY, "auto", "desktop summary has independent overflow when the viewport is short");
    assert.ok(stickySummary.maxHeight !== "none" && stickySummary.scrollHeight >= stickySummary.clientHeight && stickySummary.scrollTop > 0, "lower summary rows remain reachable inside the sticky summary");
    const summary = page.locator(".scaling-results");
    async function moveToSummary() {
      const box = await summary.boundingBox();
      assert.ok(box, "sticky summary remains visible for pointer interaction");
      await page.mouse.move(box.x + Math.min(40, box.width / 2), box.y + Math.min(80, box.height / 2));
    }
    await page.evaluate(() => {
      window.scrollTo(0, 500);
      const element = document.querySelector(".scaling-results");
      if (element) element.scrollTop = 0;
    });
    await moveToSummary();
    const summaryBeforeWheel = await summary.evaluate((element) => element.scrollTop);
    await page.mouse.wheel(0, 240);
    await page.waitForTimeout(120);
    assert.ok(await summary.evaluate((element) => element.scrollTop) > summaryBeforeWheel, "wheel over the summary scrolls its reachable inner rows");
    await summary.evaluate((element) => { element.scrollTop = element.scrollHeight - element.clientHeight; });
    await moveToSummary();
    const pageBeforeLowerBoundary = await page.evaluate(() => window.scrollY);
    await page.mouse.wheel(0, 480);
    await page.waitForTimeout(120);
    assert.ok(await page.evaluate(() => window.scrollY) > pageBeforeLowerBoundary, "wheel continues to the document after the summary reaches its lower boundary");
    await page.locator(".scaling-section.is-unresolved").evaluate((element) => {
      element.scrollIntoView({ block: "center" });
      const summaryElement = document.querySelector(".scaling-results");
      if (summaryElement) summaryElement.scrollTop = 0;
    });
    await page.waitForTimeout(120);
    await moveToSummary();
    const pageBeforeUpperBoundary = await page.evaluate(() => window.scrollY);
    assert.ok(pageBeforeUpperBoundary > 0, "upper-boundary test starts below the top of the document");
    await page.mouse.wheel(0, -480);
    await page.waitForTimeout(120);
    assert.ok(await page.evaluate(() => window.scrollY) < pageBeforeUpperBoundary, "wheel continues to the document after the summary reaches its upper boundary");
    const leftColumnTarget = page.locator(".cohort-table");
    await leftColumnTarget.evaluate((element) => element.scrollIntoView({ block: "center" }));
    await page.waitForTimeout(120);
    const pageBeforeLeftColumn = await page.evaluate(() => window.scrollY);
    assert.ok(pageBeforeLeftColumn > 0, "left-column test starts below the top of the document");
    assert.equal(await page.evaluate(() => Boolean(document.elementFromPoint(120, 450)?.closest(".scaling-results"))), false, "left-column pointer target is outside the summary");
    await page.mouse.move(120, 450);
    await page.mouse.wheel(0, 360);
    await page.waitForTimeout(120);
    const pageAfterLeftColumn = await page.evaluate(() => window.scrollY);
    assert.notEqual(pageAfterLeftColumn, pageBeforeLeftColumn, `wheel over the left column always scrolls the document (${pageBeforeLeftColumn} → ${pageAfterLeftColumn})`);
    await page.evaluate(() => {
      window.scrollTo(0, Math.max(0, document.documentElement.scrollHeight - window.innerHeight - 700));
      const element = document.querySelector(".scaling-results");
      if (element) element.scrollTop = 0;
    });
    await moveToSummary();
    const summaryBeforePageEnd = await summary.evaluate((element) => element.scrollTop);
    await page.mouse.wheel(0, 240);
    await page.waitForTimeout(120);
    assert.ok(await summary.evaluate((element) => element.scrollTop) > summaryBeforePageEnd, "summary remains responsive near the end of the page");
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.evaluate(() => {
      window.scrollTo(0, 0);
      const element = document.querySelector(".scaling-results");
      if (element) element.scrollTop = 0;
    });
    await page.screenshot({ path: path.join(projectRoot, ".cache/verification/screenshots/investor-terminal-ui-review-normal-desktop.png"), fullPage: true });

    await page.getByRole("button", { name: /Показать статьи/ }).click();
    await page.locator("details.base-object-details, details.cohort-rent-preset-reference, details.cohort-preparation-details, details.cohort-items, details.cohort-temporal-details, details.scaling-item").evaluateAll((elements) => elements.forEach((element) => { element.open = true; }));
    await page.addStyleTag({ content: ".site-header, .scaling-results { position: static !important; max-height: none !important; overflow: visible !important; }" });
    await page.screenshot({ path: path.join(projectRoot, ".cache/verification/screenshots/investor-terminal-ui-review-full-desktop.png"), fullPage: true });
    await page.screenshot({ path: path.join(projectRoot, ".cache/verification/screenshots/investor-terminal-ui-review-audit-desktop.png"), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator("details.base-object-details, details.cohort-rent-preset-reference, details.cohort-preparation-details, details.cohort-items, details.cohort-temporal-details, details.scaling-item").evaluateAll((elements) => elements.forEach((element) => { element.open = false; }));
    if (await page.getByRole("button", { name: "Скрыть список" }).count()) await page.getByRole("button", { name: "Скрыть список" }).click();
    await page.screenshot({ path: path.join(projectRoot, ".cache/verification/screenshots/investor-terminal-ui-review-mobile.png"), fullPage: true });
    await page.getByRole("button", { name: "Открыть меню", exact: true }).click();
    await page.getByRole("button", { name: /Инвесторам/ }).click();
    assert.deepEqual(
      await page.locator(".mobile-nav-group.is-open .mobile-nav-submenu a").allTextContents(),
      ["Модель развития", "Материалы проекта", "Терминал инвестора", "Обсудить участие"],
      "the mobile investor menu keeps the approved release order",
    );
    await page.getByRole("button", { name: "Закрыть меню", exact: true }).click();
    await page.setViewportSize({ width: 1440, height: 900 });

    await page.getByRole("button", { name: "Экономика точки" }).click();
    await checks.waitFor();
    assert.equal(await checks.inputValue(), "300", "reset restores the approved traffic baseline too");
    await page.getByRole("button", { name: "Показать состав", exact: true }).click();
    await page.screenshot({ path: path.join(projectRoot, ".cache/verification/screenshots/investor-terminal-base-object-preparation-audit-desktop.png"), fullPage: true });

    for (const route of ["/revenue-model", "/launch-budget", "/economics"]) {
      const response = await page.goto(`${baseUrl}${route}`, { waitUntil: "domcontentloaded" });
      assert.ok(response && response.status() < 400, `legacy route remains available: ${route}`);
      await page.locator("h1").first().waitFor();
    }

    assert.deepEqual(sourceHashes(), before, "browser runtime did not alter canonical sources");
    assert.deepEqual(pageErrors, [], `page errors: ${pageErrors.join(" | ")}`);
  } finally {
    await context.close();
    await browser.close();
    await server.stop();
  }
}

run().then(
  () => process.stdout.write("Investor Terminal browser scenario: PASS\n"),
  (error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  },
);
