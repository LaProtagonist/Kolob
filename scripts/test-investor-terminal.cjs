const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");

const projectRoot = path.resolve(__dirname, "..");
// Verification may run multiple browser domains concurrently. A per-process
// port prevents another local Vite check from taking down this scenario.
const requestedPort = Number(process.env.INVESTOR_TERMINAL_TEST_PORT ?? 9_000 + (process.pid % 1_000));
const useExternalServer = Boolean(process.env.INVESTOR_TERMINAL_TEST_PORT);
let port = requestedPort;
let baseUrl = `http://127.0.0.1:${port}`;
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

function viteNodeBinary() {
  const candidates = [process.env.VITE_NODE_BINARY, process.execPath, ...String(process.env.PATH ?? "").split(path.delimiter).map((directory) => path.join(directory, "node"))]
    .filter(Boolean);
  for (const candidate of [...new Set(candidates)]) {
    const version = spawnSync(candidate, ["--version"], { encoding: "utf8" });
    const major = Number(/^v(\d+)/.exec(version.stdout ?? "")?.[1] ?? 0);
    if (major >= 20) return candidate;
  }
  throw new Error("Investor Terminal browser scenario requires Node.js 20+ to launch Vite. Set VITE_NODE_BINARY to a compatible executable.");
}

async function startServer() {
  if (useExternalServer) {
    if (await responds()) return { stop: async () => {} };
    throw new Error(`Configured Investor Terminal test server is unavailable at ${baseUrl}.`);
  }
  for (let attempt = 0; attempt < 20; attempt += 1) {
    port = requestedPort + attempt;
    baseUrl = `http://127.0.0.1:${port}`;
    const server = spawn(viteNodeBinary(), ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", String(port), "--strictPort"], {
      cwd: projectRoot,
      env: process.env,
      stdio: "ignore",
    });
    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline) {
      if (await responds()) return { stop: async () => { if (server.exitCode === null) server.kill("SIGTERM"); } };
      if (server.exitCode !== null) break;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    if (server.exitCode === null) server.kill("SIGTERM");
  }
  throw new Error("Investor Terminal dev server did not become available on an isolated test port.");
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

  async function assertAmount(testId, expected, message) {
    assert.ok(Math.abs((await amount(testId)) - expected) < 0.01, message);
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
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.getByRole("button", { name: "Экономика точки" }).click();
    await checks.waitFor();
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.getByRole("button", { name: "Масштабирование" }).click();
    await page.getByRole("heading", { name: "Масштабирование" }).waitFor();
    await page.waitForFunction(() => window.scrollY === 0);
    const scalingInitialView = await page.locator("#base-object-title").evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return { top: rect.top, bottom: rect.bottom, viewport: window.innerHeight };
    });
    assert.ok(scalingInitialView.top >= 0 && scalingInitialView.top < scalingInitialView.viewport && scalingInitialView.bottom > 0, "Scaling opens at meaningful visible content without a scroll-triggered paint");
    await page.screenshot({ path: path.join(projectRoot, ".cache/verification/screenshots/investor-terminal-scaling-initial-tablet.png") });
    await page.setViewportSize({ width: 1440, height: 900 });
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
    assert.equal(await page.getByTestId(`scaling-cohort-opening-${nevskyId}`).inputValue(), "7", "the first additional point opens after the governed four-month lead");
    assert.equal(await page.getByTestId(`scaling-cohort-rent-free-${nevskyId}`).inputValue(), "2", "Creative Cluster has the approved two-month rent-free period");
    assert.match(await page.getByTestId(`scaling-cohort-editor-${nevskyId}`).innerText(), /Разгон[\s\S]*Сезонность/i, "the selected group makes the time model visible without a 60-month form");

    await page.getByTestId(`scaling-cohort-row-${historicId}`).click();
    assert.equal(await page.getByTestId(`scaling-cohort-area-${historicId}`).inputValue(), "60", "the standalone seating rollout point respects the 60 m² minimum");
    assert.equal(await page.getByTestId(`scaling-cohort-rent-rate-${historicId}`).inputValue(), "3 500");
    assert.equal(await page.getByTestId(`scaling-cohort-rent-${historicId}`).inputValue(), "210 000");
    assert.equal(await page.getByLabel("Предоплата").inputValue(), "12", "street rent defaults to twelve months prepaid rent");
    assert.equal(await page.getByLabel("Обеспечительный платёж").inputValue(), "2", "street rent defaults to a two-month deposit");
    assert.equal(await page.getByLabel("Коммунальные / мес.").inputValue(), "80 000", "the approved street-seating utility default is placed directly in the field");
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
    assert.equal(await page.getByLabel("Рабочая зона").count(), 0, "Foodhall does not expose a meaningless empty work-area input");
    assert.equal(await page.getByTestId(`scaling-cohort-editor-${foodhallId}`).getByText("Определяется площадкой", { exact: true }).count(), 1, "Foodhall explains its venue-defined work area without a blank numeric field");
    assert.equal(await page.getByTestId(`scaling-cohort-editor-${foodhallId}`).locator(".cohort-static-value output").count(), 4, "Foodhall visibly distinguishes venue-defined work area and excludes street prepayment, deposit and rent holidays");
    assert.match(await page.getByTestId(`scaling-cohort-editor-${foodhallId}`).innerText(), /Подготовка помещения\s*712 500 ₽/i, "Foodhall includes its venue adaptation preparation by default");
    assert.equal(await page.getByTestId(`scaling-cohort-preparation-${foodhallId}`).getByText("Показать состав").count(), 1);
    await page.getByTestId(`scaling-cohort-preparation-${foodhallId}`).getByText("Показать состав").click();
    const foodhallPreparation = page.getByTestId(`scaling-cohort-preparation-${foodhallId}`);
    assert.match(await foodhallPreparation.innerText(), /Общестроительная адаптация[\s\S]*375 000 ₽/i, "Foodhall preparation exposes the category calculation");
    assert.equal(await foodhallPreparation.locator("label").filter({ hasText: "Электроснабжение" }).locator("input").isChecked(), false, "Foodhall engineering categories remain optional");
    assert.match(await foodhallPreparation.innerText(), /Подготовка торгового зала[\s\S]*Не применяется/i, "Foodhall shared seating excludes guest-area preparation");
    const foodhallOpex = page.getByTestId(`scaling-cohort-editor-${foodhallId}`).locator(".cohort-direct-opex");
    assert.equal(await foodhallOpex.getByText("Коммунальные", { exact: true }).count(), 0, "Foodhall does not show a zero utilities row beside its service-and-utilities contract line");
    assert.equal(await foodhallOpex.getByText("Музыка и права", { exact: true }).count(), 1, "venue-provided music remains explainable");
    assert.match(await foodhallOpex.getByTestId(`scaling-cohort-opex-state-${foodhallId}-music`).innerText(), /Музыка и права\s*Включено площадкой/, "venue-provided music is a state, not a misleading 0 ₽ expense");
    assert.match(await foodhallOpex.getByTestId(`scaling-cohort-opex-state-${foodhallId}-security-monitoring`).innerText(), /Пультовая охрана\s*Включено площадкой/, "venue-provided security is a state, not a misleading 0 ₽ expense");
    assert.equal(await foodhallOpex.getByText("Санитарная обработка", { exact: true }).count(), 1, "internal Pest control terminology is localized for investors");
    assert.equal(await foodhallOpex.getByText("Pest control", { exact: true }).count(), 0, "English internal OPEX terminology does not leak into the investor UI");
    await page.getByTestId(`scaling-cohort-row-${nevskyId}`).click();
    assert.equal(await page.getByTestId(`scaling-cohort-rent-rate-${nevskyId}`).inputValue(), "4 000", "Creative Cluster receives its rent-rate default from the planning model");
    assert.equal(await page.getByTestId(`scaling-cohort-rent-${nevskyId}`).inputValue(), "160 000", "Creative Cluster receives its monthly rent default from the planning model");
    assert.equal(await page.getByLabel("Предоплата").inputValue(), "12", "Creative Cluster receives its approved twelve-month prepayment default");
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
    assert.ok((await amount("scaling-upfront-funding")) < (await amount("scaling-network-total")), "dated rollout funding and generated FCF make upfront external funding distinct from total programme investment");

    const summary = page.locator(".scaling-results");
    const networkParameters = page.locator("#network-costs-title").locator("xpath=ancestor::section[1]");
    assert.equal(await page.getByRole("heading", { name: "Общие параметры сети" }).count(), 1, "network controls distinguish reference parameters from incremental OPEX");
    assert.match(await networkParameters.innerText(), /Дополнительные расходы[\s\S]*Адм\. расходы, 2%[\s\S]*Учтено в базовом объекте[\s\S]*Управляющий[\s\S]*Учтён в базе/i, "Base-only shared functions are labelled as reference information, not incremental Expansion OPEX");
    assert.match(await networkParameters.innerText(), /Собственный рефрижератор включён в расчёт\./, "owned-logistics helper reflects the active B5 logistics mode");
    assert.match(await networkParameters.innerText(), /Мощность требует проверки\./, "capacity receives one contextual short status in network settings");
    const operatingSummary = page.getByTestId("scaling-network-operating");
    assert.equal((await operatingSummary.locator("p").first().textContent())?.trim(), "Расходы расширения", "the summary names its incremental scope rather than all network costs");
    assert.equal(await operatingSummary.getByText("Управляющий сети", { exact: true }).count(), 0, "base manager is not rendered as a misleading zero expansion row");
    assert.equal(await operatingSummary.getByText("Общий маркетинг", { exact: true }).count(), 0, "base fixed marketing is not rendered as a misleading zero expansion row");
    assert.equal(await operatingSummary.getByTestId("scaling-network-operating-status").innerText(), "База не дублируется.", "a compact scope note explains omitted Base functions");
    assert.match(await operatingSummary.innerText(), /Спецодежда производства[\s\S]*Медосмотры производства/, "incremental Production uniforms and medical are labelled by their actual scope");
    assert.match(await operatingSummary.innerText(), /Адм\. расходы, 2%/, "the 2% OPEX line is distinct from the liquidity reserve");
    assert.match(await summary.innerText(), /Окупаемость объекта[\s\S]*Окупаемость расширения[\s\S]*Инвестиции программы[\s\S]*Окупаемость сети/, "summary labels distinguish Base, Expansion and Network metrics");
    assert.equal(await page.getByTestId("scaling-network-sales-status").innerText(), "Предварительный расчёт.", "the summary exposes one compact overall status without duplicate coverage taxonomy");

    const assumptions = page.locator("#unresolved-title").locator("xpath=ancestor::section[1]");
    assert.equal(await page.getByRole("heading", { name: "Что требуется подтвердить" }).count(), 1, "coverage is presented as investor-facing assumptions and limitations");
    assert.equal(await assumptions.locator(".scaling-multiplier").count(), 0, "assumptions do not display a hardcoded or opaque count badge");
    assert.equal(await page.getByRole("button", { name: "Показать параметры для уточнения", exact: true }).getAttribute("aria-expanded"), "false", "assumptions are collapsed by default");
    await page.getByRole("button", { name: "Показать параметры для уточнения", exact: true }).click();
    const assumptionText = await page.getByTestId("scaling-unresolved").innerText();
    assert.match(assumptionText, /Налоговый режим[\s\S]*Кассовые сервисы \(YUMA\)[\s\S]*Банковское обслуживание[\s\S]*Мощность производства[\s\S]*Рефрижератор[\s\S]*Внешняя логистика на старте/, "one structured investor-facing list renders every current disclosure once");
    assert.doesNotMatch(assumptionText, /TBD|maintenance|carrier|route quote|requires_confirmation|review_required/i, "assumptions do not expose technical coverage terminology");

    const directPointOpex = await amount("scaling-network-direct-opex");
    const expansionProduction = await amount("scaling-expansion-production-opex");
    const expansionAdminReserve = await amount("scaling-expansion-admin-reserve");
    const expansionUniforms = await amount("scaling-expansion-uniforms");
    const expansionMedical = await amount("scaling-expansion-medical");
    const expansionLogistics = await amount("scaling-logistics-opex");
    const expansionOpex = await amount("scaling-expansion-opex");
    assert.ok(Math.abs(directPointOpex + expansionProduction + expansionAdminReserve + expansionUniforms + expansionMedical + expansionLogistics - expansionOpex) < 0.01, "Direct Point OPEX plus incremental Production and Shared OPEX equals Expansion OPEX");
    assert.ok(Math.abs(Number(await summary.getAttribute("data-base-opex-rub")) + expansionOpex - (await amount("scaling-network-opex"))) < 0.01, "Base OPEX plus Expansion OPEX equals consolidated Network OPEX");

    // The operating model remains unchanged by the lead-time correction; only
    // dated cash and resulting temporal funding/payback are expected to move.
    await assertAmount("scaling-base-fcf", 2_045_009.8, "Base FCF remains unchanged by the Creative Cluster contract correction");
    await assertAmount("scaling-network-direct-opex", 16_195_358.96466331, "Direct Point OPEX remains unchanged by the Creative Cluster contract correction");
    await assertAmount("scaling-expansion-production-opex", 158_505.51000000004, "incremental Production payroll remains unchanged");
    await assertAmount("scaling-expansion-admin-reserve", 499_956.60000000003, "Expansion administrative reserve remains unchanged");
    await assertAmount("scaling-logistics-opex", 250_000, "Expansion logistics remains unchanged");
    await assertAmount("scaling-expansion-opex", 17_105_071.07, "Expansion OPEX total remains unchanged");
    await assertAmount("scaling-network-fcf", 9_412_362.58, "Network FCF remains unchanged");
    await assertAmount("scaling-expansion-reserve", 33_930_155.34, "Expansion reserve uses the unified B5 reserve policy");
    await assertAmount("scaling-network-total", 102_702_001.73, "Total Program Investment includes the additional Creative Cluster prepaid rent");
    await assertAmount("scaling-upfront-funding", 67_491_710.57, "Upfront Investor Funding reflects serial, format-specific funding dates");
    assert.equal(await page.getByTestId("scaling-network-payback").getAttribute("data-payback-month"), "22", "Network temporal payback is recalculated from sequential format-specific openings");

    async function assertSummaryLayout(width, height, name) {
      await page.setViewportSize({ width, height });
      const layout = await summary.evaluate((element) => {
        const summaryRect = element.getBoundingClientRect();
        const rows = [...element.querySelectorAll("dl > div")].map((row) => {
          const label = row.querySelector("dt");
          const value = row.querySelector("dd");
          const rowRect = row.getBoundingClientRect();
          const valueRect = value?.getBoundingClientRect();
          return {
            label: label?.textContent?.trim(),
            valueVisible: Boolean(valueRect && valueRect.width > 0 && valueRect.left >= rowRect.left - 1 && valueRect.right <= summaryRect.right + 1),
            valueNoWrap: value ? getComputedStyle(value).whiteSpace === "nowrap" : false,
          };
        });
        return {
          pageOverflow: document.documentElement.scrollWidth > window.innerWidth,
          summaryOverflow: element.scrollWidth > element.clientWidth,
          rows,
        };
      });
      assert.equal(layout.pageOverflow, false, `${name}: page has no horizontal overflow`);
      assert.equal(layout.summaryOverflow, false, `${name}: summary has no horizontal overflow`);
      assert.ok(layout.rows.length > 0 && layout.rows.every((row) => row.valueVisible && row.valueNoWrap), `${name}: every summary value stays visible and non-wrapping`);
    }

    await assertSummaryLayout(1440, 900, "desktop");
    await assertSummaryLayout(1024, 768, "tablet landscape");
    await assertSummaryLayout(390, 844, "mobile");

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

    await page.locator("details.base-object-details, details.cohort-rent-preset-reference, details.cohort-preparation-details, details.cohort-items, details.cohort-temporal-details, details.scaling-item").evaluateAll((elements) => elements.forEach((element) => { element.open = true; }));
    const renderedScalingText = await page.locator(".scaling-workspace").innerText();
    assert.doesNotMatch(renderedScalingText, /\bPest\b|\bsanitation\b|\bTBD\b|\bmaintenance\b|\bshared\b|\bcarrier\b|\broute quote\b|\bHistorical\b|calculated zero|\bgeneric\b|requires_confirmation|review_required/i, "opened investor-facing sections do not leak audited English or internal terminology");
    await page.addStyleTag({ content: ".site-header, .scaling-results { position: static !important; max-height: none !important; overflow: visible !important; }" });
    await foodhallOpex.screenshot({ path: path.join(projectRoot, ".cache/verification/screenshots/investor-terminal-foodhall-opex-desktop.png") });
    await networkParameters.screenshot({ path: path.join(projectRoot, ".cache/verification/screenshots/investor-terminal-network-parameters-desktop.png") });
    await assumptions.screenshot({ path: path.join(projectRoot, ".cache/verification/screenshots/investor-terminal-assumptions-desktop.png") });
    await page.locator(".scaling-results").screenshot({ path: path.join(projectRoot, ".cache/verification/screenshots/investor-terminal-summary-desktop.png") });
    await page.screenshot({ path: path.join(projectRoot, ".cache/verification/screenshots/investor-terminal-ui-review-full-desktop.png"), fullPage: true });
    await page.screenshot({ path: path.join(projectRoot, ".cache/verification/screenshots/investor-terminal-ui-review-audit-desktop.png"), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator("details.base-object-details, details.cohort-rent-preset-reference, details.cohort-preparation-details, details.cohort-items, details.cohort-temporal-details, details.scaling-item").evaluateAll((elements) => elements.forEach((element) => { element.open = false; }));
    if (await page.getByRole("button", { name: "Скрыть параметры" }).count()) await page.getByRole("button", { name: "Скрыть параметры" }).click();
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

    await page.getByRole("button", { name: "Условия участия" }).click();
    const investorEconomics = page.getByTestId("investor-economics-public");
    await investorEconomics.waitFor();
    assert.equal(await page.getByRole("heading", { name: "Сценарии для обсуждения" }).count(), 1, "Investor Economics is a distinct third Terminal section");
    assert.equal(await investorEconomics.locator("input, select").count(), 0, "public participation has no editable deal controls");
    assert.equal(await investorEconomics.locator('[data-testid^="public-preset-"]').count(), 3, "public participation has exactly three discussion presets");
    assert.equal(await investorEconomics.getByText("Доля в денежном потоке", { exact: true }).count(), 0, "capped cash-flow is not a public participation scenario");
    assert.equal(await investorEconomics.getByText("Все варианты", { exact: true }).count(), 0, "public participation omits workbench permutations");
    const publicComparisonHeader = await investorEconomics.locator(".investor-economics-comparison-table thead").innerText();
    assert.equal(publicComparisonHeader.replace(/\s+/g, " ").trim(), "Сценарий Капитал / обязательство Возврат вложений Cash IRR к М60 Cash MOIC к М60 Права инвестора", "public comparison keeps only the six decision-useful columns");
    assert.doesNotMatch(publicComparisonHeader, /Первые выплаты|денежный поток/i, "public comparison does not duplicate the selected-scenario first-payment timing");
    const maturityTable = investorEconomics.locator(".investor-economics-maturity");
    await maturityTable.locator("summary").click();
    const maturityHeader = await maturityTable.locator("thead").innerText();
    assert.equal(maturityHeader.replace(/\s+/g, " ").trim(), "Объект Финансирование Срок подготовки Открытие / первые продажи Плановый режим", "maturity disclosure keeps one non-duplicated plan-mode milestone");
    assert.doesNotMatch(maturityHeader, /Первый зрелый FCF/i, "maturity disclosure does not duplicate the full-plan milestone as a separate FCF column");
    assert.ok(
      await maturityTable.locator("tbody tr").evaluateAll(
        (rows) => rows.length > 0 && rows.every((row) => row.children.length === 5 && [...row.children].every((cell) => Boolean(cell.textContent?.trim()))),
      ),
      "maturity rows contain exactly the five useful non-empty values",
    );
    assert.equal(await investorEconomics.getByText("Предварительный расчёт: требуется проверка мощности производства.", { exact: true }).count(), 1, "capacity caveat appears once in the public participation view");
    const programmeInvestment = await amount("economics-programme-investment");
    const externalFunding = await amount("economics-current-external-funding");
    assert.ok(Math.abs((await amount("economics-business-self-financing")) - (programmeInvestment - externalFunding)) < 0.01, "self-financing explains the difference between total programme investment and external funding");
    await page.getByTestId("public-preset-INV-EQUITY-DISCUSSION").click();
    const equityWaterfall = investorEconomics.locator(".investor-economics-waterfall");
    await equityWaterfall.getByText("Показать помесячный расчёт", { exact: true }).click();
    assert.ok(await equityWaterfall.locator("tbody tr").filter({ hasText: /М[1-9]|М1\d/ }).count() > 0, "public Equity exposes dated staged funding in its audit layer");
    await equityWaterfall.getByText("Показать помесячный расчёт", { exact: true }).click();
    await page.getByTestId("public-preset-INV-FULL-PROGRAMME-DISCUSSION").click();
    const commitment = await amount("economics-commitment");
    const actualContributions = await amount("economics-actual-contributions");
    assert.equal(commitment, programmeInvestment, "full-programme commitment equals the dated programme total");
    assert.ok(Math.abs(actualContributions - commitment) < 0.02, "staged full-programme drawdowns total the commitment without being an M0 outflow");
    assert.match(await investorEconomics.getByLabel("Итог выбранного сценария").innerText(), /Доля в компании после возврата[\s\S]*40%/, "full programme exposes its 40% residual equity right rather than a direct FCF share");
    const economicsWaterfall = investorEconomics.locator(".investor-economics-waterfall");
    assert.equal(await economicsWaterfall.getAttribute("open"), null, "the 60-month waterfall is collapsed in the executive view");
    await investorEconomics.screenshot({ path: path.join(projectRoot, ".cache/verification/screenshots/investor-economics-full-programme-executive-desktop.png") });
    await investorEconomics.getByText("Показать помесячный расчёт", { exact: true }).click();
    const waterfall = investorEconomics.locator(".investor-economics-waterfall");
    assert.match(await waterfall.innerText(), /Потребность программы[\s\S]*М0/, "monthly investor waterfall exposes dated drawdowns and business funding needs");
    for (const [width, height, label] of [[1440, 900, "desktop"], [1024, 768, "tablet"], [390, 844, "mobile"]]) {
      await page.setViewportSize({ width, height });
      const layout = await investorEconomics.evaluate((element) => ({
        overflow: document.documentElement.scrollWidth > window.innerWidth,
        summaryVisible: Boolean(element.querySelector(".investor-economics-summary")),
        maturityHasLocalOverflow: (() => {
          const wrapper = element.querySelector(".investor-economics-maturity .investor-economics-table-wrap");
          return wrapper instanceof HTMLElement && wrapper.scrollWidth > wrapper.clientWidth;
        })(),
        maturityCellsClipped: [...element.querySelectorAll(".investor-economics-maturity th, .investor-economics-maturity td")]
          .some((cell) => cell instanceof HTMLElement && cell.scrollWidth > cell.clientWidth),
        waterfallHasLocalOverflow: (() => {
          const wrapper = element.querySelector("[data-testid=\"economics-waterfall-scroll\"]");
          return wrapper instanceof HTMLElement && wrapper.scrollWidth > wrapper.clientWidth;
        })(),
      }));
      assert.equal(layout.overflow, false, `Investor Economics ${label} has no horizontal page overflow`);
      assert.equal(layout.summaryVisible, true, `Investor Economics ${label} retains its scenario summary`);
      assert.equal(layout.maturityHasLocalOverflow, false, `Investor Economics ${label} fits the compact maturity table without local overflow`);
      assert.equal(layout.maturityCellsClipped, false, `Investor Economics ${label} renders every maturity-table cell without clipping`);
      if (label !== "desktop") assert.equal(layout.waterfallHasLocalOverflow, true, `Investor Economics ${label} keeps wide waterfall columns inside its local scroller`);
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    await investorEconomics.screenshot({ path: path.join(projectRoot, ".cache/verification/screenshots/investor-economics-full-programme-desktop.png") });

    await page.goto(`${baseUrl}/control/participation`, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "Конструктор условий участия" }).waitFor();
    assert.ok(await page.locator(".investor-economics input, .investor-economics select").count() > 0, "internal workbench retains editable candidate controls");
    assert.equal(await page.getByTestId("published-scenario").count(), 1, "workbench exposes the governed published scenario beside the candidate");
    assert.equal(await page.getByTestId("published-candidate-comparison").count(), 1, "workbench exposes a published-versus-candidate comparison");
    const publicPresetBeforeCandidateEdit = await page.getByTestId("published-scenario").innerText();
    const equityInput = page.getByLabel("Доля в компании");
    await equityInput.fill("32");
    await equityInput.press("Tab");
    assert.match(await page.getByTestId("published-candidate-comparison").innerText(), /35%[\s\S]*32%/, "candidate terms update live while published terms stay fixed");
    assert.match(await page.getByTestId("candidate-all-scenario-comparison").innerText(), /32% компании/, "candidate all-scenario comparison uses current workbench inputs");
    await page.getByTestId("candidate-reset").click();
    assert.equal(await equityInput.inputValue(), "35", "reset copies the governed published value back into the candidate");
    await page.locator(".investor-economics-internal-models").evaluate((element) => { element.open = true; });
    await page.getByTestId("workbench-scenario-capped").click();
    assert.equal(await page.getByLabel("Лимит выплат").count(), 1, "capped cash-flow support remains available inside the internal workbench");
    await page.goto(`${baseUrl}/investor-terminal`, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Условия участия" }).click();
    assert.match(await page.getByTestId("investor-economics-public").innerText(), /35% компании/, "candidate workbench state cannot mutate a published preset");
    assert.notEqual(publicPresetBeforeCandidateEdit, "", "published state was observable before candidate editing");

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
