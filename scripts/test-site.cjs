const fs = require("fs");
const http = require("http");
const path = require("path");

const projectRoot = path.resolve(__dirname, "..");
process.env.PLAYWRIGHT_BROWSERS_PATH = path.join(projectRoot, ".playwright-browsers");

const { chromium } = require("playwright");

const distDir = path.join(projectRoot, "dist");
const capexSnapshot = JSON.parse(fs.readFileSync(path.join(projectRoot, "src", "content", "capex-configurator-data.json"), "utf8"));
const routes = [
  { path: "/", must: ["Еда в пути.", "Всё внутри."] },
  { path: "/concept", must: ["Колобок — полноценная еда, собранная в удобную форму."] },
  { path: "/history", must: ["Из реального продукта — в масштабируемую систему."] },
  { path: "/quality", must: ["Вкус начинается с продукта."] },
  { path: "/investment", must: ["От авторского продукта — к федеральной сети национального формата."] },
  { path: "/materials", must: ["Материалы проекта"] },
  { path: "/investor-questions", must: ["Обсудить участие"] },
  { path: "/privacy", must: ["Политика обработки персональных данных"] },
  { path: "/capex-configurator", must: ["CAPEX-конфигуратор", "Стоимость текущей комплектации оборудования"], internal: true },
  { path: "/404", must: ["Страница не найдена"] }
];

const forbiddenPublic = [
  "Инвестиционное предложение",
  "Инвестиционная модель",
  "Вопросы инвестора",
  "Запросить материалы проекта",
  "Колобовщина",
  "Колобочное",
  "Клабочный",
  "street food",
  "10 точек",
  "средний чек",
  "EBITDA",
  "окупаемость"
];

const mimeTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
  [".svg", "image/svg+xml"]
]);

function createServer() {
  return http.createServer((req, res) => {
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: "Not found" }));
      return;
    }

    const url = new URL(req.url || "/", "http://127.0.0.1");
    const pathname = decodeURIComponent(url.pathname);
    let filePath = path.normalize(path.join(distDir, pathname));
    if (!filePath.startsWith(distDir)) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }
    if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) filePath = path.join(filePath, "index.html");
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      const notFoundPath = path.join(distDir, "404", "index.html");
      if (fs.existsSync(notFoundPath)) {
        res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
        fs.createReadStream(notFoundPath).pipe(res);
        return;
      }
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { "Content-Type": mimeTypes.get(ext) || "application/octet-stream" });
    fs.createReadStream(filePath).pipe(res);
  });
}

function listen(server) {
  return new Promise(resolve => server.listen(0, "127.0.0.1", () => {
    const address = server.address();
    resolve(`http://${address.address}:${address.port}`);
  }));
}

function close(server) {
  return new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}

function parseMoney(value) {
  const normalized = String(value).replace(/[^0-9,.-]/g, "").replace(",", ".");
  return normalized ? Number(normalized) : null;
}

async function inspectRoute(browser, baseUrl, route) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const consoleMessages = [];
  const pageErrors = [];
  page.on("console", message => {
    if (["error", "warning"].includes(message.type())) consoleMessages.push(message.text());
  });
  page.on("pageerror", error => pageErrors.push(error.message));

  const response = await page.goto(`${baseUrl}${route.path}`, { waitUntil: "networkidle" });
  // textContent keeps authored casing; innerText reflects CSS text-transform and
  // would make valid headings look absent when the visual design uses uppercase.
  const text = (await page.locator("body").textContent()).replace(/\s+/g, " ").trim();
  const result = {
    path: route.path,
    status: response ? response.status() : null,
    h1Count: await page.locator("h1").count(),
    horizontalScroll: await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2),
    missing: route.must.filter(phrase => !text.includes(phrase.replace(/\s+/g, " "))),
    forbiddenFound: route.internal ? [] : forbiddenPublic.filter(phrase => text.includes(phrase)),
    hiddenRouteLinkCount: await page.locator('a[href="/capex-configurator"]').count(),
    consoleMessages,
    pageErrors
  };
  await page.close();
  return result;
}

async function inspectCapex(browser, baseUrl) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const consoleMessages = [];
  const pageErrors = [];
  page.on("console", message => {
    if (["error", "warning"].includes(message.type())) consoleMessages.push(message.text());
  });
  page.on("pageerror", error => pageErrors.push(error.message));
  await page.goto(`${baseUrl}/capex-configurator`, { waitUntil: "networkidle" });

  const robots = await page.locator('meta[name="robots"]').getAttribute("content");
  const formatButtons = page.locator(".capex-format-tabs [data-format-id]");
  const scenarioButtons = page.locator(".capex-scenario-switch [data-scenario-id]");
  const formatIds = await formatButtons.evaluateAll(buttons => buttons.map(button => button.getAttribute("data-format-id")));
  const scenarioIds = await scenarioButtons.evaluateAll(buttons => buttons.map(button => button.getAttribute("data-scenario-id")));
  const switchedFormats = [];
  for (const format of capexSnapshot.formats) {
    const button = page.locator(`[data-format-id="${format.id}"]`);
    await button.click();
    switchedFormats.push({ id: format.id, selected: await button.getAttribute("aria-pressed") });
  }

  await page.locator('[data-format-id="FMT-INTEGRATED"]').click();
  const incompleteWarning = await page.getByText("Комплектация формата неполная", { exact: true }).count();
  const scenarioTotals = {};
  for (const scenario of capexSnapshot.scenarios) {
    await page.locator(`[data-scenario-id="${scenario.id}"]`).click();
    scenarioTotals[scenario.id] = parseMoney(await page.locator(".capex-live-summary > strong").innerText());
  }

  await page.locator('[data-scenario-id="base"]').click();
  const ovenRow = page.locator('tr[data-item-id="CAPEX-01-009"]');
  const ovenQuantity = await ovenRow.locator('td[data-label="Количество"] strong').innerText();
  const ovenSource = ovenRow.locator(".capex-product-link");
  const ovenSourceAttrs = {
    href: await ovenSource.getAttribute("href"),
    target: await ovenSource.getAttribute("target"),
    rel: await ovenSource.getAttribute("rel")
  };

  const search = page.locator('.capex-search input[type="search"]');
  await search.fill("CAPEX-01-009");
  const ovenSearchCount = await page.locator('tr[data-item-id="CAPEX-01-009"]').count();
  const otherSearchRows = await page.locator(".capex-table tbody tr").count();
  await search.fill("");

  await page.locator('[data-format-id="FMT-FOOD-COURT"]').click();
  const ovenInFoodCourt = await page.locator('tr[data-item-id="CAPEX-01-009"]').count();
  const barToggle = page.locator(".capex-module-picker .capex-switch").filter({ hasText: "Холодные и горячие напитки" });
  const foodCourtTotal = parseMoney(await page.locator(".capex-live-summary > strong").innerText());
  await barToggle.click();
  const barModuleVisible = await page.locator('[data-module-id="MOD-BAR"]').count();
  const foodCourtWithBarTotal = parseMoney(await page.locator(".capex-live-summary > strong").innerText());

  await page.locator('[data-format-id="FMT-CUSTOM"]').click();
  const customModuleChoices = await page.locator(".capex-module-picker .capex-switch").count();

  await page.locator('[data-format-id="FMT-INTEGRATED"]').click();
  const documentLinks = await page.locator(".capex-documents-grid a").evaluateAll(links => links.map(link => ({
    href: link.getAttribute("href") || "",
    target: link.getAttribute("target"),
    rel: link.getAttribute("rel")
  })));
  const tableHeaders = await page.locator(".capex-table thead").first().locator("th").evaluateAll(headers => headers.map(header => header.textContent?.trim()));
  const bodyText = await page.locator("body").innerText();
  const russianTerms = [
    "Минимальная комплектация",
    "Базовая комплектация",
    "С запасом для роста",
    "Требуется КП",
    "Пока не включено в расчёт",
    "Документы проекта",
    "История данных"
  ].filter(term => !bodyText.includes(term));

  const desktopOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2);
  await page.setViewportSize({ width: 768, height: 1024 });
  const tabletOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2);
  await page.setViewportSize({ width: 390, height: 844 });
  const mobileOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2);
  const mobileProductLinkBox = await ovenSource.boundingBox().catch(() => null);

  const result = {
    robots,
    formatIds,
    scenarioIds,
    switchedFormats,
    incompleteWarning,
    scenarioTotals,
    ovenQuantity,
    ovenSourceAttrs,
    ovenSearchCount,
    otherSearchRows,
    ovenInFoodCourt,
    foodCourtTotal,
    foodCourtWithBarTotal,
    barModuleVisible,
    customModuleChoices,
    documentLinks,
    tableHeaders,
    russianTerms,
    desktopOverflow,
    tabletOverflow,
    mobileOverflow,
    mobileProductLinkVisible: Boolean(mobileProductLinkBox && mobileProductLinkBox.width > 0 && mobileProductLinkBox.height > 0),
    consoleMessages,
    pageErrors
  };
  await page.close();
  return result;
}

(async () => {
  if (!fs.existsSync(path.join(distDir, "index.html"))) throw new Error("Missing dist/index.html. Run npm run build first.");

  const server = createServer();
  const baseUrl = await listen(server);
  const browser = await chromium.launch({ headless: true });
  try {
    const results = [];
    for (const route of routes) results.push(await inspectRoute(browser, baseUrl, route));

    const capex = await inspectCapex(browser, baseUrl);
    const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
    await mobile.goto(`${baseUrl}/`, { waitUntil: "networkidle" });
    await mobile.locator(".menu-toggle").click();
    const mobileMenuOpen = (await mobile.locator(".mobile-nav.is-open").count()) === 1;
    await mobile.close();

    const form = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
    await form.goto(`${baseUrl}/investor-questions`, { waitUntil: "networkidle" });
    await form.locator('input[name="name"]').fill("Тест");
    await form.locator('input[name="company"]').fill("Тестовая компания");
    await form.locator('input[name="contact"]').fill("@test");
    await form.locator('input[name="email"]').fill("test@example.com");
    await form.locator('input[name="consent"]').check();
    await form.locator('button[type="submit"]').click();
    const formStatus = await form.locator(".form-status").innerText();
    await form.close();

    const sitemap = fs.readFileSync(path.join(distDir, "sitemap.xml"), "utf8");
    const failures = [];
    for (const result of results) {
      if (result.status !== 200) failures.push(`${result.path}: status ${result.status}`);
      if (result.h1Count !== 1) failures.push(`${result.path}: h1 count ${result.h1Count}`);
      if (result.horizontalScroll) failures.push(`${result.path}: horizontal scroll`);
      if (result.missing.length) failures.push(`${result.path}: missing ${result.missing.join(", ")}`);
      if (result.forbiddenFound.length) failures.push(`${result.path}: forbidden ${result.forbiddenFound.join(", ")}`);
      if (result.path !== "/capex-configurator" && result.hiddenRouteLinkCount > 0) failures.push(`${result.path}: exposes hidden CAPEX route`);
      if (result.consoleMessages.length) failures.push(`${result.path}: console ${result.consoleMessages.join(" | ")}`);
      if (result.pageErrors.length) failures.push(`${result.path}: page errors ${result.pageErrors.join(" | ")}`);
    }

    if (!mobileMenuOpen) failures.push("mobile menu did not open");
    if (sitemap.includes("capex-configurator")) failures.push("sitemap exposes hidden CAPEX route");
    if (!String(capex.robots).includes("noindex") || !String(capex.robots).includes("nofollow")) failures.push(`CAPEX robots: ${capex.robots}`);
    if (capex.formatIds.length !== 7 || capex.formatIds.join("|") !== capexSnapshot.formats.map(item => item.id).join("|")) failures.push("CAPEX formats do not match snapshot");
    if (capex.scenarioIds.length !== 3 || capex.scenarioIds.join("|") !== capexSnapshot.scenarios.map(item => item.id).join("|")) failures.push("CAPEX scenarios do not match snapshot");
    if (capex.switchedFormats.some(item => item.selected !== "true")) failures.push("one or more CAPEX formats did not switch");
    if (!capex.incompleteWarning) failures.push("required incomplete modules are not surfaced");
    if (!(capex.scenarioTotals.minimum < capex.scenarioTotals.base && capex.scenarioTotals.base < capex.scenarioTotals.scale_ready)) failures.push(`CAPEX scenario totals do not change monotonically: ${JSON.stringify(capex.scenarioTotals)}`);
    if (!/^1(?:[,.]0+)?\s*шт\./.test(capex.ovenQuantity)) failures.push(`oven quantity is not one: ${capex.ovenQuantity}`);
    if (!capex.ovenSourceAttrs.href || capex.ovenSourceAttrs.target !== "_blank" || !String(capex.ovenSourceAttrs.rel).includes("noopener") || !String(capex.ovenSourceAttrs.rel).includes("noreferrer")) failures.push("oven product link attributes are unsafe or missing");
    if (capex.ovenSearchCount !== 1 || capex.otherSearchRows !== 1) failures.push("CAPEX search does not isolate the oven row");
    if (capex.ovenInFoodCourt !== 0) failures.push("food-court format includes the oven without MOD-PREP");
    if (!capex.barModuleVisible) failures.push("optional bar module did not activate");
    if (!(capex.foodCourtWithBarTotal > capex.foodCourtTotal)) failures.push("optional bar module did not change evaluated cost");
    if (capex.customModuleChoices !== capexSnapshot.modules.length) failures.push(`custom format exposes ${capex.customModuleChoices} module choices, expected ${capexSnapshot.modules.length}`);
    if (capex.documentLinks.some(link => !link.href || link.target !== "_blank" || !String(link.rel).includes("noopener") || !String(link.rel).includes("noreferrer"))) failures.push("project document links are missing or unsafe");
    if (capex.tableHeaders.join("|") !== "ID|Оборудование|Модуль|Обязательность|Количество|Цена за единицу|Сумма|Поставщик|Дата проверки|Статус цены") failures.push("equipment table headers changed");
    if (capex.russianTerms.length) failures.push(`missing Russian UI terms: ${capex.russianTerms.join(", ")}`);
    if (capex.desktopOverflow || capex.tabletOverflow || capex.mobileOverflow) failures.push(`CAPEX overflow desktop=${capex.desktopOverflow} tablet=${capex.tabletOverflow} mobile=${capex.mobileOverflow}`);
    if (!capex.mobileProductLinkVisible) failures.push("product link is not reachable on mobile");
    if (capex.consoleMessages.length) failures.push(`CAPEX console: ${capex.consoleMessages.join(" | ")}`);
    if (capex.pageErrors.length) failures.push(`CAPEX page errors: ${capex.pageErrors.join(" | ")}`);
    if (formStatus.includes("Спасибо")) failures.push("form showed false success without endpoint");

    const report = { baseUrl, checkedAt: new Date().toISOString(), results, mobileMenuOpen, capex, formStatus, failures };
    console.log(JSON.stringify(report, null, 2));
    if (failures.length) process.exit(1);
  } finally {
    await browser.close();
    await close(server);
  }
})().catch(error => {
  console.error(error);
  process.exit(1);
});
