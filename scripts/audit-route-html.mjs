import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reportPath = path.join(projectRoot, "analysis", "route-html-audit.md");
const baseUrl = (process.env.AUDIT_BASE_URL || "http://127.0.0.1:4175").replace(/\/+$/, "");

const checks = [
  { route: "/", expectedStatus: 200, mustInclude: "Колобочная" },
  { route: "/concept", expectedStatus: 200, mustInclude: "Колобок — полноценная еда, собранная в удобную форму." },
  { route: "/history", expectedStatus: 200, mustInclude: "Из реального продукта — в масштабируемую систему." },
  { route: "/quality", expectedStatus: 200, mustInclude: "Вкус начинается с продукта." },
  { route: "/investment", expectedStatus: 200, mustInclude: "От авторского продукта — к федеральной сети национального формата." },
  { route: "/materials", expectedStatus: 200, mustInclude: "Материалы проекта" },
  { route: "/investor-questions", expectedStatus: 200, mustInclude: "Обсудить участие" },
  { route: "/privacy", expectedStatus: 200, mustInclude: "Политика обработки персональных данных" },
  { route: "/404", expectedStatus: 200, mustInclude: "Страница не найдена" },
  { route: "/robots.txt", expectedStatus: 200, mustInclude: "Sitemap: https://colob.spi.ski/sitemap.xml" },
  { route: "/sitemap.xml", expectedStatus: 200, mustInclude: "https://colob.spi.ski/investor-questions" },
  { route: "/definitely-missing-audit-route", expectedStatus: 404, mustInclude: "Страница не найдена" }
];

function escapeCell(value) {
  return String(value ?? "").replaceAll("|", "\\|").replace(/\s+/g, " ").trim();
}

const rows = [];
let issueCount = 0;

for (const check of checks) {
  const response = await fetch(`${baseUrl}${check.route}`);
  const body = await response.text();
  const issues = [];
  if (response.status !== check.expectedStatus) {
    issues.push(`status ${response.status}, expected ${check.expectedStatus}`);
  }
  if (!body.includes(check.mustInclude)) {
    issues.push(`missing expected text`);
  }
  issueCount += issues.length;
  rows.push({ ...check, status: response.status, issues });
}

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
const report = [
  "# Route HTML Audit",
  "",
  `Generated: ${new Date().toISOString()}`,
  `Base URL: ${baseUrl}`,
  "",
  "| Route | Status | Expected text | Issues | Result |",
  "|---|---:|---|---|---:|",
  ...rows.map((row) => `| ${escapeCell(row.route)} | ${row.status} | ${escapeCell(row.mustInclude)} | ${escapeCell(row.issues.join("; "))} | ${row.issues.length ? "FAIL" : "OK"} |`)
].join("\n");

fs.writeFileSync(reportPath, `${report}\n`, "utf8");

console.log(JSON.stringify({ reportPath, baseUrl, checkCount: checks.length, issueCount }, null, 2));
if (issueCount) process.exit(1);
