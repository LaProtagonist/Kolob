const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

const projectRoot = path.resolve(__dirname, "..");
const baseUrl = "http://127.0.0.1:5182";
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
  const server = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", "5182", "--strictPort"], {
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
  page.setDefaultTimeout(5_000);
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
    assert.equal(await checks.inputValue(), "300", "the Terminal opens with the canonical baseline");
    assert.equal(await page.getByTestId("terminal-scenario-status").innerText(), "Financial Model baseline");

    await page.locator(".terminal-tabs").getByRole("button", { name: "Масштабирование" }).click();
    await page.getByRole("heading", { name: "Масштабирование" }).waitFor();
    assert.equal(await page.getByTestId("scaling-production-multiplier").innerText(), "×1", "production is explicitly created once");
    const production = await amount("scaling-production-investment");
    await setSwitch("scaling-grow-toggle", true);

    assert.equal(await page.getByTestId("scaling-cohort-row-cohort-2").count(), 0, "fresh state has no demo cohorts");
    assert.match(await page.getByTestId("scaling-cohort-row-cohort-1").innerText(), /С посадочным залом[\s\S]*Аренда[\s\S]*×1/, "fresh state starts with one rented seating point");
    await page.getByTestId("scaling-cohort-editor-cohort-1").waitFor();
    for (const label of ["Площадь помещения", "Рабочая зона", "Посадочный зал", "Аренда в месяц", "Подготовка точки"]) {
      assert.equal(await page.getByLabel(label).inputValue(), "", `${label} is unknown instead of inherited from the integrated object`);
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: path.join(projectRoot, ".cache/verification/screenshots/investor-terminal-v22-desktop.png"), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(100);
    await page.screenshot({ path: path.join(projectRoot, ".cache/verification/screenshots/investor-terminal-v22-mobile.png"), fullPage: true });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(100);

    // The neutral point can then be configured deterministically by the investor.
    await setCount("cohort-1", 5);
    await page.getByTestId("scaling-cohort-rent-cohort-1").fill("350000");
    await page.getByTestId("scaling-cohort-rent-cohort-1").press("Tab");
    await setSwitch("scaling-cohort-bar-cohort-1", true);
    const seatingUnit = await amount("scaling-cohort-unit-cohort-1");
    assert.equal(await amount("scaling-cohort-total-cohort-1"), seatingUnit * 5, "seating cohort aggregates by its own count");
    await page.getByTestId("scaling-cohort-editor-cohort-1").locator("details.cohort-items > summary").click();
    const seatingItems = await page.getByTestId("scaling-cohort-editor-cohort-1").innerText();
    assert.match(seatingItems, /Мебель посадочного зала/, "seating cohort includes furniture");
    assert.match(seatingItems, /Бар и напитки/, "bar applies to the seating cohort only");

    await page.getByTestId("scaling-add-format").selectOption("takeaway");
    await page.getByTestId("scaling-add-estate").selectOption("rent");
    await page.getByTestId("scaling-add-cohort").click();
    await page.getByTestId("scaling-cohort-editor-cohort-2").waitFor();
    assert.equal(await page.getByTestId("scaling-cohort-count-cohort-2").inputValue(), "1", "new cohort count defaults to one");
    for (const label of ["Площадь помещения", "Рабочая зона", "Аренда в месяц", "Подготовка точки"]) {
      assert.equal(await page.getByLabel(label).inputValue(), "", `new takeaway ${label} is not copied from another cohort`);
    }
    await setCount("cohort-2", 10);
    await page.getByTestId("scaling-cohort-rent-cohort-2").fill("210000");
    await page.getByTestId("scaling-cohort-rent-cohort-2").press("Tab");
    await setSwitch("scaling-cohort-bar-cohort-2", false);
    const takeawayUnit = await amount("scaling-cohort-unit-cohort-2");
    assert.equal(await amount("scaling-cohort-total-cohort-2"), takeawayUnit * 10, "takeaway cohort aggregates independently");
    await page.getByTestId("scaling-cohort-editor-cohort-2").locator("details.cohort-items > summary").click();
    const takeawayItems = await page.getByTestId("scaling-cohort-editor-cohort-2").innerText();
    assert.match(await page.getByTestId("scaling-cohort-row-cohort-2").innerText(), /Только на вынос/, "takeaway format is explicit in the table");
    assert.doesNotMatch(takeawayItems, /Бар и напитки/, "bar is not inherited by a different cohort");
    assert.match(takeawayItems, /Мебель посадочного зала[\s\S]*Не применяется/, "takeaway does not include seating furniture");
    assert.equal(await amount("scaling-production-investment"), production, "production and grow remain ×1 while cohorts change");

    await page.getByTestId("scaling-add-format").selectOption("takeaway");
    await page.getByTestId("scaling-add-estate").selectOption("purchase");
    await page.getByTestId("scaling-add-cohort").click();
    await page.getByTestId("scaling-cohort-editor-cohort-3").waitFor();
    assert.equal(await page.getByTestId("scaling-cohort-estate-cohort-3").inputValue(), "purchase", "purchase is configured per cohort, not globally");
    assert.equal(await page.getByTestId("scaling-cohort-count-cohort-3").inputValue(), "1", "new purchase cohort count defaults to one");
    assert.equal(await page.getByTestId("scaling-cohort-rent-cohort-3").count(), 0, "purchase cohort has no rent entry input");
    assert.equal(await page.getByTestId("scaling-cohort-purchase-cohort-3").count(), 1, "purchase cohort has its own property input");
    assert.equal(await page.getByTestId("scaling-cohort-purchase-cohort-3").inputValue(), "", "purchase price is not inherited from the integrated object");
    await page.getByTestId("scaling-cohort-purchase-cohort-3").fill("27000000");
    await page.getByTestId("scaling-cohort-purchase-cohort-3").press("Tab");
    assert.notEqual(await amount("scaling-cohort-unit-cohort-3"), takeawayUnit, "rent and purchase entry costs are not mixed");

    const expectedTotal = production + seatingUnit * 5 + takeawayUnit * 10 + await amount("scaling-cohort-unit-cohort-3");
    assert.equal(await amount("scaling-confirmed-total"), expectedTotal, "network total sums only production and independently confirmed cohorts");
    assert.equal(await page.getByTestId("scaling-unresolved").count(), 0, "unresolved items stay collapsed by default");
    await page.getByRole("button", { name: /Показать статьи/ }).click();
    const unresolvedMultipliers = await page.getByTestId("scaling-unresolved").locator("[data-multiplier]").evaluateAll((items) => items.map((item) => item.getAttribute("data-multiplier")));
    assert.ok(unresolvedMultipliers.length > 0 && unresolvedMultipliers.every((multiplier) => multiplier === "not_aggregated"), "unallocated items stay out of the confirmed total");
    assert.doesNotMatch(await page.getByTestId("scaling-cohort-editor-cohort-3").innerText(), /Стоимость открытия одной точки/, "partial point cost is not labelled as a full opening cost");
    await page.getByRole("button", { name: "Скрыть список" }).click();

    await page.getByRole("button", { name: "Вернуться к экономике точки" }).click();
    await checks.waitFor();
    assert.match(await page.getByTestId("terminal-point-configuration").innerText(), /с посадочным залом[\s\S]*аренда[\s\S]*бар включён/, "the compatible first cohort is preserved on Point Economics");
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.locator(".terminal-tabs").getByRole("button", { name: "Масштабирование" }).click();
    await page.getByTestId("scaling-cohort-row-cohort-3").waitFor();
    assert.equal(await page.getByTestId("scaling-cohort-count-cohort-1").inputValue(), "5", "first cohort is persisted after refresh");
    assert.match(await page.getByTestId("scaling-cohort-row-cohort-1").innerText(), /×5/);
    assert.match(await page.getByTestId("scaling-cohort-row-cohort-2").innerText(), /×10/);

    await page.getByTestId("terminal-reset").click();
    await page.getByTestId("scaling-cohort-row-cohort-1").waitFor();
    assert.equal(await page.getByTestId("scaling-cohort-row-cohort-2").count(), 0, "reset restores the canonical single-cohort state");
    assert.match(await page.getByTestId("scaling-cohort-row-cohort-1").innerText(), /С посадочным залом[\s\S]*Аренда[\s\S]*×1/, "reset restores the neutral point structure");
    assert.equal(await page.getByLabel("Площадь помещения").inputValue(), "", "reset restores nullable planning inputs");
    await page.getByRole("button", { name: "Экономика точки" }).click();
    await checks.waitFor();
    assert.equal(await checks.inputValue(), "300", "reset restores canonical traffic too");

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
