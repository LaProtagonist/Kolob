const fs = require("fs");
const path = require("path");

const projectRoot = path.resolve(__dirname, "..");
process.env.PLAYWRIGHT_BROWSERS_PATH = path.join(projectRoot, ".playwright-browsers");

const { chromium } = require("playwright");

const baseUrl = (process.argv[2] || "http://127.0.0.1:5173").replace(/\/+$/, "");
const outDir = path.join(projectRoot, "analysis", "screenshots");

const routes = [
  { name: "home", path: "/" },
  { name: "concept", path: "/concept" },
  { name: "history", path: "/history" },
  { name: "quality", path: "/quality" },
  { name: "investment", path: "/investment" },
  { name: "materials", path: "/materials" },
  { name: "investor-questions", path: "/investor-questions" },
  { name: "privacy", path: "/privacy" }
];

const viewports = [
  { name: "desktop-1440", width: 1440, height: 1200 },
  { name: "tablet-1024", width: 1024, height: 1000 },
  { name: "tablet-768", width: 768, height: 1000 },
  { name: "mobile-390", width: 390, height: 844 }
];

const screenshotRequests = new Map([
  ["home|desktop-1440", "home-1440.png"],
  ["home|mobile-390", "home-390.png"],
  ["concept|desktop-1440", "concept-1440.png"],
  ["quality|desktop-1440", "quality-1440.png"],
  ["history|desktop-1440", "history-1440.png"],
  ["investment|desktop-1440", "investment-1440.png"],
  ["materials|desktop-1440", "materials-1440.png"],
  ["investor-questions|mobile-390", "investor-questions-390.png"]
]);

async function settlePage(page) {
  await page.evaluate(async () => {
    Array.from(document.images).forEach((img) => {
      img.loading = "eager";
    });

    const step = Math.max(320, Math.floor(window.innerHeight * 0.75));
    for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((resolve) => setTimeout(resolve, 80));
    }
    window.scrollTo(0, 0);
    await new Promise((resolve) => setTimeout(resolve, 160));

    const imageWait = Promise.all(
      Array.from(document.images)
        .filter((img) => !img.complete)
        .map(
          (img) =>
            new Promise((resolve) => {
              img.addEventListener("load", resolve, { once: true });
              img.addEventListener("error", resolve, { once: true });
            })
        )
    );

    await Promise.race([imageWait, new Promise((resolve) => setTimeout(resolve, 3000))]);
    await Promise.all(Array.from(document.images).map((img) => img.decode().catch(() => undefined)));
  });
}

async function collectMetrics(page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    const body = document.body;
    const internalLinks = Array.from(document.querySelectorAll('a[href^="/"]')).map((link) =>
      link.getAttribute("href")
    );
    return {
      title: document.title,
      h1Count: document.querySelectorAll("h1").length,
      missingAltImages: Array.from(document.images).filter((img) => !img.getAttribute("alt")).length,
      scrollWidth: Math.max(doc.scrollWidth, body.scrollWidth),
      clientWidth: doc.clientWidth,
      hasHorizontalScroll: Math.max(doc.scrollWidth, body.scrollWidth) > doc.clientWidth + 2,
      bodyHeight: Math.max(doc.scrollHeight, body.scrollHeight),
      internalLinks: Array.from(new Set(internalLinks))
    };
  });
}

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const results = [];
  const routePaths = new Set(routes.map((route) => route.path));

  for (const viewport of viewports) {
    for (const route of routes) {
      const page = await browser.newPage({
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: 1
      });

      const consoleMessages = [];
      const pageErrors = [];
      page.on("console", (message) => {
        if (["error", "warning"].includes(message.type())) {
          consoleMessages.push({ type: message.type(), text: message.text() });
        }
      });
      page.on("pageerror", (error) => pageErrors.push(error.message));

      const response = await page.goto(`${baseUrl}${route.path}`, { waitUntil: "networkidle" });
      await settlePage(page);
      const metrics = await collectMetrics(page);

      const brokenInternalLinks = metrics.internalLinks.filter((href) => {
        const cleanHref = href.split("#")[0].replace(/\/+$/, "") || "/";
        return !routePaths.has(cleanHref);
      });

      let screenshotPath = null;
      const screenshotName = screenshotRequests.get(`${route.name}|${viewport.name}`);
      if (screenshotName) {
        screenshotPath = path.join(outDir, screenshotName);
        await page.screenshot({ path: screenshotPath, fullPage: true });
      }

      results.push({
        route: route.path,
        routeName: route.name,
        viewport: viewport.name,
        width: viewport.width,
        height: viewport.height,
        httpStatus: response ? response.status() : null,
        screenshotPath,
        consoleMessages,
        pageErrors,
        brokenInternalLinks,
        metrics
      });
      await page.close();
    }
  }

  const mobilePage = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  await mobilePage.goto(`${baseUrl}/`, { waitUntil: "networkidle" });
  await mobilePage.locator(".menu-toggle").click();
  await mobilePage.screenshot({ path: path.join(outDir, "mobile-menu-390.png"), fullPage: true });
  const mobileMenuOpen = await mobilePage.locator(".mobile-nav.is-open").count();
  await mobilePage.close();

  const formPage = await browser.newPage({ viewport: { width: 1440, height: 1200 }, deviceScaleFactor: 1 });
  await formPage.goto(`${baseUrl}/investor-questions`, { waitUntil: "networkidle" });
  await formPage.locator('input[name="name"]').fill("Тест");
  await formPage.locator('input[name="company"]').fill("Тестовая компания");
  await formPage.locator('input[name="contact"]').fill("@test");
  await formPage.locator('input[name="email"]').fill("test@example.com");
  await formPage.locator('input[name="consent"]').check();
  await formPage.locator('button[type="submit"]').click();
  const formStatus = await formPage.locator(".form-status").innerText();
  await formPage.close();

  await browser.close();

  const report = {
    baseUrl,
    checkedAt: new Date().toISOString(),
    routes: routes.map((route) => route.path),
    viewports,
    mobileMenuOpen: mobileMenuOpen > 0,
    formStatus,
    results
  };

  const reportPath = path.join(outDir, "verification-results.json");
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify({ reportPath, routeCount: routes.length, resultCount: results.length, mobileMenuOpen: report.mobileMenuOpen, formStatus }, null, 2));
})();
