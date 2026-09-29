const fs = require("fs");
const http = require("http");
const path = require("path");

const projectRoot = path.resolve(__dirname, "..");
const distDir = path.join(projectRoot, "dist");

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

function getArg(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index >= 0 && process.argv[index + 1]) {
    return process.argv[index + 1];
  }
  return fallback;
}

function sendFile(res, filePath, status = 200) {
  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(status, {
    "Content-Type": mimeTypes.get(ext) || "application/octet-stream",
    "Cache-Control": ext === ".html" ? "no-cache" : "public, max-age=3600"
  });
  fs.createReadStream(filePath).pipe(res);
}

function resolveRequestPath(requestPathname) {
  let pathname;
  try {
    pathname = decodeURIComponent(requestPathname);
  } catch {
    return null;
  }

  const candidates = [];
  const basePath = path.normalize(path.join(distDir, pathname));
  candidates.push(basePath);
  candidates.push(path.join(basePath, "index.html"));

  for (const candidate of candidates) {
    const normalized = path.normalize(candidate);
    if (!normalized.startsWith(distDir)) {
      return null;
    }
    if (fs.existsSync(normalized) && fs.statSync(normalized).isDirectory()) {
      const indexPath = path.join(normalized, "index.html");
      if (fs.existsSync(indexPath)) {
        return indexPath;
      }
    }
    if (fs.existsSync(normalized) && fs.statSync(normalized).isFile()) {
      return normalized;
    }
  }

  return null;
}

function resolveNotFoundPath() {
  const notFoundPath = path.join(distDir, "404", "index.html");
  return fs.existsSync(notFoundPath) ? notFoundPath : null;
}

if (!fs.existsSync(path.join(distDir, "index.html"))) {
  console.error(`Missing ${path.join(distDir, "index.html")}. Run npm run build first.`);
  process.exit(1);
}

const host = getArg("--host", process.env.HOST || "127.0.0.1");
const port = Number(getArg("--port", process.env.PORT || "4174"));

const server = http.createServer((req, res) => {
  const url = new URL(req.url || "/", `http://${host}:${port}`);
  if (url.pathname.replace(/\/+$/, "") === "/investor/franchise-platform/sennaya") {
    res.writeHead(308, { Location: `/sennaya${url.search}`, "Cache-Control": "no-store" });
    res.end();
    return;
  }
  const filePath = resolveRequestPath(url.pathname);
  if (!filePath) {
    const notFoundPath = resolveNotFoundPath();
    if (notFoundPath) {
      sendFile(res, notFoundPath, 404);
      return;
    }
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return;
  }
  sendFile(res, filePath);
});

server.listen(port, host, () => {
  console.log(`Serving ${distDir}`);
  console.log(`Local: http://${host}:${port}/`);
});
