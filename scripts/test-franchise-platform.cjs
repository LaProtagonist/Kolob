const assert = require("node:assert/strict");
const path = require("node:path");
const { spawn } = require("node:child_process");

const projectRoot = path.resolve(__dirname, "..");
const port = Number(process.env.FRANCHISE_PLATFORM_TEST_PORT ?? 9_200 + (process.pid % 500));
const baseUrl = `http://127.0.0.1:${port}`;
const forbiddenUiTerms = [
  "Архитектура масштаба",
  "Цифровая операционная система сети",
  "Экономика платформы",
  "Петля масштаба",
  "Franchise Platform Strategy",
  "Franchise Operating System",
  "settlement",
  "HeadCo",
  "Core Strategy",
  "Scenario Profiles",
  "Media Program",
  "Future layers",
  "READY_PRODUCTION_BASE",
  "CUSTOM_PRODUCTION_BASE",
  "OWNED_PRODUCTION_BASE",
];
const requiredCoreUiTerms = [
  "Архитектура масштабирования",
  "Цифровая система управления сетью",
  "Экономика головной компании и франчайзи",
  "Экономический эффект масштаба",
  "Результат первого этапа",
];
const forbiddenPetrogradkaTerms = [
  "исследовательский сценарий",
  "сценарий, не базовая модель",
  "требует письменного подтверждения",
  "допущение для расчёта",
  "до получения входов сценарий не формирует финансовый результат",
  "статус сценария",
];
const requiredPetrogradkaTerms = [
  "Предлагаемая роль объекта",
  "Почему объект подходит",
  "Оборудование, указанное в объявлении",
  "Инженерная инфраструктура",
  "Что добавляет проект",
  "Ориентировочный бюджет первого этапа",
  "Варианты запуска",
  "Капиталоэффективный сценарий",
  "Что необходимо подтвердить",
  "Предлагаемый формат",
  "Следующий шаг",
];

async function responds() {
  try {
    return (await fetch(baseUrl)).ok;
  } catch {
    return false;
  }
}

async function startServer() {
  if (await responds()) return { stop: async () => {} };
  const server = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", String(port), "--strictPort"], {
    cwd: projectRoot,
    env: process.env,
    stdio: "ignore",
  });
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (await responds()) return { stop: async () => { if (server.exitCode === null) server.kill("SIGTERM"); } };
    if (server.exitCode !== null) throw new Error(`Vite exited before Franchise Platform became available (${server.exitCode}).`);
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  server.kill("SIGTERM");
  throw new Error("Franchise Platform dev server did not become available.");
}

async function assertNoOverflow(page, label) {
  const size = await page.evaluate(() => ({ viewport: window.innerWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
  assert.ok(size.document <= size.viewport + 1, `${label}: document overflow ${JSON.stringify(size)}`);
  assert.ok(size.body <= size.viewport + 1, `${label}: body overflow ${JSON.stringify(size)}`);
}

async function assertLocalizedInvestorCopy(page, testId, requiredTerms = []) {
  const text = await page.getByTestId(testId).innerText();
  for (const term of forbiddenUiTerms) {
    assert.equal(text.toLowerCase().includes(term.toLowerCase()), false, `Investor UI must not display ${term}`);
  }
  for (const term of requiredTerms) {
    assert.equal(text.includes(term), true, `Investor UI must display ${term}`);
  }
  return text;
}

async function assertScenarioGutters(page, viewport, label) {
  const gutters = await page.locator(".franchise-scenario-page .section-inner").evaluateAll((nodes) => nodes.map((node) => {
    const rect = node.getBoundingClientRect();
    return { left: rect.left, right: window.innerWidth - rect.right };
  }));
  const minimum = viewport.width <= 560 ? 16 : viewport.width <= 1080 ? 24 : 32;
  assert.ok(gutters.length >= 2, `${label}: scenario must have hero and main containers`);
  for (const gutter of gutters) {
    assert.ok(gutter.left >= minimum - 1, `${label}: left gutter ${gutter.left}px is below ${minimum}px`);
    assert.ok(gutter.right >= minimum - 1, `${label}: right gutter ${gutter.right}px is below ${minimum}px`);
  }
}

async function assertPetrogradkaPresentation(page) {
  const text = await assertLocalizedInvestorCopy(page, "petrogradka-scenario-page", requiredPetrogradkaTerms);
  for (const term of forbiddenPetrogradkaTerms) {
    assert.equal(text.toLowerCase().includes(term), false, `Petrogradka owner presentation must not display ${term}`);
  }
  assert.match(text, /Предлагаем использовать существующее оборудованное пищевое производство как первый центральный заготовочный узел «Колобочной»/);
  assert.match(text, /Центральная производственная база сети с возможностью размещения эталонной торговой функции внутри помещения/);
  assert.match(text, /до 2,5 млн ₽[\s\S]*от 6 млн ₽[\s\S]*≈11,5–12,5 млн ₽/);
  assert.match(text, /В оценку пока не включены[\s\S]*аренда и депозит по Петроградке[\s\S]*фонд оплаты труда[\s\S]*первоначальный товарный запас/);
  assert.match(text, /После этого сценарий переводится из предварительной оценки в точный план запуска с бюджетом и сроками/);
  assert.equal(await page.locator('[data-status="available_subject_to_confirmation"]').count(), 0);
  assert.equal(await page.locator("#petrogradka-budget-title > div").count(), 5, "budget has no duplicated subtotal row");
  assert.equal(await page.getByRole("link", { name: "Обсудить условия" }).getAttribute("href"), "/investor-questions");
}

async function verifyRoute(browser, pathname, testId, viewport) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  await page.goto(`${baseUrl}${pathname}`, { waitUntil: "networkidle" });
  await page.getByTestId(testId).waitFor();
  await assertNoOverflow(page, `${pathname} ${viewport.width}px`);
  if (testId === "petrogradka-scenario-page") await assertScenarioGutters(page, viewport, `${pathname} ${viewport.width}px`);
  assert.equal(await page.locator('meta[name="robots"]').getAttribute("content"), "noindex, nofollow");
  assert.deepEqual(errors, [], `${pathname} has no runtime errors at ${viewport.width}px`);
  await context.close();
}

async function run() {
  process.env.PLAYWRIGHT_BROWSERS_PATH = path.join(projectRoot, ".playwright-browsers");
  const { chromium } = require("playwright");
  const server = await startServer();
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });

    await page.goto(`${baseUrl}/investor/franchise-platform`, { waitUntil: "networkidle" });
    await page.getByTestId("franchise-platform-page").waitFor();
    assert.equal(await page.locator("h1").innerText(), "Стратегия масштабирования сети");
    assert.equal(await page.locator('meta[name="robots"]').getAttribute("content"), "noindex, nofollow");
    const coreText = await assertLocalizedInvestorCopy(page, "franchise-platform-page", requiredCoreUiTerms);
    assert.match(coreText, /Центральное производство, цифровая система управления сетью и франчайзинговая модель позволяют развивать сеть без пропорционального роста капитальных затрат головной компании/);
    assert.match(await page.getByTestId("franchise-platform-page").innerText(), /Рабочие параметры сценария — не утверждённые условия франшизы/);
    assert.match(await page.getByTestId("franchise-money-flow").innerText(), /Гость[\s\S]*Франчайзи[\s\S]*оплата заготовок[\s\S]*центральное производство[\s\S]*результат франчайзи/i);
    assert.match(await page.getByTestId("franchise-first-stage").innerText(), /Первый этап должен создать не отдельную торговую точку, а базовую инфраструктуру, необходимую для начала тиражирования сети[\s\S]*Центральный производственный узел[\s\S]*Эталонная торговая точка[\s\S]*Цифровая система управления сетью[\s\S]*Медиасистема[\s\S]*Подтверждённые показатели для масштабирования[\s\S]*Результатом первого этапа является не одна открытая точка, а инфраструктура, позволяющая начать тиражирование сети/);
    assert.ok(coreText.indexOf("Экономика головной компании и франчайзи") < coreText.indexOf("Результат первого этапа"));
    assert.ok(coreText.indexOf("Результат первого этапа") < coreText.indexOf("Базовая стратегия и сценарии запуска"));
    assert.equal(await page.getByText("$1m", { exact: false }).count(), 0);
    assert.equal(await page.getByText("30%", { exact: false }).count(), 0, "food cost benchmark is not presented as a required payment");
    await page.getByRole("link", { name: "Открыть сценарий Петроградки" }).click();
    await page.getByTestId("petrogradka-scenario-page").waitFor();
    assert.equal(await page.locator("h1").innerText(), "Петроградка — готовая производственная база");
    await assertPetrogradkaPresentation(page);
    await assertScenarioGutters(page, { width: 1440, height: 1000 }, "Petrogradka desktop");
    await assertNoOverflow(page, "Petrogradka desktop");
    assert.deepEqual(errors, [], "core and scenario have no desktop runtime errors");
    await context.close();

    for (const viewport of [{ width: 1024, height: 900 }, { width: 768, height: 900 }, { width: 390, height: 844 }]) {
      await verifyRoute(browser, "/investor/franchise-platform", "franchise-platform-page", viewport);
      await verifyRoute(browser, "/investor/franchise-platform/petrogradka", "petrogradka-scenario-page", viewport);
    }
  } finally {
    await browser.close();
    await server.stop();
  }
}

run().catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
