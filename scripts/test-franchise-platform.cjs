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
const forbiddenPetrogradkaTerms = [
  "исследовательский сценарий",
  "сценарий, не базовая модель",
  "требует письменного подтверждения",
  "допущение для расчёта",
  "до получения входов сценарий не формирует финансовый результат",
  "статус сценария",
  "ориентировочный бюджет первого этапа",
  "капиталоэффективный сценарий",
  "от 6 млн ₽",
  "≈11,5–12,5 млн ₽",
  "5,3–6,1 млн ₽",
  "высвободившийся капитал",
  "дублирующих",
  "почему объект подходит",
  "что добавляет проект",
  "инвестиционный контур первого этапа",
  "рабочий ориентир первого этапа составляет от 10 млн ₽",
  "по мере масштабирования экономическая модель головной компании может включать",
];
const requiredPetrogradkaTerms = [
  "Предлагаемая роль объекта",
  "Почему объект интересен проекту",
  "Оборудование, указанное в объявлении",
  "Инженерная инфраструктура",
  "Что создаёт проект на этой базе",
  "Ориентир бюджета первого этапа",
  "Эффект готовой производственной базы",
  "Роль объекта в развитии сети",
  "Первый производственный узел",
  "Основа для подключения новых точек",
  "Возможная модель взаимодействия",
  "Что необходимо подтвердить",
  "Предлагаемый формат запуска",
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
  assert.equal(await page.title(), "Оборудованная производственная база на Петроградской стороне — Колобочная");
  assert.equal(await page.locator('meta[name="description"]').getAttribute("content"), "Предлагаем использовать существующее оборудованное пищевое производство как первый центральный заготовочный узел «Колобочной».");
  assert.match(text, /Центральная производственная база сети с возможностью размещения эталонной торговой функции внутри помещения/);
  assert.match(text, /ОТ 10 МЛН ₽[\s\S]*ОТ 15 МЛН ₽/);
  assert.match(text, /Указанные ориентиры отражают общий бюджет запуска проекта с учетом имеющейся информации о помещении, установленном оборудовании и инженерной инфраструктуре\. Оценка является предварительной и подлежит уточнению после технического осмотра объекта и подтверждения состава оборудования\./);
  assert.match(text, /После технического осмотра будет определён окончательный состав используемого оборудования\. Оборудование, которое не потребуется в основном производственном цикле «Колобочной», может быть вывезено из помещения по согласованию с собственником\./);
  assert.match(text, /Помещение может стать базой, из которой централизованно обеспечиваются первая собственная точка и последующие партнёрские точки сети\./);
  assert.match(text, /В пределах подтверждённой производственной мощности новые торговые точки могут подключаться к существующему производственному центру без развёртывания полного производственного цикла на каждой площадке\./);
  assert.match(text, /Формат взаимодействия предлагается определить после осмотра объекта и оценки его производственных возможностей\. Возможны классическая долгосрочная аренда, ступенчатая арендная модель или иной согласованный формат, учитывающий интересы обеих сторон и инвестиции в запуск площадки\./);
  assert.match(text, /Проект предусматривает инвестиции в специализированное оснащение производства, цифровую инфраструктуру, разработку системы управления сетью, медиапрограмму и операционный запуск/);
  assert.match(text, /Использование готовой производственной базы сокращает объём капитальных затрат на инженерную и технологическую подготовку помещения и позволяет сосредоточить инвестиционный бюджет на элементах, непосредственно обеспечивающих запуск и дальнейшее масштабирование сети/);
  assert.match(text, /По результатам осмотра можно зафиксировать состав площадки, уточнить бюджет и сроки и перейти к подготовке конкретного плана запуска\./);
  assert.equal(await page.locator('[data-status="available_subject_to_confirmation"]').count(), 0);
  assert.equal(await page.locator(".petrogradka-launch-variants article").count(), 2, "two launch configurations are visible");
  assert.doesNotMatch(await page.locator(".petrogradka-additions-grid").innerText(), /₽/, "project additions do not repeat budget values");
  assert.equal(await page.locator(".petrogradka-narrative-grid article").count(), 2, "network role has two equal cards");
  assert.equal(await page.locator(".petrogradka-narrative-grid article h3").count(), 2, "network role cards each have a heading");
  assert.equal(await page.locator(".petrogradka-confirmations").count(), 1, "confirmations use one shared container");
  assert.equal(await page.locator(".petrogradka-confirmations article").count(), 3, "confirmations keep three groups");
  assert.doesNotMatch(await page.locator(".petrogradka-capital-effect").innerText(), /10 млн ₽|15 млн ₽/i, "effect block does not repeat launch orientations");
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

    await page.goto(`${baseUrl}/petrogradka`, { waitUntil: "networkidle" });
    await page.getByTestId("petrogradka-scenario-page").waitFor();
    assert.equal(await page.locator("h1").innerText(), "Оборудованная производственная база на Петроградской стороне");
    await assertPetrogradkaPresentation(page);
    await assertScenarioGutters(page, { width: 1440, height: 1000 }, "Petrogradka desktop");
    await assertNoOverflow(page, "Petrogradka desktop");
    assert.deepEqual(errors, [], "Petrogradka has no desktop runtime errors");
    await context.close();

    for (const viewport of [{ width: 1024, height: 900 }, { width: 768, height: 900 }, { width: 390, height: 844 }]) {
      await verifyRoute(browser, "/petrogradka", "petrogradka-scenario-page", viewport);
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
