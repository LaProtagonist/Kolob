/*
 * Deterministic local review package for Investor Economics.
 * It intentionally uses a supplied local Vite URL and never touches production.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
process.env.PLAYWRIGHT_BROWSERS_PATH = path.join(projectRoot, ".playwright-browsers");
const { chromium } = require("playwright");
const baseUrl = (process.env.INVESTOR_ECONOMICS_REVIEW_URL || "http://127.0.0.1:7188").replace(/\/$/, "");
const outputDir = path.join(projectRoot, "analysis", "screenshots", "investor-economics-v1");
fs.mkdirSync(outputDir, { recursive: true });

const scenarios = [
  ["equity", "investor-economics-equity-full-expanded.png"],
  ["priority_equity", "investor-economics-priority-equity-full-expanded.png"],
  ["capped_cash_flow", "investor-economics-capped-cashflow-full-expanded.png"],
  ["full_programme", "investor-economics-full-programme-full-expanded.png"],
];

async function openParticipation(page) {
  await page.goto(`${baseUrl}/investor-terminal`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Условия участия" }).click();
  const panel = page.getByTestId("investor-economics-panel");
  await panel.waitFor();
  return panel;
}

async function chooseAndExpand(page, template) {
  const panel = await openParticipation(page);
  await page.getByTestId(`economics-template-${template}`).click();
  await panel.locator("details").evaluateAll((nodes) => nodes.forEach((node) => { node.open = true; }));
  await page.waitForTimeout(100);
  return panel;
}

async function run() {
  const browser = await chromium.launch({ headless: true });
  const failures = [];
  const files = [];
  try {
    for (const [template, fileName] of scenarios) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      const panel = await chooseAndExpand(page, template);
      assert.equal(await panel.locator("details[open]").count(), 3, `${template}: every Investor Economics disclosure is expanded`);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true, `${template}: desktop has no document overflow`);
      const target = path.join(outputDir, fileName);
      await page.screenshot({ path: target, fullPage: true, type: "png" });
      assert.deepEqual(errors, [], `${template}: no runtime error`);
      files.push(path.relative(projectRoot, target));
      await context.close();
    }

    for (const [template, fileName] of [["equity", "investor-economics-equity-executive.png"], ["full_programme", "investor-economics-full-programme-executive.png"]]) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
      const page = await context.newPage();
      const panel = await openParticipation(page);
      await page.getByTestId(`economics-template-${template}`).click();
      assert.equal(await panel.locator(".investor-economics-waterfall[open]").count(), 0, `${template}: executive waterfall starts collapsed`);
      const target = path.join(outputDir, fileName);
      await page.screenshot({ path: target, type: "png" });
      files.push(path.relative(projectRoot, target));
      await context.close();
    }

    const context = await browser.newContext({ viewport: { width: 1024, height: 768 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    const panel = await openParticipation(page);
    await page.getByTestId("economics-template-full_programme").click();
    await panel.getByText("Показать помесячный расчёт", { exact: true }).click();
    const overflow = await panel.evaluate((element) => {
      const wrapper = element.querySelector("[data-testid=\"economics-waterfall-scroll\"]");
      return {
        document: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
        body: document.body.scrollWidth <= document.documentElement.clientWidth,
        localTable: wrapper instanceof HTMLElement && wrapper.scrollWidth > wrapper.clientWidth,
      };
    });
    assert.deepEqual(overflow, { document: true, body: true, localTable: true }, "tablet keeps the waterfall horizontal scroll local");
    const target = path.join(outputDir, "investor-economics-tablet-waterfall-local-scroll.png");
    await page.screenshot({ path: target, type: "png" });
    files.push(path.relative(projectRoot, target));
    await context.close();
  } catch (error) {
    failures.push(error.stack || error.message);
  } finally {
    await browser.close();
  }
  if (failures.length) throw new Error(failures.join("\n"));
  const manifest = { baseUrl, generatedAt: new Date().toISOString(), files };
  fs.writeFileSync(path.join(outputDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
}

run().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
