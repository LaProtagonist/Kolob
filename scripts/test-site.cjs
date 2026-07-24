const fs = require("fs");
const http = require("http");
const path = require("path");

const projectRoot = path.resolve(__dirname, "..");
process.env.PLAYWRIGHT_BROWSERS_PATH = path.join(projectRoot, ".playwright-browsers");

const { chromium } = require("playwright");

const distDir = path.join(projectRoot, "dist");
const routes = [
  { path: "/", must: ["Еда в пути.", "Всё внутри."] },
  { path: "/concept", must: ["Колобок — полноценная еда, собранная в удобную форму."] },
  { path: "/history", must: ["Из реального продукта — в масштабируемую систему."] },
  { path: "/quality", must: ["Вкус начинается с продукта."] },
  { path: "/investment", must: ["От авторского продукта — к федеральной сети национального формата."] },
  { path: "/materials", must: ["Материалы проекта"] },
  { path: "/investor-questions", must: ["Обсудить участие"] },
  { path: "/privacy", must: ["Политика обработки персональных данных"] },
  { path: "/404", must: ["Страница не найдена"] }
];

const forbidden = [
  "Инвестиционное предложение",
  "Инвестиционная модель",
  "Вопросы инвестора",
  "Запросить материалы проекта",
  "Колобовщина",
  "Колобочное",
  "Клабочный",
  "street food",
  "10 точек",
  "100 чеков",
  "средний чек",
  "CAPEX",
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
    let pathname = decodeURIComponent(url.pathname);
    let filePath = path.normalize(path.join(distDir, pathname));

    if (!filePath.startsWith(distDir)) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }

    if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
      filePath = path.join(filePath, "index.html");
    }

    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      const notFoundPath = path.join(distDir, "404", "index.html");
      if (fs.existsSync(notFoundPath)) {
        const ext = path.extname(notFoundPath).toLowerCase();
        res.writeHead(404, { "Content-Type": mimeTypes.get(ext) || "application/octet-stream" });
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
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve(`http://${address.address}:${address.port}`);
    });
  });
}

function close(server) {
  return new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
}

async function checkPage(browser, baseUrl, route) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 }, deviceScaleFactor: 1 });
  const consoleMessages = [];
  const pageErrors = [];

  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) {
      consoleMessages.push(message.text());
    }
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));

  const response = await page.goto(`${baseUrl}${route.path}`, { waitUntil: "networkidle" });
  const text = await page.locator("body").innerText();
  const h1Count = await page.locator("h1").count();
  const horizontalScroll = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2);

  const missing = route.must.filter((phrase) => !text.includes(phrase));
  const forbiddenFound = forbidden.filter((phrase) => text.includes(phrase));

  await page.close();

  return {
    path: route.path,
    status: response ? response.status() : null,
    h1Count,
    horizontalScroll,
    missing,
    forbiddenFound,
    consoleMessages,
    pageErrors
  };
}

(async () => {
  if (!fs.existsSync(path.join(distDir, "index.html"))) {
    throw new Error("Missing dist/index.html. Run npm run build first.");
  }

  const server = createServer();
  const baseUrl = await listen(server);
  const browser = await chromium.launch({ headless: true });

  try {
    const results = [];
    for (const route of routes) {
      results.push(await checkPage(browser, baseUrl, route));
    }

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

    const failures = [];
    for (const result of results) {
      if (result.status !== 200) failures.push(`${result.path}: status ${result.status}`);
      if (result.h1Count !== 1) failures.push(`${result.path}: h1 count ${result.h1Count}`);
      if (result.horizontalScroll) failures.push(`${result.path}: horizontal scroll`);
      if (result.missing.length) failures.push(`${result.path}: missing ${result.missing.join(", ")}`);
      if (result.forbiddenFound.length) failures.push(`${result.path}: forbidden ${result.forbiddenFound.join(", ")}`);
      if (result.consoleMessages.length) failures.push(`${result.path}: console ${result.consoleMessages.join(" | ")}`);
      if (result.pageErrors.length) failures.push(`${result.path}: page errors ${result.pageErrors.join(" | ")}`);
    }
    if (!mobileMenuOpen) failures.push("mobile menu did not open");
    if (formStatus.includes("Спасибо")) failures.push("form showed false success without endpoint");

    const report = { baseUrl, checkedAt: new Date().toISOString(), results, mobileMenuOpen, formStatus, failures };
    console.log(JSON.stringify(report, null, 2));

    if (failures.length) {
      process.exit(1);
    }
  } finally {
    await browser.close();
    await close(server);
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
