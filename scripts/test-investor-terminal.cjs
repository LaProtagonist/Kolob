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
    if (await responds()) {
      return {
        stop: async () => {
          if (server.exitCode === null) server.kill("SIGTERM");
        },
      };
    }
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
  await context.addInitScript(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  async function amount(testId) {
    const value = await page.getByTestId(testId).getAttribute("data-amount-rub");
    assert.ok(value !== null, `${testId} exposes its numeric value for the deterministic scenario`);
    return Number(value);
  }

  async function waitForAmount(testId, expected) {
    await page.waitForFunction(({ testId: id, expectedValue }) => {
      const value = document.querySelector(`[data-testid="${id}"]`)?.getAttribute("data-amount-rub");
      return value === String(expectedValue);
    }, { testId, expectedValue: expected });
  }

  async function setSwitch(testId, checked) {
    const toggle = page.getByTestId(testId);
    if ((await toggle.getAttribute("aria-checked")) !== String(checked)) await toggle.click();
    await page.waitForFunction(({ id, value }) => document.querySelector(`[data-testid="${id}"]`)?.getAttribute("aria-checked") === value, {
      id: testId,
      value: String(checked),
    });
  }

  try {
    await page.goto(`${baseUrl}/investor-terminal`, { waitUntil: "domcontentloaded" });
    const checks = page.getByTestId("terminal-checks-input");
    await checks.waitFor();
    assert.equal(await checks.inputValue(), "300", "the Terminal opens with the canonical realistic baseline");
    assert.equal(await page.getByTestId("terminal-scenario-status").innerText(), "Financial Model baseline");
    const baselineSales = await page.getByTestId("terminal-sales-result").innerText();

    await checks.fill("175");
    await page.getByTestId("terminal-scenario-status").waitFor();
    assert.equal(await page.getByTestId("terminal-scenario-status").innerText(), "Пользовательский сценарий");
    assert.equal(await checks.inputValue(), "175");
    assert.notEqual(await page.getByTestId("terminal-sales-result").innerText(), baselineSales, "traffic override updates dependent results");
    assert.notEqual(await page.getByTestId("terminal-ebitda-result").innerText(), "2,4 млн ₽", "custom traffic updates economics");

    await page.locator(".terminal-tabs").getByRole("button", { name: "Масштабирование" }).click();
    await page.getByRole("heading", { name: "Масштабирование" }).waitFor();
    assert.equal(await page.getByTestId("scaling-production-multiplier").innerText(), "×1", "production base is explicitly created once");

    const scalingSections = page.locator(".scaling-section");
    const productionAtStart = await amount("scaling-production-investment");
    await scalingSections.nth(0).getByRole("button", { name: "Показать состав" }).click();
    await page.getByTestId("scaling-production-items").waitFor();
    assert.match(await page.getByTestId("scaling-production-items").innerText(), /Модуль выращивания/, "grow stays in the production base");
    assert.equal(await page.getByTestId("scaling-grow-toggle").getAttribute("aria-checked"), "true", "canonical grow module starts as production ×1");

    await page.getByTestId("scaling-format-without-seating").click();
    await page.waitForFunction(() => document.querySelector("[data-testid=scaling-format-without-seating]")?.getAttribute("aria-pressed") === "true");
    await setSwitch("scaling-bar-toggle", false);
    const pointCount = page.getByTestId("scaling-point-count");
    await pointCount.fill("1");
    await pointCount.press("Tab");
    await page.waitForFunction(() => document.querySelector("[data-testid=scaling-point-count]")?.value === "1");
    const pointUnitWithoutBar = await amount("scaling-point-unit");
    assert.equal(await amount("scaling-production-investment"), productionAtStart, "changing point format does not multiply production");
    await scalingSections.nth(1).getByRole("button", { name: "Показать состав" }).click();
    await page.getByTestId("scaling-point-items").waitFor();
    assert.doesNotMatch(await page.getByTestId("scaling-point-items").innerText(), /Бар и напитки/, "bar-off point excludes the optional bar module");
    assert.match(await page.getByTestId("scaling-point-items").innerText(), /Мебель посадочного зала[\s\S]*Не применяется/, "no-seating point excludes guest furniture");

    await pointCount.fill("5");
    await pointCount.press("Tab");
    await page.waitForFunction(() => document.querySelector("[data-testid=scaling-point-count]")?.value === "5");
    await waitForAmount("scaling-point-network", pointUnitWithoutBar * 5);
    assert.equal(await amount("scaling-production-investment"), productionAtStart, "production remains ×1 at five points");
    assert.equal(await amount("scaling-point-network"), pointUnitWithoutBar * 5, "only the confirmed repeatable point is multiplied by N");
    assert.equal(await amount("scaling-confirmed-total"), productionAtStart + pointUnitWithoutBar * 5, "confirmed subtotal contains production ×1 plus points ×N only");
    assert.match(await page.getByTestId("scaling-reserve").innerText(), /не умножается/, "operating reserve is not blindly multiplied");
    await scalingSections.nth(2).getByRole("button", { name: /Показать неразделённые статьи/ }).click();
    const unresolved = await page.getByTestId("scaling-unresolved").innerText();
    const unresolvedMultipliers = await page.getByTestId("scaling-unresolved").locator("[data-multiplier]").evaluateAll((items) => items.map((item) => item.getAttribute("data-multiplier")));
    assert.ok(unresolvedMultipliers.length > 0 && unresolvedMultipliers.every((multiplier) => multiplier === "not_aggregated"), "unresolved items are visible and never silently multiplied");
    assert.match(unresolved, /Резерв|contingency/i, "contingency keeps its canonical unresolved semantics");

    await setSwitch("scaling-bar-toggle", true);
    await page.waitForFunction((before) => Number(document.querySelector("[data-testid=scaling-point-unit]")?.getAttribute("data-amount-rub")) > before, pointUnitWithoutBar);
    const pointUnitWithBar = await amount("scaling-point-unit");
    assert.ok(pointUnitWithBar > pointUnitWithoutBar, "enabling bar changes the repeatable point unit");
    assert.match(await page.getByTestId("scaling-point-items").innerText(), /Бар и напитки/, "bar is a visible per-point item");

    await page.getByTestId("scaling-format-with-seating").click();
    await page.waitForFunction((before) => Number(document.querySelector("[data-testid=scaling-point-unit]")?.getAttribute("data-amount-rub")) > before, pointUnitWithBar);
    assert.match(await page.getByTestId("scaling-point-items").innerText(), /Мебель посадочного зала[\s\S]*₽/, "seated point enables its canonical furniture formula");
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(100);
    await page.screenshot({ path: path.join(projectRoot, ".cache/verification/screenshots/investor-terminal-scaling-desktop.png"), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(100);
    await page.screenshot({ path: path.join(projectRoot, ".cache/verification/screenshots/investor-terminal-scaling-mobile.png"), fullPage: true });

    await page.getByRole("button", { name: "Вернуться к экономике точки" }).click();
    await checks.waitFor();
    assert.equal(await checks.inputValue(), "175", "local scenario survives navigation inside the Terminal");
    assert.match(await page.getByTestId("terminal-point-configuration").innerText(), /с посадочным залом[\s\S]*бар включён/, "one shared point configuration persists between Terminal tabs");

    await page.getByTestId("terminal-reset").click();
    await checks.waitFor();
    assert.equal(await checks.inputValue(), "300", "reset returns to the canonical value");
    assert.equal(await page.getByTestId("terminal-scenario-status").innerText(), "Financial Model baseline");
    await page.locator(".terminal-tabs").getByRole("button", { name: "Масштабирование" }).click();
    await page.getByTestId("scaling-point-count").waitFor();
    assert.equal(await page.getByTestId("scaling-point-count").inputValue(), "1", "reset restores the canonical point-count configuration");
    assert.equal(await page.getByTestId("scaling-format-with-seating").getAttribute("aria-pressed"), "true", "reset restores the canonical point format");

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
