import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distDir = path.join(projectRoot, "dist");
const reportPath = path.join(projectRoot, "analysis", "assets-audit.md");
const origin = "https://colob.spi.ski";
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

function attr(tag, name) {
  return tag.match(new RegExp(`\\b${name}=["']([^"']*)`, "i"))?.[1]?.trim() || "";
}

function hasAttr(tag, name) {
  return new RegExp(`\\b${name}(?:=["'][^"']*["'])?`, "i").test(tag);
}

function hasForbiddenUrl(value) {
  return forbiddenUrlPatterns.some((pattern) => pattern.test(value));
}

function localAssetPath(value) {
  if (!value || value.startsWith("data:") || value.startsWith("blob:")) return null;
  let pathname = value;
  if (/^https?:\/\//i.test(value)) {
    const url = new URL(value);
    if (url.origin !== origin) return null;
    pathname = url.pathname;
  }
  if (!pathname.startsWith("/")) return null;
  return pathname.split("?")[0].replace(/^\/+/, "");
}

function assetExists(value) {
  const localPath = localAssetPath(value);
  return !localPath || fs.existsSync(path.join(distDir, localPath));
}

function srcsetValues(srcset) {
  return srcset
    .split(",")
    .map((entry) => entry.trim().split(/\s+/)[0])
    .filter(Boolean);
}

function escapeCell(value) {
  return String(value ?? "").replaceAll("|", "\\|").replace(/\s+/g, " ").trim();
}

const rows = [];
const issues = [];
const htmlFiles = walk(distDir);

function addIssue(sourceRoute, type, value, issue) {
  rows.push({ sourceRoute, type, value, status: "ERROR", issue });
  issues.push({ sourceRoute, type, value, issue });
}

function addOk(sourceRoute, type, value) {
  rows.push({ sourceRoute, type, value, status: "OK", issue: "" });
}

for (const filePath of htmlFiles) {
  const sourceRoute = routeFromHtmlFile(filePath);
  const html = fs.readFileSync(filePath, "utf8");

  for (const tag of html.match(/<img\b[^>]*>/gi) ?? []) {
    const src = attr(tag, "src");
    if (!hasAttr(tag, "alt")) addIssue(sourceRoute, "img-alt", src, "missing alt attribute");
    if (src) {
      if (hasForbiddenUrl(src)) addIssue(sourceRoute, "img-src", src, "forbidden temporary/local URL");
      else if (!assetExists(src)) addIssue(sourceRoute, "img-src", src, "missing asset file");
      else addOk(sourceRoute, "img-src", src);
    }
    for (const srcsetSrc of srcsetValues(attr(tag, "srcset"))) {
      if (hasForbiddenUrl(srcsetSrc)) addIssue(sourceRoute, "img-srcset", srcsetSrc, "forbidden temporary/local URL");
      else if (!assetExists(srcsetSrc)) addIssue(sourceRoute, "img-srcset", srcsetSrc, "missing asset file");
      else addOk(sourceRoute, "img-srcset", srcsetSrc);
    }
  }

  for (const tag of html.match(/<source\b[^>]*>/gi) ?? []) {
    const src = attr(tag, "src");
    if (!src) continue;
    if (hasForbiddenUrl(src)) addIssue(sourceRoute, "source-src", src, "forbidden temporary/local URL");
    else if (!assetExists(src)) addIssue(sourceRoute, "source-src", src, "missing asset file");
    else addOk(sourceRoute, "source-src", src);
  }

  for (const tag of html.match(/<video\b[^>]*>/gi) ?? []) {
    const poster = attr(tag, "poster");
    if (!poster) addIssue(sourceRoute, "video-poster", "", "missing poster attribute");
    else if (hasForbiddenUrl(poster)) addIssue(sourceRoute, "video-poster", poster, "forbidden temporary/local URL");
    else if (!assetExists(poster)) addIssue(sourceRoute, "video-poster", poster, "missing poster file");
    else addOk(sourceRoute, "video-poster", poster);
    if (hasAttr(tag, "autoplay") && !hasAttr(tag, "muted")) addIssue(sourceRoute, "video-autoplay", poster, "autoplay video is not muted in HTML");
  }

  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    if (!/(property|name)=["'](?:og:image|twitter:image)["']/i.test(tag)) continue;
    const content = attr(tag, "content");
    if (!content) addIssue(sourceRoute, "social-image", "", "empty social image");
    else if (hasForbiddenUrl(content)) addIssue(sourceRoute, "social-image", content, "forbidden temporary/local URL");
    else if (!assetExists(content)) addIssue(sourceRoute, "social-image", content, "missing social image file");
    else addOk(sourceRoute, "social-image", content);
  }
}

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
const report = [
  "# Assets Audit",
  "",
  `Generated: ${new Date().toISOString()}`,
  "",
  `Checked HTML files: ${htmlFiles.length}`,
  `Asset checks: ${rows.length}`,
  `Issues: ${issues.length}`,
  "",
  "| Source | Type | Value | Status | Issue |",
  "|---|---:|---|---:|---|",
  ...rows.map((row) => `| ${escapeCell(row.sourceRoute)} | ${row.type} | ${escapeCell(row.value)} | ${row.status} | ${escapeCell(row.issue)} |`)
].join("\n");

fs.writeFileSync(reportPath, `${report}\n`, "utf8");

console.log(JSON.stringify({ reportPath, checkedFiles: htmlFiles.length, checkCount: rows.length, issueCount: issues.length }, null, 2));
if (issues.length) process.exit(1);
