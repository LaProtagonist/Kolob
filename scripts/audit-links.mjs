import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distDir = path.join(projectRoot, "dist");
const reportPath = path.join(projectRoot, "analysis", "link-audit.md");
const publicRoutes = new Set(["/", "/concept", "/history", "/quality", "/investment", "/materials", "/investor-questions", "/privacy", "/investor-terminal", "/petrogradka", "/sennaya", "/404", "/lab", ...JSON.parse(fs.readFileSync(path.join(projectRoot, "src", "lab", "variants.json"), "utf8")).map((variant) => `/lab/${variant.id}`)]);
const forbiddenUrlPatterns = [/trycloudflare\.com/i, /localhost/i, /127\.0\.0\.1/i, /file:\/\//i, /D:\\/i, /D:\//i, /\/mnt\/data/i, /sandbox:/i];

function walk(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  for (const name of fs.readdirSync(dir)) {
    if (name === "__review") continue;
    const filePath = path.join(dir, name);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) walk(filePath, files);
    else if (filePath.endsWith(".html")) files.push(filePath);
  }
  return files;
}

function routeFromHtmlFile(filePath) {
  const relative = path.relative(distDir, filePath).replaceAll("\\", "/");
  if (relative === "index.html") return "/";
  return `/${relative.replace(/\/index\.html$/, "")}`;
}

function normalizeRoute(href) {
  const [routePart, hash] = href.split("#");
  const route = (routePart.replace(/\/+$/, "") || "/");
  return { route, hash: hash || "" };
}

function routeFile(route) {
  return route === "/" ? path.join(distDir, "index.html") : path.join(distDir, route, "index.html");
}

function classify(href) {
  if (href.startsWith("#")) return "hash";
  if (href.startsWith("mailto:") || href.startsWith("tel:")) return "contact";
  if (/^https?:\/\//i.test(href) || href.startsWith("//")) return "external";
  if (href.startsWith("/media/") || href.startsWith("/assets/")) return "asset";
  if (href.startsWith("/")) return "internal";
  return "relative";
}

function hasForbiddenUrl(value) {
  return forbiddenUrlPatterns.some((pattern) => pattern.test(value));
}

function escapeCell(value) {
  return String(value ?? "").replaceAll("|", "\\|").replace(/\s+/g, " ").trim();
}

const htmlFiles = walk(distDir);
const rows = [];
const issues = [];

for (const filePath of htmlFiles) {
  const sourceRoute = routeFromHtmlFile(filePath);
  const html = fs.readFileSync(filePath, "utf8");
  for (const match of html.matchAll(/<a\b([^>]*?)href=["']([^"']+)["']([^>]*)>/gi)) {
    const attrs = `${match[1]} ${match[3]}`;
    const href = match[2];
    const type = classify(href);
    let status = "OK";
    let issue = "";

    if (hasForbiddenUrl(href)) {
      status = "ERROR";
      issue = "forbidden temporary/local URL";
    }

    if (type === "internal") {
      const { route, hash } = normalizeRoute(href);
      if (!publicRoutes.has(route)) {
        status = "ERROR";
        issue = `unknown internal route: ${route}`;
      } else if (!fs.existsSync(routeFile(route))) {
        status = "ERROR";
        issue = `missing route HTML: ${route}`;
      }
      if (hash) {
        const targetHtml = fs.existsSync(routeFile(route)) ? fs.readFileSync(routeFile(route), "utf8") : "";
        if (!targetHtml.includes(`id="${hash}"`) && !targetHtml.includes(`id='${hash}'`)) {
          status = "ERROR";
          issue = `missing hash target: #${hash}`;
        }
      }
    }

    if (type === "hash") {
      const hash = href.slice(1);
      if (!html.includes(`id="${hash}"`) && !html.includes(`id='${hash}'`)) {
        status = "ERROR";
        issue = `missing same-page hash target: #${hash}`;
      }
    }

    if (type === "external" && /target=["']_blank["']/i.test(attrs) && !/rel=["'][^"']*(noopener|noreferrer)/i.test(attrs)) {
      status = "ERROR";
      issue = "target=_blank without noopener/noreferrer";
    }

    if (status === "ERROR") issues.push({ sourceRoute, href, type, issue });
    rows.push({ sourceRoute, href, type, status, issue });
  }
}

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
const report = [
  "# Link Audit",
  "",
  `Generated: ${new Date().toISOString()}`,
  "",
  `Checked HTML files: ${htmlFiles.length}`,
  `Links found: ${rows.length}`,
  `Issues: ${issues.length}`,
  "",
  "| Source | Link | Type | Status | Issue |",
  "|---|---|---:|---:|---|",
  ...rows.map((row) => `| ${escapeCell(row.sourceRoute)} | ${escapeCell(row.href)} | ${row.type} | ${row.status} | ${escapeCell(row.issue)} |`)
].join("\n");

fs.writeFileSync(reportPath, `${report}\n`, "utf8");

console.log(JSON.stringify({ reportPath, checkedFiles: htmlFiles.length, linkCount: rows.length, issueCount: issues.length }, null, 2));
if (issues.length) process.exit(1);
