const fs = require("fs");
const http = require("http");
const path = require("path");

const projectRoot = path.resolve(__dirname, "..");
process.env.PLAYWRIGHT_BROWSERS_PATH = path.join(projectRoot, ".playwright-browsers");

const { chromium } = require("playwright");

const distDir = path.join(projectRoot, "dist");
const publicOrigin = (process.env.PUBLIC_ORIGIN || "https://colob.spi.ski").replace(/\/+$/, "");

const routes = [
  { name: "home", label: "Home", path: "/" },
  { name: "concept", label: "Concept", path: "/concept" },
  { name: "history", label: "History", path: "/history" },
  { name: "quality", label: "Quality", path: "/quality" },
  { name: "investment", label: "Investment", path: "/investment" },
  { name: "materials", label: "Materials", path: "/materials" },
  { name: "investor-questions", label: "Investor questions", path: "/investor-questions" },
  { name: "privacy", label: "Privacy", path: "/privacy" },
  { name: "capex-configurator", label: "CAPEX configurator", path: "/capex-configurator" },
  { name: "launch-budget", label: "Launch budget", path: "/launch-budget" },
  { name: "not-found", label: "Not found", path: "/404" }
];

const screenshotViewports = [
  { name: "desktop-1440", width: 1440, height: 1200 },
  { name: "mobile-390", width: 390, height: 844 }
];

const mimeTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".gif", "image/gif"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".webp", "image/webp"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"]
]);

function assertDistExists() {
  const indexPath = path.join(distDir, "index.html");
  if (!fs.existsSync(indexPath)) {
    throw new Error(`Missing ${indexPath}. Run vite build before prerender.`);
  }
}

function createStaticServer(spaIndexHtml) {
  return http.createServer((req, res) => {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    let pathname;
    try {
      pathname = decodeURIComponent(url.pathname);
    } catch {
      res.writeHead(400);
      res.end("Bad request");
      return;
    }

    let filePath = path.normalize(path.join(distDir, pathname));
    if (!filePath.startsWith(distDir)) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }

    if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
      filePath = path.join(filePath, "index.html");
    }

    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, { "Content-Type": mimeTypes.get(ext) || "application/octet-stream" });
      fs.createReadStream(filePath).pipe(res);
      return;
    }

    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(spaIndexHtml);
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

function closeServer(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

async function settlePage(page) {
  await page.waitForSelector("#root > *", { timeout: 10000 });
  await page.evaluate(async () => {
    Array.from(document.images).forEach((img) => {
      img.loading = "eager";
    });
    Array.from(document.querySelectorAll("video[autoplay]")).forEach((video) => {
      video.muted = true;
      video.defaultMuted = true;
      video.setAttribute("muted", "");
      video.setAttribute("playsinline", "");
      video.setAttribute("webkit-playsinline", "");
    });

    const step = Math.max(360, Math.floor(window.innerHeight * 0.75));
    for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    window.scrollTo(0, 0);
    await new Promise((resolve) => setTimeout(resolve, 160));

    await Promise.race([
      Promise.all(
        Array.from(document.images)
          .filter((img) => !img.complete)
          .map(
            (img) =>
              new Promise((resolve) => {
                img.addEventListener("load", resolve, { once: true });
                img.addEventListener("error", resolve, { once: true });
              })
          )
      ),
      new Promise((resolve) => setTimeout(resolve, 3000))
    ]);

    await Promise.race([
      Promise.all(Array.from(document.images).map((img) => img.decode().catch(() => undefined))),
      new Promise((resolve) => setTimeout(resolve, 3000))
    ]);

    // Image decoding can change the document height after the first scroll reset.
    // Normalize the observable scroll-derived React state before serializing HTML
    // so repeated builds cannot alternate between header variants.
    const header = document.querySelector(".site-header");
    for (let attempt = 0; attempt < 20; attempt += 1) {
      window.scrollTo(0, 0);
      window.dispatchEvent(new Event("scroll"));
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      if (window.scrollY === 0 && !header?.classList.contains("is-scrolled")) break;
    }
    if (window.scrollY !== 0 || header?.classList.contains("is-scrolled")) {
      throw new Error("Prerender failed to normalize the top-of-page header state.");
    }
  });
}

function targetHtmlPath(routePath) {
  if (routePath === "/") {
    return path.join(distDir, "index.html");
  }
  return path.join(distDir, routePath.replace(/^\/+/, ""), "index.html");
}

function rewriteLocalOrigin(html, localOrigin) {
  return html.replaceAll(localOrigin, publicOrigin);
}

function writeRouteHtml(route, html) {
  const filePath = targetHtmlPath(route.path);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, html, "utf8");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function writeReviewPage(manifest) {
  const reviewDir = path.join(distDir, "__review");
  fs.mkdirSync(reviewDir, { recursive: true });

  const routeLinks = routes
    .map((route) => `<a href="${route.path}">${escapeHtml(route.label)}</a>`)
    .join("");

  const sections = manifest.routes
    .map((route) => {
      const shots = route.screenshots
        .map(
          (shot) => `
            <figure>
              <a href="${shot.path}"><img src="${shot.path}" alt="${escapeHtml(route.label)} ${escapeHtml(shot.viewport)}"></a>
              <figcaption>${escapeHtml(route.label)} - ${escapeHtml(shot.viewport)}</figcaption>
            </figure>`
        )
        .join("");

      return `
        <section>
          <h2>${escapeHtml(route.label)}</h2>
          <p><a href="${route.path}">Open page</a></p>
          <div class="screens">${shots}</div>
        </section>`;
    })
    .join("");

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Kolobochnaya review</title>
    <style>
      body { margin: 0; font-family: Arial, sans-serif; background: #f5f1e8; color: #151515; }
      header { padding: 32px 40px; background: #151515; color: #fff; }
      h1 { margin: 0 0 8px; font-size: 32px; }
      p { line-height: 1.5; }
      nav { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 20px; }
      nav a, section > p a { color: inherit; border: 1px solid currentColor; border-radius: 6px; padding: 8px 10px; text-decoration: none; }
      main { padding: 28px 40px 48px; }
      section { padding: 24px 0 36px; border-bottom: 1px solid rgba(0, 0, 0, 0.16); }
      h2 { margin: 0 0 12px; font-size: 24px; }
      .screens { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 24px; align-items: start; }
      figure { margin: 0; background: #fff; border: 1px solid rgba(0, 0, 0, 0.12); border-radius: 8px; overflow: hidden; }
      img { display: block; width: 100%; height: auto; }
      figcaption { padding: 10px 12px; font-size: 14px; font-weight: 700; }
      @media (max-width: 720px) { header, main { padding-left: 18px; padding-right: 18px; } }
    </style>
  </head>
  <body>
    <header>
      <h1>Kolobochnaya review</h1>
      <p>Pre-rendered pages and visual screenshots for GPT/browser review. Generated ${escapeHtml(manifest.generatedAt)}.</p>
      <nav>${routeLinks}</nav>
    </header>
    <main>${sections}</main>
  </body>
</html>`;

  fs.writeFileSync(path.join(reviewDir, "index.html"), html, "utf8");
  fs.writeFileSync(path.join(reviewDir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
}

(async () => {
  assertDistExists();
  const spaIndexHtml = fs.readFileSync(path.join(distDir, "index.html"), "utf8");
  const server = createStaticServer(spaIndexHtml);
  const baseUrl = await listen(server);
  const reviewShotsDir = path.join(distDir, "__review", "screenshots");
  fs.mkdirSync(reviewShotsDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const manifest = {
    generatedAt: new Date().toISOString(),
    publicOrigin,
    routes: []
  };

  try {
    for (const route of routes) {
      const page = await browser.newPage({ viewport: { width: 1440, height: 1200 }, deviceScaleFactor: 1 });
      await page.goto(`${baseUrl}${route.path}`, { waitUntil: "domcontentloaded", timeout: 15000 });
      await settlePage(page);
      const html = rewriteLocalOrigin(await page.content(), baseUrl);
      writeRouteHtml(route, html);

      const routeEntry = {
        ...route,
        url: `${publicOrigin}${route.path}`,
        htmlPath: path.relative(distDir, targetHtmlPath(route.path)).replaceAll(path.sep, "/"),
        screenshots: []
      };

      for (const viewport of screenshotViewports) {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await page.goto(`${baseUrl}${route.path}`, { waitUntil: "domcontentloaded", timeout: 15000 });
        await settlePage(page);
        const fileName = `${route.name}-${viewport.name}.jpg`;
        const filePath = path.join(reviewShotsDir, fileName);
        await page.screenshot({ path: filePath, fullPage: true, type: "jpeg", quality: 86 });
        routeEntry.screenshots.push({
          viewport: viewport.name,
          path: `screenshots/${fileName}`
        });
      }

      manifest.routes.push(routeEntry);
      await page.close();
    }
  } finally {
    await browser.close();
    await closeServer(server);
  }

  writeReviewPage(manifest);
  console.log(
    JSON.stringify(
      {
        publicOrigin,
        routes: routes.length,
        review: path.join(distDir, "__review", "index.html")
      },
      null,
      2
    )
  );
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
