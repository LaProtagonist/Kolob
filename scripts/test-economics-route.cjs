const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
process.env.PLAYWRIGHT_BROWSERS_PATH = path.join(projectRoot, ".playwright-browsers");
const { chromium } = require("playwright");

const baseUrl = (process.argv[2] || "http://127.0.0.1:5173").replace(/\/$/, "");
const reviewDir = path.join(projectRoot, "output", "review");
fs.mkdirSync(reviewDir, { recursive: true });

function compact(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

async function inspectViewport(browser, name, viewport) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  page.on("console", message => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", error => pageErrors.push(error.message));

  await page.goto(`${baseUrl}/economics`, { waitUntil: "networkidle" });
  await page.locator("[data-testid=economics-summary]").waitFor();

  assert.equal(await page.title(), "Экономика объекта — Колобочная");
  assert.equal(compact(await page.locator("h1").textContent()), "Экономика объекта");
  const robots = await page.locator('meta[name="robots"]').getAttribute("content");
  assert.match(robots || "", /noindex/);
  assert.match(robots || "", /nofollow/);
  assert.equal(await page.locator('.site-header a[href="/economics"]').count(), 0);
  assert.equal(await page.locator('.site-footer a[href="/economics"]').count(), 0);
  assert.equal(await page.locator('a[href="/revenue-model"], a[href="/launch-budget"]').count(), 0);
  assert.equal(await page.locator('[data-scenario="realistic"]').getAttribute("aria-pressed"), "true");
  assert.match(compact(await page.locator('[data-testid="economics-start-investment"]').textContent()), /45,37 млн ₽/);
  assert.match(compact(await page.locator('[data-testid="economics-sales"]').textContent()), /10,49 млн ₽/);
  assert.match(compact(await page.locator('[data-testid="economics-ebitda"]').textContent()), /2,41 млн ₽/);
  assert.match(compact(await page.locator('[data-testid="economics-margin"]').textContent()), /23,01%/);
  assert.match(compact(await page.locator('[data-testid="economics-payback"]').textContent()), /23 месяца/);

  const rampValues = await page.locator("[data-ramp-month] strong").evaluateAll(nodes => nodes.map(node => node.textContent));
  assert.deepEqual(rampValues, ["60%", "70%", "80%", "85%", "90%", "95%", "100%"]);
  assert.equal(await page.locator("[data-seasonality-month]").count(), 12);
  await page.locator("[data-testid=economics-year-one]").waitFor();
  const marketingParts = await page.locator("[data-marketing-part][data-amount-rub]").evaluateAll(nodes => nodes.map(node => Number(node.getAttribute("data-amount-rub"))));
  assert.equal(marketingParts.length, 2, "fixed part + variable part");
  assert.ok(Math.abs(marketingParts.reduce((total, value) => total + value, 0) - Number(await page.locator('[data-testid="economics-marketing-group"]').getAttribute("data-amount-rub"))) < 0.01);
  const expenseTexts = await page.locator(".economics-pnl-row.is-expense strong").evaluateAll(nodes => nodes.map(node => node.textContent));
  assert.ok(expenseTexts.length >= 8);
  for (const text of expenseTexts) assert.doesNotMatch(text, /^[−-]/, `expense row must be unsigned: ${text}`);
  const stickyPressed = await page.locator('[data-scenario-sticky="realistic"]').getAttribute("aria-pressed");
  if (viewport.width > 1000) assert.equal(stickyPressed, "true");
  const investmentGroups = await page.locator("[data-investment-group]").evaluateAll(nodes => nodes.map(node => node.getAttribute("data-investment-group")));
  assert.deepEqual(investmentGroups, ["creation", "launch", "tied", "reserve"]);

  const cogsTotal = Number(await page.locator('[data-testid="economics-cogs-group"]').getAttribute("data-amount-rub"));
  const cogsParts = await page.locator("[data-cogs-part]").evaluateAll(nodes => nodes.map(node => Number(node.getAttribute("data-amount-rub"))));
  assert.equal(cogsParts.reduce((total, value) => total + value, 0), cogsTotal);

  await page.locator('[data-scenario="pessimistic"]').click();
  assert.match(compact(await page.locator('[data-testid="economics-sales"]').textContent()), /6,99 млн ₽/);
  assert.match(compact(await page.locator('[data-testid="economics-ebitda"]').textContent()), /1,07 млн ₽/);
  assert.match(compact(await page.locator('[data-testid="economics-margin"]').textContent()), /15,32%/);
  assert.match(compact(await page.locator('[data-testid="economics-payback"]').textContent()), /48 месяцев/);
  assert.match(compact(await page.locator('[data-testid="economics-start-investment"]').textContent()), /42,94 млн ₽/);
  if (viewport.width > 1000) {
    assert.equal(await page.locator('[data-scenario-sticky="pessimistic"]').getAttribute("aria-pressed"), "true", "sticky selector mirrors the main selector");
    await page.locator('[data-scenario-sticky="optimistic"]').click();
    assert.equal(await page.locator('[data-scenario="optimistic"]').getAttribute("aria-pressed"), "true", "main selector mirrors the sticky selector");
    assert.match(compact(await page.locator('[data-testid="economics-summary"]').textContent()), /Оптимистичный сценарий/);
  }

  await page.locator('[data-scenario="optimistic"]').click();
  assert.match(compact(await page.locator('[data-testid="economics-start-investment"]').textContent()), /49,62 млн ₽/);
  assert.match(compact(await page.locator('[data-testid="economics-sales"]').textContent()), /15,73 млн ₽/);
  assert.match(compact(await page.locator('[data-testid="economics-ebitda"]').textContent()), /4,12 млн ₽/);
  assert.match(compact(await page.locator('[data-testid="economics-margin"]').textContent()), /26,19%/);
  assert.match(compact(await page.locator('[data-testid="economics-payback"]').textContent()), /15 месяцев/);

  await page.locator('[data-scenario="realistic"]').click();
  const overflow = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }));
  assert.ok(overflow.document <= overflow.viewport + 1, `document overflow: ${JSON.stringify(overflow)}`);
  assert.ok(overflow.body <= overflow.viewport + 1, `body overflow: ${JSON.stringify(overflow)}`);
  assert.deepEqual(consoleErrors, []);
  assert.deepEqual(pageErrors, []);

  const screenshot = path.join(reviewDir, `economics-${name}.png`);
  await page.screenshot({ path: screenshot, fullPage: true });
  await context.close();
  return { name, viewport, screenshot: path.relative(projectRoot, screenshot), overflow, consoleErrors, pageErrors };
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const results = [];
    results.push(await inspectViewport(browser, "desktop", { width: 1440, height: 900 }));
    results.push(await inspectViewport(browser, "mobile", { width: 390, height: 844 }));
    process.stdout.write(`${JSON.stringify({ route: "/economics", status: "passed", results }, null, 2)}\n`);
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

