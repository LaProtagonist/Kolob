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

async function verifyRoute(browser, pathname, testId, viewport) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  await page.goto(`${baseUrl}${pathname}`, { waitUntil: "networkidle" });
  await page.getByTestId(testId).waitFor();
  await assertNoOverflow(page, `${pathname} ${viewport.width}px`);
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
    assert.match(await page.getByTestId("petrogradka-scenario-page").innerText(), /Сценарий,\s*не базовая модель/i);
    await assertLocalizedInvestorCopy(page, "petrogradka-scenario-page");
    assert.ok(await page.locator('[data-status="available_subject_to_confirmation"]').count() >= 3);
    assert.match(await page.getByTestId("petrogradka-scenario-page").innerText(), /Не включено:[\s\S]*аренда[\s\S]*отдельные торговые точки/);
    assert.match(await page.getByTestId("petrogradka-scenario-page").innerText(), /3[  ]000[  ]000–3[  ]600[  ]000 ₽/);
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
