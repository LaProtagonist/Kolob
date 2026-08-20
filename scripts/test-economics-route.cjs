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

async function assertSingleRow(page, selector, expectedCount = 3) {
  const rects = await page.locator(selector).evaluateAll(nodes => nodes.map(node => {
    const rect = node.getBoundingClientRect();
    return { top: rect.top, bottom: rect.bottom, width: rect.width };
  }));
  assert.equal(rects.length, expectedCount, `${selector}: expected ${expectedCount} controls`);
  assert.ok(Math.max(...rects.map(rect => rect.top)) - Math.min(...rects.map(rect => rect.top)) < 2, `${selector}: controls wrapped to more than one row`);
  return rects;
}

async function assertNoOverflow(page, label) {
  const overflow = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }));
  assert.ok(overflow.document <= overflow.viewport + 1, `${label}: document overflow ${JSON.stringify(overflow)}`);
  assert.ok(overflow.body <= overflow.viewport + 1, `${label}: body overflow ${JSON.stringify(overflow)}`);
  return overflow;
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
  assert.equal(await page.locator('[data-testid="economics-to-launch-budget"]').count(), 1);
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
  if (viewport.width > 1000) {
    assert.equal(stickyPressed, "true");
    assert.equal(compact(await page.locator('[data-scenario-sticky="realistic"]').textContent()), "300 чеков/день");
  }
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

async function inspectTabletLandscape(browser) {
  const context = await browser.newContext({ viewport: { width: 1024, height: 768 } });
  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  page.on("console", message => { if (message.type() === "error") consoleErrors.push(message.text()); });
  page.on("pageerror", error => pageErrors.push(error.message));

  await page.goto(`${baseUrl}/revenue-model`, { waitUntil: "networkidle" });
  await assertSingleRow(page, '[data-control="traffic-scenario"] button');
  await page.locator('[data-testid="daily-production-load"]').scrollIntoViewIfNeeded();
  const readProductionLoad = () => page.locator('[data-testid="daily-production-load"]').evaluate(container => {
    const card = metric => container.querySelector(`[data-daily-metric="${metric}"]`)?.getBoundingClientRect();
    const inline = key => {
      const item = container.querySelector(`[data-food-part="${key}"]`);
      const label = item?.querySelector("span")?.getBoundingClientRect();
      const value = item?.querySelector("strong")?.getBoundingClientRect();
      return {
        labelCenter: label ? (label.top + label.bottom) / 2 : undefined,
        valueCenter: value ? (value.top + value.bottom) / 2 : undefined,
        labelText: item?.textContent?.replace(/\s+/g, " ").trim(),
      };
    };
    const checks = container.querySelector('[data-daily-metric="checks"]');
    const drinks = container.querySelector('[data-daily-metric="drinks"]');
    return {
      widths: [card("checks")?.width, card("food")?.width, card("drinks")?.width],
      checksStack: [
        (() => { const rect = checks?.querySelector("dd")?.getBoundingClientRect(); return rect ? rect.top : undefined; })(),
        (() => { const rect = checks?.querySelector("dt")?.getBoundingClientRect(); return rect ? rect.top : undefined; })(),
      ],
      drinksStack: [
        (() => { const rect = drinks?.querySelector("dd")?.getBoundingClientRect(); return rect ? rect.top : undefined; })(),
        (() => { const rect = drinks?.querySelector("dt")?.getBoundingClientRect(); return rect ? rect.top : undefined; })(),
      ],
      values: [checks?.querySelector("dd")?.textContent?.trim(), container.querySelector('[data-daily-metric="food"] strong')?.textContent?.trim(), drinks?.querySelector("dd")?.textContent?.trim()],
      kolobok: inline("kolobok"),
      manches: inline("manches"),
    };
  });
  const production = await readProductionLoad();
  assert.ok(Math.min(...production.widths) >= 128, "Production Load side cards retain a practical width");
  assert.ok(production.widths[1] > production.widths[0] && production.widths[1] > production.widths[2], "Production Load keeps the central food card visually primary");
  assert.ok(production.checksStack[0] < production.checksStack[1], "Checks number is placed above its label");
  assert.ok(production.drinksStack[0] < production.drinksStack[1], "Drinks number is placed above its label");
  for (const item of [production.kolobok, production.manches]) {
    assert.ok(Math.abs(item.labelCenter - item.valueCenter) < 3, `${item.labelText}: label and value stay on one row`);
    assert.doesNotMatch(item.labelText, /порц/i);
  }
  for (const [label, expected] of [["Пессимистичный", ["200", "280", "200"]], ["Реалистичный", ["300", "420", "300"]], ["Оптимистичный", ["450", "630", "450"]]]) {
    await page.locator('[data-control="traffic-scenario"] button').filter({ hasText: label }).click();
    assert.deepEqual((await readProductionLoad()).values, expected, `Production Load follows ${label} scenario`);
  }
  await page.locator('[data-control="traffic-scenario"] button').filter({ hasText: "Реалистичный" }).click();
  const revenueScreenshot = path.join(reviewDir, "investor-journey-tablet-revenue-flow.png");
  await page.screenshot({ path: revenueScreenshot });
  await page.locator('[data-testid="daily-production-load"]').scrollIntoViewIfNeeded();
  const revenueProductionScreenshot = path.join(reviewDir, "investor-journey-tablet-revenue-production.png");
  await page.screenshot({ path: revenueProductionScreenshot });
  await assertNoOverflow(page, "revenue tablet");

  await page.goto(`${baseUrl}/launch-budget`, { waitUntil: "networkidle" });
  const areaInputs = await page.locator(".launch-fields-three .launch-input-wrap").evaluateAll(nodes => nodes.map(node => {
    const rect = node.getBoundingClientRect();
    return { top: rect.top, height: rect.height };
  }));
  assert.equal(areaInputs.length, 3);
  assert.ok(Math.max(...areaInputs.map(item => item.top)) - Math.min(...areaInputs.map(item => item.top)) < 2, "Area inputs share one baseline");
  assert.ok(Math.max(...areaInputs.map(item => item.height)) - Math.min(...areaInputs.map(item => item.height)) < 1, "Area inputs have equal height");
  await page.locator(".launch-fields-three").scrollIntoViewIfNeeded();
  const launchAreaScreenshot = path.join(reviewDir, "investor-journey-tablet-launch-area.png");
  await page.screenshot({ path: launchAreaScreenshot });
  for (const control of ["seating-profile", "furniture-profile", "equipment-scenario", "reserve-months", "contingency-percent"]) {
    await assertSingleRow(page, `[data-control="${control}"]`);
  }
  const furnitureButtons = await page.locator('[data-control="furniture-profile"]').evaluateAll(nodes => nodes.map(node => ({
    label: node.querySelector("strong")?.textContent?.trim(),
    fontSize: getComputedStyle(node.querySelector("strong")).fontSize,
  })));
  assert.deepEqual(furnitureButtons.map(item => item.label), ["Функциональная", "Сбалансированная", "Комфорт"]);
  assert.ok(furnitureButtons.every(item => Number.parseFloat(item.fontSize) >= 14), "Furniture selector retains its existing text scale");
  await page.locator('[data-control="furniture-profile"]').first().scrollIntoViewIfNeeded();
  const launchEquipmentScreenshot = path.join(reviewDir, "investor-journey-tablet-launch-equipment.png");
  await page.screenshot({ path: launchEquipmentScreenshot });
  await page.locator(".launch-equipment-summary").scrollIntoViewIfNeeded();
  const equipmentDetails = await page.locator(".launch-equipment-summary dl > div").evaluateAll(nodes => nodes.map(node => ({
    label: node.querySelector("dt")?.textContent?.trim(),
    value: node.querySelector("dd")?.innerText?.replace(/\s+/g, " ").trim(),
  })));
  assert.deepEqual(equipmentDetails, [
    { label: "В расчёт включено", value: "47 позиций оборудования" },
    { label: "Требуют подтверждения цены", value: "23 из включённых в расчёт позиций" },
  ]);
  assert.match(compact(await page.locator(".launch-equipment-summary > p").textContent()), /Для 23 позиций требуется подтверждение актуальными коммерческими предложениями поставщиков/);
  const launchEstimateScreenshot = path.join(reviewDir, "investor-journey-tablet-launch-equipment-estimate.png");
  await page.screenshot({ path: launchEstimateScreenshot });
  const currentConfiguration = page.locator(".launch-current-configuration");
  assert.match(compact(await currentConfiguration.textContent()), /Текущая конфигурация объектаСовмещённый объектБазовый формат для запуска первой точки и дальнейшего масштабирования сети/);
  for (const label of ["Заготовочное производство", "Торговая точка", "Посадочный зал", "Бар и напитки", "Выращивание зелени"]) {
    assert.match(compact(await currentConfiguration.textContent()), new RegExp(label));
  }
  const launchSummaryScreenshot = path.join(reviewDir, "investor-journey-tablet-launch-summary.png");
  await page.locator(".launch-sticky-column").screenshot({ path: launchSummaryScreenshot });
  await page.locator('[data-control="reserve-months"]').first().scrollIntoViewIfNeeded();
  const launchReserveScreenshot = path.join(reviewDir, "investor-journey-tablet-launch-reserve.png");
  await page.screenshot({ path: launchReserveScreenshot });
  await assertNoOverflow(page, "launch-budget tablet");

  await page.goto(`${baseUrl}/economics`, { waitUntil: "networkidle" });
  await page.locator('[data-testid="economics-summary"]').waitFor();
  await assertSingleRow(page, '[data-testid="economics-sticky-selector"] button');
  const economicsLayout = await page.locator(".economics-workspace-grid").evaluate(container => {
    const form = container.querySelector(".launch-form-column")?.getBoundingClientRect();
    const aside = container.querySelector(".economics-sticky-column")?.getBoundingClientRect();
    return { formWidth: form?.width, asideWidth: aside?.width };
  });
  const columnRatio = economicsLayout.formWidth / economicsLayout.asideWidth;
  assert.ok(columnRatio >= 1.45 && columnRatio <= 1.8, `Tablet workspace gives aside all width available after the three-option constraint: ${columnRatio}`);
  assert.equal(await page.locator('[data-testid="economics-to-launch-budget"]').count(), 1);
  assert.equal(await page.locator('[data-testid="economics-to-revenue"]').count(), 1);
  const economicsTopScreenshot = path.join(reviewDir, "investor-journey-tablet-economics-top.png");
  await page.screenshot({ path: economicsTopScreenshot });
  await page.evaluate(() => {
    document.documentElement.style.scrollBehavior = "auto";
    window.scrollTo(0, 1800);
  });
  await page.waitForTimeout(100);
  const sticky = await page.locator(".economics-sticky-column").evaluate(node => {
    const rect = node.getBoundingClientRect();
    const navigation = node.querySelector(".investor-journey-navigation")?.getBoundingClientRect();
    return { top: rect.top, navigationBottom: navigation?.bottom, viewport: window.innerHeight, scrollY: window.scrollY, documentHeight: document.documentElement.scrollHeight };
  });
  assert.ok(Math.abs(sticky.top - 92) < 3, `Economics sticky zone remains pinned while scrolling: ${JSON.stringify(sticky)}`);
  assert.ok(sticky.navigationBottom <= sticky.viewport + 1, "Sticky navigation remains reachable while scrolling");
  const economicsStickyScreenshot = path.join(reviewDir, "investor-journey-tablet-economics-sticky.png");
  await page.screenshot({ path: economicsStickyScreenshot });
  await assertNoOverflow(page, "economics tablet");
  assert.deepEqual(consoleErrors, []);
  assert.deepEqual(pageErrors, []);
  await context.close();

  return {
    revenueScreenshot: path.relative(projectRoot, revenueScreenshot),
    revenueProductionScreenshot: path.relative(projectRoot, revenueProductionScreenshot),
    launchAreaScreenshot: path.relative(projectRoot, launchAreaScreenshot),
    launchEquipmentScreenshot: path.relative(projectRoot, launchEquipmentScreenshot),
    launchEstimateScreenshot: path.relative(projectRoot, launchEstimateScreenshot),
    launchSummaryScreenshot: path.relative(projectRoot, launchSummaryScreenshot),
    launchReserveScreenshot: path.relative(projectRoot, launchReserveScreenshot),
    economicsTopScreenshot: path.relative(projectRoot, economicsTopScreenshot),
    economicsStickyScreenshot: path.relative(projectRoot, economicsStickyScreenshot),
  };
}

async function inspectInvestorJourney(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  page.on("console", message => { if (message.type() === "error") consoleErrors.push(message.text()); });
  page.on("pageerror", error => pageErrors.push(error.message));

  await page.goto(`${baseUrl}/revenue-model`, { waitUntil: "networkidle" });
  await page.locator('[data-control="traffic-scenario"] button').filter({ hasText: "Пессимистичный" }).click();
  assert.equal(await page.locator('[data-testid="revenue-to-launch-budget"]').count(), 1);
  assert.equal(await page.locator('[data-testid="revenue-to-economics"]').count(), 1);
  assert.equal(await page.locator('.launch-lower-section [data-testid="revenue-to-launch-budget"]').count(), 0);
  const revenueScreenshot = path.join(reviewDir, "investor-journey-revenue-cta.png");
  await page.screenshot({ path: revenueScreenshot, fullPage: true });
  await page.locator('[data-testid="revenue-to-economics"]').click();
  await page.waitForURL(`${baseUrl}/economics`);
  assert.equal(await page.locator('[data-scenario="pessimistic"]').getAttribute("aria-pressed"), "true");
  await page.locator('[data-testid="economics-to-revenue"]').click();
  await page.waitForURL(`${baseUrl}/revenue-model`);
  await page.locator('[data-testid="revenue-to-launch-budget"]').click();
  await page.waitForURL(`${baseUrl}/launch-budget`);
  await page.locator('[data-testid="launch-total"]').waitFor();
  assert.equal(await page.locator('[data-testid="launch-budget-to-revenue"]').count(), 1);
  assert.equal(await page.locator('[data-testid="launch-budget-to-economics"]').count(), 1);
  assert.equal(await page.locator('.launch-lower-section [data-testid="launch-budget-to-economics"]').count(), 0);
  await page.locator('[data-testid="launch-budget-to-revenue"]').click();
  await page.waitForURL(`${baseUrl}/revenue-model`);
  await page.locator('[data-testid="revenue-to-launch-budget"]').click();
  await page.waitForURL(`${baseUrl}/launch-budget`);
  await page.locator("#monthly-rent").fill("500000");
  const launchScreenshot = path.join(reviewDir, "investor-journey-launch-configured.png");
  await page.screenshot({ path: launchScreenshot, fullPage: true });

  await page.locator('[data-testid="launch-budget-to-economics"]').click();
  await page.waitForURL(`${baseUrl}/economics`);
  await page.locator('[data-testid="economics-summary"]').waitFor();
  assert.equal(await page.locator('[data-scenario="pessimistic"]').getAttribute("aria-pressed"), "true");
  assert.match(compact(await page.locator('[data-testid="economics-configuration-actions"]').textContent()), /Ваш вариант/);
  assert.match(compact(await page.locator('[data-testid="economics-start-investment"]').textContent()), /45,04 млн ₽/);
  assert.match(compact(await page.locator('[data-testid="economics-ebitda"]').textContent()), /0,92 млн ₽/);
  const configuredScreenshot = path.join(reviewDir, "investor-journey-economics-configured.png");
  await page.screenshot({ path: configuredScreenshot, fullPage: true });

  await page.locator('[data-testid="economics-to-launch-budget"]').click();
  await page.waitForURL(`${baseUrl}/launch-budget`);
  assert.equal(await page.locator("#monthly-rent").inputValue(), "500000");
  await page.locator('[data-testid="launch-budget-to-economics"]').click();
  await page.waitForURL(`${baseUrl}/economics`);
  await page.locator('[data-testid="economics-reset-configuration"]').click();
  assert.match(compact(await page.locator('[data-testid="economics-start-investment"]').textContent()), /45,37 млн ₽/);
  assert.equal(await page.locator('[data-testid="economics-reset-configuration"]').count(), 0);
  await page.locator('[data-testid="economics-to-revenue"]').click();
  await page.waitForURL(`${baseUrl}/revenue-model`);
  assert.deepEqual(consoleErrors, []);
  assert.deepEqual(pageErrors, []);
  await context.close();

  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const mobilePage = await mobile.newPage();
  const mobileErrors = [];
  mobilePage.on("console", message => { if (message.type() === "error") mobileErrors.push(message.text()); });
  await mobilePage.goto(`${baseUrl}/revenue-model`, { waitUntil: "networkidle" });
  assert.equal(await mobilePage.locator(".investor-journey-navigation").count(), 1);
  await assertNoOverflow(mobilePage, "revenue mobile");
  const mobileRevenueScreenshot = path.join(reviewDir, "investor-journey-mobile-revenue.png");
  await mobilePage.screenshot({ path: mobileRevenueScreenshot, fullPage: true });
  await mobilePage.locator('[data-testid="revenue-to-launch-budget"]').click();
  await mobilePage.waitForURL(`${baseUrl}/launch-budget`);
  assert.equal(await mobilePage.locator(".investor-journey-navigation").count(), 1);
  await assertNoOverflow(mobilePage, "launch-budget mobile");
  const mobileLaunchScreenshot = path.join(reviewDir, "investor-journey-mobile-launch-budget.png");
  await mobilePage.screenshot({ path: mobileLaunchScreenshot, fullPage: true });
  await mobilePage.locator('[data-testid="launch-budget-to-economics"]').click();
  await mobilePage.waitForURL(`${baseUrl}/economics`);
  await mobilePage.locator('[data-testid="economics-summary"]').waitFor();
  await assertNoOverflow(mobilePage, "economics mobile");
  const stickySelector = mobilePage.locator('[data-testid="economics-sticky-selector"]');
  assert.equal(await stickySelector.count() === 0 || !await stickySelector.isVisible(), true, "secondary sticky selector is hidden on mobile");
  const mobileScreenshot = path.join(reviewDir, "investor-journey-mobile-flow.png");
  await mobilePage.screenshot({ path: mobileScreenshot, fullPage: true });
  assert.deepEqual(mobileErrors, []);
  await mobile.close();

  return {
    revenueScreenshot: path.relative(projectRoot, revenueScreenshot),
    launchScreenshot: path.relative(projectRoot, launchScreenshot),
    configuredScreenshot: path.relative(projectRoot, configuredScreenshot),
    mobileRevenueScreenshot: path.relative(projectRoot, mobileRevenueScreenshot),
    mobileLaunchScreenshot: path.relative(projectRoot, mobileLaunchScreenshot),
    mobileScreenshot: path.relative(projectRoot, mobileScreenshot),
  };
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const results = [];
    results.push(await inspectViewport(browser, "desktop", { width: 1440, height: 900 }));
    results.push(await inspectViewport(browser, "mobile", { width: 390, height: 844 }));
    const tablet = await inspectTabletLandscape(browser);
    const journey = await inspectInvestorJourney(browser);
    process.stdout.write(`${JSON.stringify({ route: "/economics", status: "passed", results, tablet, journey }, null, 2)}\n`);
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
