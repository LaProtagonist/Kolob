/*
 * Local-only visual package for the v2 public/control review. It uses the
 * supplied Vite URL and never opens or captures production.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
process.env.PLAYWRIGHT_BROWSERS_PATH = path.join(projectRoot, ".playwright-browsers");
const { chromium } = require("playwright");
const baseUrl = (process.env.INVESTOR_ECONOMICS_REVIEW_URL || "http://127.0.0.1:7188").replace(/\/$/, "");
const outputDir = path.join(projectRoot, "analysis", "screenshots", "investor-economics-v2");
fs.mkdirSync(outputDir, { recursive: true });

const scenarios = [
  ["INV-EQUITY-DISCUSSION", "equity", "investor-public-equity-full-expanded.png"],
  ["INV-PRIORITY-DISCUSSION", "priority", "investor-public-priority-full-expanded.png"],
  ["INV-CAPPED-DISCUSSION", "capped", "investor-public-capped-full-expanded.png"],
  ["INV-FULL-PROGRAMME-DISCUSSION", "full-programme", "investor-public-full-programme-full-expanded.png"],
];

async function publicParticipation(page) {
  await page.goto(`${baseUrl}/investor-terminal`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Условия участия" }).click();
  const panel = page.getByTestId("investor-economics-public");
  await panel.waitFor();
  assert.equal(await panel.locator("input, select").count(), 0, "public participation has no editable deal controls");
  assert.equal(await panel.locator('[data-testid^="public-preset-"]').count(), 4, "public participation has four presets");
  return panel;
}

async function capturePublicExpanded(browser, presetId, fileName) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const panel = await publicParticipation(page);
  await page.getByTestId(`public-preset-${presetId}`).click();
  await panel.locator("details").evaluateAll((nodes) => nodes.forEach((node) => { node.open = true; }));
  await page.waitForTimeout(100);
  assert.equal(await panel.locator("details[open]").count(), 2, `${presetId}: all public disclosures are expanded`);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true, `${presetId}: no desktop overflow`);
  const target = path.join(outputDir, fileName);
  await page.screenshot({ path: target, fullPage: true, type: "png" });
  await context.close();
  return path.relative(projectRoot, target);
}

async function capturePublicExecutive(browser, presetId, fileName) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const panel = await publicParticipation(page);
  if (presetId) await page.getByTestId(`public-preset-${presetId}`).click();
  assert.equal(await panel.locator(".investor-economics-waterfall[open]").count(), 0, "waterfall is closed in executive state");
  const target = path.join(outputDir, fileName);
  await page.screenshot({ path: target, fullPage: true, type: "png" });
  await context.close();
  return path.relative(projectRoot, target);
}

async function captureControl(browser, route, heading, fileName) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await page.goto(`${baseUrl}${route}`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: heading }).waitFor();
  assert.equal(await page.locator(".site-header").count(), 0, `${route}: control is not wrapped in public navigation`);
  const target = path.join(outputDir, fileName);
  await page.screenshot({ path: target, fullPage: true, type: "png" });
  await context.close();
  return path.relative(projectRoot, target);
}

async function captureTablet(browser) {
  const context = await browser.newContext({ viewport: { width: 1024, height: 768 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const panel = await publicParticipation(page);
  await page.getByTestId("public-preset-INV-FULL-PROGRAMME-DISCUSSION").click();
  await panel.getByText("Показать помесячный расчёт", { exact: true }).click();
  const dimensions = await panel.evaluate((element) => {
    const wrapper = element.querySelector('[data-testid="economics-waterfall-scroll"]');
    return {
      document: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      body: document.body.scrollWidth <= document.body.clientWidth,
      localTable: wrapper instanceof HTMLElement && wrapper.scrollWidth > wrapper.clientWidth,
    };
  });
  assert.deepEqual(dimensions, { document: true, body: true, localTable: true }, "tablet waterfall scroll is local");
  const target = path.join(outputDir, "investor-public-waterfall-tablet.png");
  await page.screenshot({ path: target, fullPage: true, type: "png" });
  await context.close();
  return { path: path.relative(projectRoot, target), dimensions };
}

async function run() {
  const browser = await chromium.launch({ headless: true });
  const files = [];
  try {
    files.push(await capturePublicExecutive(browser, null, "investor-public-default-executive.png"));
    for (const [id, shortName] of scenarios) files.push(await capturePublicExecutive(browser, id, `investor-public-${shortName}-executive.png`));
    for (const [id, , fileName] of scenarios) files.push(await capturePublicExpanded(browser, id, fileName));
    files.push(await captureControl(browser, "/control", "Управление проектом", "control-home.png"));
    files.push(await captureControl(browser, "/control/capex", "CAPEX и оборудование", "control-capex.png"));
    files.push(await captureControl(browser, "/control/participation", "Конструктор условий участия", "control-participation.png"));
    files.push(await captureControl(browser, "/control/requests", "Обращения", "control-requests.png"));
    const tablet = await captureTablet(browser);
    files.push(tablet.path);
    const manifest = { baseUrl, generatedAt: new Date().toISOString(), files, tablet: tablet.dimensions };
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
