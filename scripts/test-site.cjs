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
  { path: "/launch-budget", must: ["Расчёт стоимости запуска", "Стоимость запуска"], internal: true },
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
    internal: Boolean(route.internal),
    status: response ? response.status() : null,
    h1Count: await page.locator("h1").count(),
    horizontalScroll: await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2),
    missing: route.must.filter(phrase => !text.includes(phrase.replace(/\s+/g, " "))),
    forbiddenFound: route.internal ? [] : forbiddenPublic.filter(phrase => text.includes(phrase)),
    hiddenCapexRouteLinkCount: await page.locator('a[href="/capex-configurator"]').count(),
    hiddenLaunchRouteLinkCount: await page.locator('a[href="/launch-budget"]').count(),
    consoleMessages,
    pageErrors
  };
  await page.close();
  return result;
}

async function inspectLaunchBudget(browser, baseUrl) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const consoleMessages = [];
  const pageErrors = [];
  page.on("console", message => {
    if (["error", "warning"].includes(message.type())) consoleMessages.push(message.text());
  });
  page.on("pageerror", error => pageErrors.push(error.message));
  await page.goto(`${baseUrl}/launch-budget`, { waitUntil: "networkidle" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "networkidle" });

  const money = async locator => parseMoney(await locator.innerText());
  const total = page.locator(".launch-total-value");
  const equipmentValue = page.locator(".launch-equipment-summary > div > strong");
  const defaults = {
    rentSelected: await page.locator('[data-control="premises-scenario"][data-option="rent"]').getAttribute("aria-pressed"),
    monthlyRent: await page.locator("#monthly-rent").inputValue(),
    prepaymentMonths: await page.locator("#prepayment-months").inputValue(),
    securityDepositMonths: await page.locator("#security-deposit-months").inputValue(),
    totalArea: await page.locator("#total-area").inputValue(),
    kitchenArea: await page.locator("#kitchen-area").inputValue(),
    guestArea: await page.locator("#guest-area").inputValue(),
    otherArea: await page.locator(".launch-inline-result").filter({ hasText: "Прочая площадь" }).locator("strong").innerText(),
    seats: await page.locator(".launch-seat-result strong").innerText(),
    furniture: await money(page.locator(".launch-research-line strong")),
    premisesEntry: await money(page.locator(".launch-total-breakdown > div").filter({ hasText: "Первоначальные платежи по аренде" }).locator("dd")),
    tiedFunds: await money(page.locator(".launch-tied-funds strong")),
    baseSelected: await page.locator('[data-control="equipment-scenario"][data-option="BASE"]').getAttribute("aria-pressed"),
    barEnabled: await page.locator("#bar-enabled").getAttribute("aria-checked"),
    growEnabled: await page.locator("#grow-enabled").getAttribute("aria-checked"),
    preparationAmount: await money(page.locator(".launch-preparation-summary strong")),
    preparationAccordionExpanded: await page.locator(".launch-preparation-accordion-button").getAttribute("aria-expanded"),
    totalText: await total.innerText(),
    equipmentTotal: await money(equipmentValue),
  };

  const defaultContingency = await money(page.locator(".launch-total-breakdown > div").filter({ hasText: "Резерв" }).locator("dd"));
  const defaultLaunchTotal = await money(total);
  await page.locator(".launch-preparation-accordion-button").click();
  const preparationRows = page.locator(".launch-preparation-category");
  const preparationDefaults = await preparationRows.locator("button").evaluateAll(buttons => buttons.map(button => button.getAttribute("aria-checked")));
  await page.locator('[data-preparation-id="PREP-VENTILATION"] button').click();
  const noVentilation = {
    preparation: await money(page.locator(".launch-preparation-summary strong")),
    contingency: await money(page.locator(".launch-total-breakdown > div").filter({ hasText: "Резерв" }).locator("dd")),
    total: await money(total),
    status: await page.locator('[data-preparation-id="PREP-VENTILATION"] .launch-preparation-category-value small').innerText(),
  };
  await page.locator('[data-preparation-id="PREP-DESIGN"] button').click();
  const noVentilationOrDesign = await money(page.locator(".launch-preparation-summary strong"));
  await page.locator('[data-preparation-id="PREP-VENTILATION"] button').click();
  const noDesign = await money(page.locator(".launch-preparation-summary strong"));
  await page.locator('[data-preparation-id="PREP-DESIGN"] button').click();
  const restoredPreparation = await money(page.locator(".launch-preparation-summary strong"));
  await page.locator(".launch-preparation-mode-button").click();
  await page.locator("#preparation-manual-cost").fill("4000000");
  const manualBeforeToggle = await money(page.locator(".launch-preparation-summary strong"));
  await page.locator('[data-preparation-id="PREP-VENTILATION"] button').click();
  const manualAfterToggle = await money(page.locator(".launch-preparation-summary strong"));
  await page.locator(".launch-preparation-manual > button").click();
  const returnedBreakdown = await money(page.locator(".launch-preparation-summary strong"));
  await page.locator(".launch-preparation-mode-button").click();
  await page.locator("#preparation-manual-cost").fill("4000000");
  const preparationScenarios = {
    rowCount: await preparationRows.count(),
    defaults: preparationDefaults,
    defaultContingency,
    defaultLaunchTotal,
    noVentilation,
    noVentilationOrDesign,
    noDesign,
    restoredPreparation,
    manualBeforeToggle,
    manualAfterToggle,
    returnedBreakdown,
  };

  await page.locator("#total-area").fill("300");
  await page.locator("#kitchen-area").fill("120");
  await page.locator("#guest-area").fill("100");
  const area = {
    other: await page.locator(".launch-inline-result").filter({ hasText: "Прочая площадь" }).locator("strong").innerText(),
    seats: await page.locator(".launch-seat-result strong").innerText(),
    furniture: await page.locator(".launch-research-line strong").innerText(),
  };

  await page.locator("#kitchen-area").fill("220");
  const invalidArea = {
    alert: await page.locator(".launch-error").count(),
    total: await total.innerText(),
  };
  await page.locator("#kitchen-area").fill("120");

  await page.locator('[data-control="premises-scenario"][data-option="purchase"]').click();
  const defaultPurchasePrice = await page.locator("#purchase-price").inputValue();
  await page.locator("#purchase-price").fill("20000000");
  await page.locator("#monthly-opex").fill("2000000");
  const purchase = {
    total: await money(total),
    entry: await money(page.locator(".launch-total-breakdown > div").filter({ hasText: "Стоимость покупки помещения" }).locator("dd")),
    reserve: await money(page.locator(".launch-total-breakdown > div").filter({ hasText: "Операционный запас" }).locator("dd")),
    assets: await money(page.locator(".launch-assets strong")),
  };

  await page.locator('[data-control="premises-scenario"][data-option="rent"]').click();
  await page.locator("#monthly-rent").fill("500000");
  await page.locator("#prepayment-months").selectOption("3");
  await page.locator("#security-deposit-months").selectOption("2");
  const rent = {
    entry: await money(page.locator(".launch-total-breakdown > div").filter({ hasText: "Первоначальные платежи по аренде" }).locator("dd")),
    reserve: await money(page.locator(".launch-total-breakdown > div").filter({ hasText: "Операционный запас" }).locator("dd")),
    tied: await money(page.locator(".launch-tied-funds strong")),
  };
  await page.locator("#prepayment-months").selectOption("12");
  const rentWithAnnualPrepaymentReserve = await money(page.locator(".launch-total-breakdown > div").filter({ hasText: "Операционный запас" }).locator("dd"));

  const scenarioTotals = {};
  for (const scenario of ["MINIMUM", "BASE", "SCALE_READY"]) {
    await page.locator(`[data-control="equipment-scenario"][data-option="${scenario}"]`).click();
    scenarioTotals[scenario] = await money(equipmentValue);
  }
  await page.locator('[data-control="equipment-scenario"][data-option="BASE"]').click();
  const allModulesTotal = await money(equipmentValue);
  const fullConfiguration = await page.locator(".launch-current-configuration li").allTextContents();
  await page.locator("#bar-enabled").click();
  await page.locator("#grow-enabled").click();
  const reducedModulesTotal = await money(equipmentValue);
  const reducedConfiguration = await page.locator(".launch-current-configuration li").allTextContents();

  await page.locator("#total-area").fill("321");
  await page.reload({ waitUntil: "networkidle" });
  const persistedTotalArea = await page.locator("#total-area").inputValue();
  const persistedPreparation = {
    accordionExpanded: await page.locator(".launch-preparation-accordion-button").getAttribute("aria-expanded"),
    manualValue: await page.locator("#preparation-manual-cost").inputValue(),
    ventilationEnabled: await page.locator('[data-preparation-id="PREP-VENTILATION"] button').getAttribute("aria-checked"),
  };
  page.once("dialog", dialog => dialog.accept());
  await page.locator(".launch-reset").click();
  const resetTotalArea = await page.locator("#total-area").inputValue();
  const resetPreparation = {
    amount: await money(page.locator(".launch-preparation-summary strong")),
    accordionExpanded: await page.locator(".launch-preparation-accordion-button").getAttribute("aria-expanded"),
  };
  const resetStorage = await page.evaluate(key => localStorage.getItem(key), capexSnapshot.investorStartModel.form.local_storage_key);

  const documents = await page.locator(".launch-document-list a").evaluateAll(links => links.map(link => ({ href: link.getAttribute("href"), target: link.getAttribute("target"), rel: link.getAttribute("rel") })));
  const capexLink = await page.locator('a[href="/capex-configurator"]').count();
  const publicExposure = {
    nav: await page.locator('.site-header a[href="/launch-budget"]').count(),
    footer: await page.locator('.site-footer a[href="/launch-budget"]').count(),
  };
  const robots = await page.locator('meta[name="robots"]').getAttribute("content");
  const unknownZeroCount = await page.getByText(/^0\s*₽$/).count();

  const overflow = {};
  for (const viewport of [{ id: "desktop", width: 1440, height: 900 }, { id: "tablet", width: 768, height: 1024 }, { id: "mobile", width: 390, height: 844 }]) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    overflow[viewport.id] = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.keyboard.press("Tab");
  const focus = await page.evaluate(() => {
    const element = document.activeElement;
    const style = element ? getComputedStyle(element) : null;
    return { tag: element?.tagName ?? null, outlineStyle: style?.outlineStyle ?? null, outlineWidth: style?.outlineWidth ?? null };
  });

  const bodyText = await page.locator("body").innerText();
  const sourceText = await page.locator("body").textContent();
  const approvedCopy = [
    "Модель совмещённого объекта «Колобочной»: заготовочное производство и торговая точка с посадочным залом.",
    "Возможности расчёта",
    "Расчёт позволяет сравнить сценарии запуска при аренде или покупке помещения и увидеть, как площадь, состав оснащения, подготовка объекта и запас на запуск влияют на итоговую стоимость. Базовые параметры уже заданы и могут быть изменены под конкретный вариант.",
    "Расчёт предусматривает два сценария: приобретение помещения в собственность или аренду. Параметры каждого сценария можно изменить под рассматриваемый объект.",
    "Ежемесячная арендная плата",
    "Предоплата аренды",
    "Первоначальные платежи по аренде",
    "Предоплата аренды и обеспечительный платёж.",
    "Распределение площади определяет предварительную вместимость зала и стоимость его оснащения.",
    "Кухня и заготовочное производство",
    "Чистая площадь посадочного зала",
    "Зоны заказа и выдачи, склады, санузлы, проходы, служебные и технические помещения.",
    "Предварительная вместимость",
    "Окончательная вместимость определяется после разработки планировки с учётом проходов, эвакуационных требований и доступной среды.",
    "Оснащение и мебель",
    "Выберите комплектацию оборудования и уровень мебели для посадочного зала.",
    "Предварительная стоимость мебели",
    "Стоимость рассчитана по текущим ценовым ориентирам. Часть позиций требует подтверждения коммерческими предложениями.",
    "Требуют подтверждения коммерческими предложениями",
    "Предварительная оценка адаптации помещения около 200 м² в Санкт-Петербурге.",
    "Базовая оценка",
    "Все основные категории включены; состав работ можно скорректировать.",
    "Запас и резерв",
    "Операционный запас покрывает расходы первых месяцев работы. До формирования полной операционной модели его основа рассчитывается по расходам на персонал, а остальные ежемесячные затраты задаются укрупнённо.",
    "До появления полной операционной модели сумма вводится укрупнённо.",
    "Предоплаченные месяцы аренды не учитываются повторно. Обеспечительный платёж показан отдельно.",
    "Рассчитывается от стоимости оборудования, мебели и подготовки помещения.",
    "Следующие этапы расчёта",
    "После выбора конкретного помещения расчёт уточняется на основании технического обследования, планировки и коммерческих предложений поставщиков.",
    "Инженерное обследование помещения",
    "Детализация планировки и технологических решений",
    "Подтверждение стоимости подготовки помещения",
    "Коммерческие предложения по оборудованию и монтажу",
    "Расчёт операционных расходов и финансовой модели",
    "Формирование окончательного инвестиционного бюджета",
    "Принцип расчёта",
    "Расчёт показывает ориентировочную стоимость запуска выбранной конфигурации объекта. Сумма формируется из стоимости помещения, оборудования, мебели, подготовки объекта, операционного запаса и резерва.",
    "Если часть данных требует уточнения, она отображается отдельно и не уменьшает итоговую оценку.",
    "Связанные платежи по аренде учитываются отдельно от безвозвратных расходов.",
  ];
  const approvedCopyMissing = approvedCopy.filter(copy => !sourceText.includes(copy));
  const supersededCopyFound = [
    "Вход в помещение",
    "Что показывает расчёт",
    "Первый совмещённый объект „Колобочной“",
    "Комплектация оборудования и мебель",
    "Мебель посадочного зала учитывается по выбранной ставке на место и не добавляется к расчёту повторно через перечень оснащения.",
    "Что учитывает расчёт",
  ].filter(copy => bodyText.includes(copy));
  const equipmentLabels = await page.locator('[data-control="equipment-scenario"] strong').allTextContents();
  const furnitureLabels = await page.locator('[data-control="furniture-profile"] strong').allTextContents();
  const zeroUnpricedLabelCount = await page.locator(".launch-equipment-summary dl > div").filter({ hasText: /^Без цены\s*0$/ }).count();
  const forbiddenDetail = ["EBITDA", "Окупаемость", "Доходность инвестора", "Точка безубыточности"].filter(term => bodyText.includes(term));
  const forbiddenPublicCopy = ["потребност", "стартовый раунд", "исследование", "research", "approved", "v0.1", "prp-", "canonical", "snapshot", "registry", "payload", "change set", "decision id", "source hash"].filter(term => bodyText.toLowerCase().includes(term));
  const titleAndMetadata = {
    h1: await page.locator("h1").innerText(),
    title: await page.title(),
    ogTitle: await page.locator('meta[property="og:title"]').getAttribute("content"),
    totalHeading: await page.locator(".launch-total-card h2").innerText(),
    legalCount: await page.getByText("Представленная информация носит предварительный характер и не является публичной офертой.", { exact: true }).count(),
  };
  const seatingLabels = await page.locator('[data-control="seating-profile"] strong').allTextContents();
  const seatingHints = await page.locator('[data-control="seating-profile"] span').allTextContents();
  const seatingAriaLabels = await page.locator('[data-control="seating-profile"]').evaluateAll(buttons => buttons.map(button => button.getAttribute("aria-label")));
  const internalDocumentMentions = ["Foundation", "Business Model Architecture", "CODEX_HANDOFF", "Equipment Register"].filter(term => bodyText.includes(term));
  const result = {
    robots,
    defaults,
    preparationScenarios,
    area,
    invalidArea,
    purchase,
    rent,
    rentWithAnnualPrepaymentReserve,
    scenarioTotals,
    allModulesTotal,
    reducedModulesTotal,
    fullConfiguration,
    reducedConfiguration,
    defaultPurchasePrice,
    persistedTotalArea,
    persistedPreparation,
    resetTotalArea,
    resetPreparation,
    resetStorage,
    documents,
    capexLink,
    publicExposure,
    unknownZeroCount,
    overflow,
    focus,
    forbiddenDetail,
    forbiddenPublicCopy,
    titleAndMetadata,
    seatingLabels,
    seatingHints,
    seatingAriaLabels,
    equipmentLabels,
    furnitureLabels,
    approvedCopyMissing,
    supersededCopyFound,
    zeroUnpricedLabelCount,
    internalDocumentMentions,
    consoleMessages,
    pageErrors,
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
  const selectableScenarios = capexSnapshot.scenarios.filter(scenario => scenario.availableInSelector !== false);
  const minimumScenarioButtonCount = await page.locator('[data-scenario-id="minimum"]').count();
  const switchedFormats = [];
  for (const format of capexSnapshot.formats) {
    const button = page.locator(`[data-format-id="${format.id}"]`);
    await button.click();
    switchedFormats.push({ id: format.id, selected: await button.getAttribute("aria-pressed") });
  }

  await page.locator('[data-format-id="FMT-INTEGRATED"]').click();
  const incompleteWarning = await page.getByText("Комплектация формата неполная", { exact: true }).count();
  const scenarioTotals = {};
  for (const scenario of selectableScenarios) {
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

  const gasGrillRow = page.locator('tr[data-item-id="CAPEX-02-001"]');
  const dosingRow = page.locator('tr[data-item-id="CAPEX-02-003"]');
  const hoodRow = page.locator('tr[data-item-id="CAPEX-01-012"]');
  const remainingPriceRows = {
    unpricedCount: Number(await page.locator(".capex-live-summary dl > div").filter({ hasText: "Без цены" }).locator("dd").innerText()),
    gasGrillName: await gasGrillRow.locator('td[data-label="Оборудование"] > strong').innerText(),
    gasGrillQuantity: await gasGrillRow.locator('td[data-label="Количество"] > strong').innerText(),
    gasGrillTotal: parseMoney(await gasGrillRow.locator('td[data-label="Сумма"] > strong').innerText()),
    gasGrillQuoteWithoutUrl: await gasGrillRow.locator(".capex-quote-label").getByText("Требуется КП", { exact: true }).count(),
    gasGrillProductLinkCount: await gasGrillRow.locator(".capex-product-link").count(),
    dosingName: await dosingRow.locator('td[data-label="Оборудование"] > strong').innerText(),
    dosingQuantity: await dosingRow.locator('td[data-label="Количество"] > strong').innerText(),
    dosingUnitPrice: parseMoney(await dosingRow.locator('td[data-label="Цена за единицу"]').innerText()),
    dosingTotal: parseMoney(await dosingRow.locator('td[data-label="Сумма"] > strong').innerText()),
    dosingProductLinkCount: await dosingRow.locator(".capex-product-link").count(),
    hoodVisible: await hoodRow.count(),
  };

  const alcoholToggle = page.locator(".capex-parameters-panel .capex-switch").filter({ hasText: "Алкогольное направление" });
  const alcoholRowsBefore = await page.locator('tr[data-item-id="CAPEX-02-054"], tr[data-item-id="CAPEX-02-055"]').count();
  await alcoholToggle.click();
  const alcoholRowsAfter = await page.locator('tr[data-item-id="CAPEX-02-054"], tr[data-item-id="CAPEX-02-055"]').count();
  const alcoholItemIds = await page.locator('tr[data-item-id="CAPEX-02-054"], tr[data-item-id="CAPEX-02-055"]').evaluateAll(rows => rows.map(row => row.getAttribute("data-item-id")));
  await alcoholToggle.click();
  const alcoholRowsRestored = await page.locator('tr[data-item-id="CAPEX-02-054"], tr[data-item-id="CAPEX-02-055"]').count();

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
    minimumScenarioButtonCount,
    switchedFormats,
    incompleteWarning,
    scenarioTotals,
    ovenQuantity,
    ovenSourceAttrs,
    remainingPriceRows,
    alcoholRowsBefore,
    alcoholRowsAfter,
    alcoholRowsRestored,
    alcoholItemIds,
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
    const launchBudget = await inspectLaunchBudget(browser, baseUrl);
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
      if (!result.internal && result.hiddenCapexRouteLinkCount > 0) failures.push(`${result.path}: exposes hidden CAPEX route`);
      if (!result.internal && result.hiddenLaunchRouteLinkCount > 0) failures.push(`${result.path}: exposes hidden launch-budget route`);
      if (result.consoleMessages.length) failures.push(`${result.path}: console ${result.consoleMessages.join(" | ")}`);
      if (result.pageErrors.length) failures.push(`${result.path}: page errors ${result.pageErrors.join(" | ")}`);
    }

    if (!mobileMenuOpen) failures.push("mobile menu did not open");
    if (sitemap.includes("capex-configurator")) failures.push("sitemap exposes hidden CAPEX route");
    if (sitemap.includes("launch-budget")) failures.push("sitemap exposes hidden launch-budget route");
    if (!String(capex.robots).includes("noindex") || !String(capex.robots).includes("nofollow")) failures.push(`CAPEX robots: ${capex.robots}`);
    if (capex.formatIds.length !== 7 || capex.formatIds.join("|") !== capexSnapshot.formats.map(item => item.id).join("|")) failures.push("CAPEX formats do not match snapshot");
    const selectableScenarioIds = capexSnapshot.scenarios.filter(item => item.availableInSelector !== false).map(item => item.id);
    if (capex.scenarioIds.join("|") !== selectableScenarioIds.join("|")) failures.push("CAPEX selectable scenarios do not match snapshot");
    if (capex.minimumScenarioButtonCount !== 0) failures.push("minimum scenario is still available in selector");
    if (capex.switchedFormats.some(item => item.selected !== "true")) failures.push("one or more CAPEX formats did not switch");
    if (!capex.incompleteWarning) failures.push("required incomplete modules are not surfaced");
    if (!(capex.scenarioTotals.base < capex.scenarioTotals.scale_ready)) failures.push(`CAPEX selectable scenario totals do not change monotonically: ${JSON.stringify(capex.scenarioTotals)}`);
    if (!/^1(?:[,.]0+)?\s*шт\./.test(capex.ovenQuantity)) failures.push(`oven quantity is not one: ${capex.ovenQuantity}`);
    if (!capex.ovenSourceAttrs.href || capex.ovenSourceAttrs.target !== "_blank" || !String(capex.ovenSourceAttrs.rel).includes("noopener") || !String(capex.ovenSourceAttrs.rel).includes("noreferrer")) failures.push("oven product link attributes are unsafe or missing");
    if (capex.remainingPriceRows.unpricedCount !== 0) failures.push(`CAPEX still reports unpriced rows: ${capex.remainingPriceRows.unpricedCount}`);
    if (capex.remainingPriceRows.gasGrillName !== "Газовый гриль для колобков"
      || /такояки/i.test(capex.remainingPriceRows.gasGrillName)
      || !/^2(?:[,.]0+)?\s*шт\./.test(capex.remainingPriceRows.gasGrillQuantity)
      || capex.remainingPriceRows.gasGrillTotal !== 90000
      || capex.remainingPriceRows.gasGrillQuoteWithoutUrl !== 1
      || capex.remainingPriceRows.gasGrillProductLinkCount !== 0) failures.push(`gas grill UI is invalid: ${JSON.stringify(capex.remainingPriceRows)}`);
    if (capex.remainingPriceRows.dosingName !== "Профессиональные ручные шприцы или пистолеты-дозаторы"
      || !/^24(?:[,.]0+)?\s*шт\./.test(capex.remainingPriceRows.dosingQuantity)
      || capex.remainingPriceRows.dosingUnitPrice !== 10000
      || capex.remainingPriceRows.dosingTotal !== 240000
      || capex.remainingPriceRows.dosingProductLinkCount !== 1) failures.push(`dosing equipment UI is invalid: ${JSON.stringify(capex.remainingPriceRows)}`);
    if (capex.remainingPriceRows.hoodVisible !== 1) failures.push("priced extraction hood is missing from the working CAPEX register");
    if (capex.alcoholRowsBefore !== 0
      || capex.alcoholRowsAfter !== 2
      || capex.alcoholRowsRestored !== 0
      || capex.alcoholItemIds.join("|") !== "CAPEX-02-054|CAPEX-02-055") failures.push(`alcohol equipment condition is invalid: ${JSON.stringify({ before: capex.alcoholRowsBefore, after: capex.alcoholRowsAfter, restored: capex.alcoholRowsRestored, ids: capex.alcoholItemIds })}`);
    if (capex.ovenSearchCount !== 1 || capex.otherSearchRows !== 1) failures.push("CAPEX search does not isolate the oven row");
    if (capex.ovenInFoodCourt !== 0) failures.push("food-court format includes the oven without MOD-PREP");
    if (!capex.barModuleVisible) failures.push("optional bar module did not activate");
    if (!(capex.foodCourtWithBarTotal > capex.foodCourtTotal)) failures.push("optional bar module did not change evaluated cost");
    if (capex.customModuleChoices !== capexSnapshot.modules.length) failures.push(`custom format exposes ${capex.customModuleChoices} module choices, expected ${capexSnapshot.modules.length}`);
    if (capex.documentLinks.some(link => !link.href || link.target !== "_blank" || !String(link.rel).includes("noopener") || !String(link.rel).includes("noreferrer"))) failures.push("project document links are missing or unsafe");
    if (capex.documentLinks.some(link => !link.href.endsWith("/preview"))) failures.push("project document links do not use read-only preview mode");
    if (capex.tableHeaders.join("|") !== "ID|Оборудование|Модуль|Обязательность|Количество|Цена за единицу|Сумма|Поставщик|Дата проверки|Статус цены") failures.push("equipment table headers changed");
    if (capex.russianTerms.length) failures.push(`missing Russian UI terms: ${capex.russianTerms.join(", ")}`);
    if (capex.desktopOverflow || capex.tabletOverflow || capex.mobileOverflow) failures.push(`CAPEX overflow desktop=${capex.desktopOverflow} tablet=${capex.tabletOverflow} mobile=${capex.mobileOverflow}`);
    if (!capex.mobileProductLinkVisible) failures.push("product link is not reachable on mobile");
    if (capex.consoleMessages.length) failures.push(`CAPEX console: ${capex.consoleMessages.join(" | ")}`);
    if (capex.pageErrors.length) failures.push(`CAPEX page errors: ${capex.pageErrors.join(" | ")}`);
    if (!String(launchBudget.robots).includes("noindex") || !String(launchBudget.robots).includes("nofollow")) failures.push(`launch-budget robots: ${launchBudget.robots}`);
    if (launchBudget.defaults.rentSelected !== "true"
      || launchBudget.defaults.monthlyRent !== "350000"
      || launchBudget.defaults.prepaymentMonths !== "12"
      || launchBudget.defaults.securityDepositMonths !== "2"
      || launchBudget.defaults.totalArea !== "200"
      || launchBudget.defaults.kitchenArea !== "90"
      || launchBudget.defaults.guestArea !== "80"
      || launchBudget.defaults.otherArea !== "30 м²"
      || launchBudget.defaults.seats !== "50 мест"
      || launchBudget.defaults.furniture !== 425000
      || launchBudget.defaults.premisesEntry !== 4900000
      || launchBudget.defaults.tiedFunds !== 700000
      || launchBudget.defaults.baseSelected !== "true"
      || launchBudget.defaults.barEnabled !== "true"
      || launchBudget.defaults.growEnabled !== "true"
      || launchBudget.defaults.preparationAmount !== 11000000
      || launchBudget.defaults.preparationAccordionExpanded !== "false") failures.push(`launch-budget defaults invalid: ${JSON.stringify(launchBudget.defaults)}`);
    if (launchBudget.preparationScenarios.rowCount !== 8
      || launchBudget.preparationScenarios.defaults.some(value => value !== "true")) failures.push(`launch-budget preparation category defaults invalid: ${JSON.stringify(launchBudget.preparationScenarios)}`);
    if (launchBudget.preparationScenarios.noVentilation.preparation !== 8500000
      || launchBudget.preparationScenarios.noVentilation.status !== "Не включено"
      || launchBudget.preparationScenarios.defaultContingency - launchBudget.preparationScenarios.noVentilation.contingency !== 250000
      || launchBudget.preparationScenarios.defaultLaunchTotal - launchBudget.preparationScenarios.noVentilation.total !== 2750000) failures.push(`launch-budget ventilation exclusion invalid: ${JSON.stringify(launchBudget.preparationScenarios.noVentilation)}`);
    if (launchBudget.preparationScenarios.noVentilationOrDesign !== 7500000
      || launchBudget.preparationScenarios.noDesign !== 10000000
      || launchBudget.preparationScenarios.restoredPreparation !== 11000000) failures.push(`launch-budget preparation restoration invalid: ${JSON.stringify(launchBudget.preparationScenarios)}`);
    if (launchBudget.preparationScenarios.manualBeforeToggle !== 4000000
      || launchBudget.preparationScenarios.manualAfterToggle !== 4000000
      || launchBudget.preparationScenarios.returnedBreakdown !== 8500000) failures.push(`launch-budget manual preparation mode invalid: ${JSON.stringify(launchBudget.preparationScenarios)}`);
    if (launchBudget.defaultPurchasePrice !== "69000000") failures.push(`launch-budget purchase default invalid: ${launchBudget.defaultPurchasePrice}`);
    if (!launchBudget.defaults.totalText.startsWith("от ") || !(launchBudget.defaults.equipmentTotal > 0)) failures.push("launch-budget default state does not show a positive lower bound");
    if (launchBudget.area.other !== "80 м²" || launchBudget.area.seats !== "62 мест" || parseMoney(launchBudget.area.furniture) !== 527000) failures.push(`launch-budget area or furniture math invalid: ${JSON.stringify(launchBudget.area)}`);
    if (launchBudget.invalidArea.alert !== 1 || launchBudget.invalidArea.total !== "Не рассчитано") failures.push("launch-budget invalid area is not blocking total");
    if (launchBudget.purchase.entry !== 20000000 || launchBudget.purchase.reserve !== 12000000 || !(launchBudget.purchase.assets > 20000000)) failures.push(`launch-budget purchase math invalid: ${JSON.stringify(launchBudget.purchase)}`);
    if (launchBudget.rent.entry !== 2500000 || launchBudget.rent.reserve !== 13500000 || launchBudget.rent.tied !== 1000000) failures.push(`launch-budget rent math invalid: ${JSON.stringify(launchBudget.rent)}`);
    if (launchBudget.rentWithAnnualPrepaymentReserve !== 12000000) failures.push(`launch-budget prepaid rent duplicated: ${launchBudget.rentWithAnnualPrepaymentReserve}`);
    if (!(launchBudget.scenarioTotals.MINIMUM < launchBudget.scenarioTotals.BASE && launchBudget.scenarioTotals.BASE < launchBudget.scenarioTotals.SCALE_READY)) failures.push(`launch-budget equipment scenarios invalid: ${JSON.stringify(launchBudget.scenarioTotals)}`);
    if (!(launchBudget.allModulesTotal > launchBudget.reducedModulesTotal)) failures.push("launch-budget BAR/GROW toggles do not change equipment total");
    if (launchBudget.persistedTotalArea !== "321"
      || launchBudget.persistedPreparation.accordionExpanded !== "true"
      || launchBudget.persistedPreparation.manualValue !== "4000000"
      || launchBudget.persistedPreparation.ventilationEnabled !== "false"
      || launchBudget.resetTotalArea !== "200"
      || launchBudget.resetPreparation.amount !== 11000000
      || launchBudget.resetPreparation.accordionExpanded !== "false"
      || launchBudget.resetStorage === null) failures.push(`launch-budget local persistence/reset invalid: ${JSON.stringify({ persisted: launchBudget.persistedTotalArea, persistedPreparation: launchBudget.persistedPreparation, reset: launchBudget.resetTotalArea, resetPreparation: launchBudget.resetPreparation, storage: launchBudget.resetStorage })}`);
    if (launchBudget.documents.length !== 0 || launchBudget.internalDocumentMentions.length) failures.push(`launch-budget exposes internal documents: ${JSON.stringify({ links: launchBudget.documents, mentions: launchBudget.internalDocumentMentions })}`);
    if (launchBudget.capexLink !== 0) failures.push("launch-budget exposes the internal CAPEX configurator");
    if (launchBudget.titleAndMetadata.h1 !== "Расчёт стоимости запуска"
      || launchBudget.titleAndMetadata.title !== "Расчёт стоимости запуска — Колобочная"
      || launchBudget.titleAndMetadata.ogTitle !== "Расчёт стоимости запуска — Колобочная"
      || launchBudget.titleAndMetadata.totalHeading !== "Стоимость запуска"
      || launchBudget.titleAndMetadata.legalCount !== 1) failures.push(`launch-budget title or legal metadata invalid: ${JSON.stringify(launchBudget.titleAndMetadata)}`);
    if (launchBudget.forbiddenPublicCopy.length) failures.push(`launch-budget exposes forbidden internal wording: ${launchBudget.forbiddenPublicCopy.join(", ")}`);
    if (launchBudget.seatingLabels.join("|") !== "Плотная|Сбалансированная|Комфортная") failures.push(`launch-budget seating labels invalid: ${launchBudget.seatingLabels.join(" | ")}`);
    if (launchBudget.seatingHints.join("|") !== "1,4 м² на место|1,6 м² на место|1,8 м² на место") failures.push(`launch-budget seating hints invalid: ${launchBudget.seatingHints.join(" | ")}`);
    if (launchBudget.seatingAriaLabels.join("|") !== "Плотная посадка — 1,4 м² на место|Сбалансированная посадка — 1,6 м² на место|Комфортная посадка — 1,8 м² на место") failures.push(`launch-budget seating accessibility labels invalid: ${launchBudget.seatingAriaLabels.join(" | ")}`);
    if (launchBudget.equipmentLabels.join("|") !== "Минимальная|Базовая|Рост") failures.push(`launch-budget equipment labels invalid: ${launchBudget.equipmentLabels.join(" | ")}`);
    if (launchBudget.furnitureLabels.join("|") !== "Функциональная|Сбалансированная|Комфорт") failures.push(`launch-budget furniture labels invalid: ${launchBudget.furnitureLabels.join(" | ")}`);
    if (launchBudget.approvedCopyMissing.length) failures.push(`launch-budget approved copy missing: ${launchBudget.approvedCopyMissing.join(" | ")}`);
    if (launchBudget.supersededCopyFound.length) failures.push(`launch-budget superseded copy remains: ${launchBudget.supersededCopyFound.join(" | ")}`);
    if (launchBudget.zeroUnpricedLabelCount !== 0) failures.push("launch-budget renders 'Без цены — 0'");
    if (!launchBudget.fullConfiguration.some(item => item.includes("Бар и напитки"))
      || !launchBudget.fullConfiguration.some(item => item.includes("Выращивание зелени"))
      || launchBudget.reducedConfiguration.some(item => item.includes("Бар и напитки") || item.includes("Выращивание зелени"))) failures.push(`launch-budget current configuration is not dynamic: ${JSON.stringify({ full: launchBudget.fullConfiguration, reduced: launchBudget.reducedConfiguration })}`);
    if (launchBudget.publicExposure.nav || launchBudget.publicExposure.footer) failures.push(`launch-budget exposed in public navigation: ${JSON.stringify(launchBudget.publicExposure)}`);
    if (launchBudget.unknownZeroCount > 0) failures.push("launch-budget renders an unknown item as 0 ₽");
    if (Object.values(launchBudget.overflow).some(Boolean)) failures.push(`launch-budget overflow: ${JSON.stringify(launchBudget.overflow)}`);
    if (!launchBudget.focus.tag || launchBudget.focus.outlineStyle === "none" || launchBudget.focus.outlineWidth === "0px") failures.push(`launch-budget keyboard focus is not visible: ${JSON.stringify(launchBudget.focus)}`);
    if (launchBudget.forbiddenDetail.length) failures.push(`launch-budget contains forbidden detailed metrics: ${launchBudget.forbiddenDetail.join(", ")}`);
    if (launchBudget.consoleMessages.length) failures.push(`launch-budget console: ${launchBudget.consoleMessages.join(" | ")}`);
    if (launchBudget.pageErrors.length) failures.push(`launch-budget page errors: ${launchBudget.pageErrors.join(" | ")}`);
    if (formStatus.includes("Спасибо")) failures.push("form showed false success without endpoint");

    const report = { baseUrl, checkedAt: new Date().toISOString(), results, mobileMenuOpen, capex, launchBudget, formStatus, failures };
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
