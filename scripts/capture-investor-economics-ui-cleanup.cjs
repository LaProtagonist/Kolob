/* Deterministic visual proof for the compact public participation comparison. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
process.env.PLAYWRIGHT_BROWSERS_PATH = path.join(projectRoot, ".playwright-browsers");
const { chromium } = require("playwright");
const baseUrl = (process.env.INVESTOR_ECONOMICS_REVIEW_URL || "http://127.0.0.1:7188").replace(/\/$/, "");
const outputDir = path.join(projectRoot, "analysis", "screenshots", "investor-economics-ui-cleanup");
const expectedHeader = "Сценарий Капитал / обязательство Возврат вложений Cash IRR к М60 Cash MOIC к М60 Права инвестора";
fs.mkdirSync(outputDir, { recursive: true });

async function participation(page) {
  await page.goto(`${baseUrl}/investor-terminal`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Условия участия" }).click();
  const panel = page.getByTestId("investor-economics-public");
  await panel.waitFor();
  const comparison = panel.locator(".investor-economics-comparison-table");
  assert.equal((await comparison.locator("thead").innerText()).replace(/\s+/g, " ").trim(), expectedHeader);
  assert.equal(await comparison.locator("thead").getByText("Первые выплаты", { exact: true }).count(), 0);
  return { panel, comparison };
}

async function assertPageFits(page) {
  const dimensions = await page.evaluate(() => ({
    documentFits: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    bodyFits: document.body.scrollWidth <= document.body.clientWidth,
  }));
  assert.deepEqual(dimensions, { documentFits: true, bodyFits: true });
  return dimensions;
}

async function capture(browser, viewport, comparisonFile, executiveFile) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const { comparison } = await participation(page);
  const dimensions = await assertPageFits(page);
  await comparison.screenshot({ path: path.join(outputDir, comparisonFile), type: "png" });
  if (executiveFile) await page.screenshot({ path: path.join(outputDir, executiveFile), fullPage: true, type: "png" });
  await context.close();
  return dimensions;
}

async function run() {
  const browser = await chromium.launch({ headless: true });
  try {
    const desktop = await capture(browser, { width: 1440, height: 900 }, "investor-economics-comparison-desktop.png", "investor-economics-participation-executive.png");
    const tablet = await capture(browser, { width: 1024, height: 768 }, "investor-economics-comparison-tablet.png");
    const mobile = await capture(browser, { width: 390, height: 844 }, "investor-economics-comparison-mobile.png");
    const manifest = { baseUrl, expectedHeader, desktop, tablet, mobile };
    fs.writeFileSync(path.join(outputDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
    process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
  } finally {
    await browser.close();
  }
}

run().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
