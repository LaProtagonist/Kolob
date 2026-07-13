import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distDir = path.join(projectRoot, "dist");
const reportPath = path.join(projectRoot, "analysis", "seo-audit.md");
const origin = "https://colob.spi.ski";

const expected = [
  {
    path: "/",
    title: "Колобочная — еда в пути",
    description: "Современный формат качественной еды в удобной форме: авторский продукт, русский культурный код и модель развития национальной сети.",
    h1: "Колобочная"
  },
  {
    path: "/concept",
    title: "Концепция продукта — Колобочная",
    description: "Колобок как полноценная еда, собранная в удобную форму: одна форма, множество вкусов и русский культурный код.",
    h1: "Колобок — полноценная еда, собранная в удобную форму."
  },
  {
    path: "/history",
    title: "История проекта — Колобочная",
    description: "Практическая история проекта “Колобочная”: Крым, Севастополь, Таврида.АРТ, Санкт-Петербург и фестивальные площадки.",
    h1: "Из реального продукта — в масштабируемую систему."
  },
  {
    path: "/quality",
    title: "Качество и подход — Колобочная",
    description: "Качественные ингредиенты, авторская технология, напитки, свежие ингредиенты и производственная система проекта “Колобочная”.",
    h1: "Вкус начинается с продукта."
  },
  {
    path: "/investment",
    title: "Модель развития — Колобочная",
    description: "Модель развития проекта “Колобочная”: авторский продукт, производственная система, городские форматы и варианты партнёрского участия.",
    h1: "От авторского продукта — к национальной сети."
  },
  {
    path: "/materials",
    title: "Материалы проекта — Колобочная",
    description: "Видео, фотографии, моменты проекта и материалы “Колобочной”: продукт, точки, фестивали, процесс и медиаистория.",
    h1: "Материалы проекта"
  },
  {
    path: "/investor-questions",
    title: "Обсудить участие — Колобочная",
    description: "Форма связи для финансовых и стратегических партнёров проекта “Колобочная”. Оставьте удобный контакт, чтобы обсудить формат участия.",
    h1: "Обсудить участие"
  },
  {
    path: "/privacy",
    title: "Политика обработки персональных данных — Колобочная",
    description: "Политика обработки персональных данных пользователей сайта проекта “Колобочная”.",
    h1: "Политика обработки персональных данных"
  }
];

const forbiddenPublicText = [
  "Инвестиционное предложение",
  "Инвестиционная модель",
  "Вопросы инвестора",
  "Перейти к инвестиционной модели",
  "К инвестиционной модели",
  "Запросить материалы проекта",
  "Получить финансовую модель",
  "Скачать материалы",
  "Получить презентацию сразу",
  "Колобовщина",
  "Колобочное",
  "Клабочный",
  "street food",
  "полезнее кофе",
  "без сервировки",
  "хохлома",
  "матрёшки"
];

function routeFile(route) {
  return route === "/" ? path.join(distDir, "index.html") : path.join(distDir, route, "index.html");
}

function strip(value) {
  return String(value || "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

function attr(html, selector, attrName = "name") {
  const tag = [...html.matchAll(/<meta\b[^>]*>/gi)]
    .map((match) => match[0])
    .find((candidate) => new RegExp(`${attrName}=["']${selector}["']`, "i").test(candidate));
  return tag?.match(/\bcontent=["']([^"']*)/i)?.[1]?.trim() || "";
}

function title(html) {
  return html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() || "";
}

function canonical(html) {
  return html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']*)/i)?.[1]?.trim() || "";
}

function lang(html) {
  return html.match(/<html[^>]+lang=["']([^"']*)/i)?.[1]?.trim() || "";
}

function h1s(html) {
  return [...html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi)].map((match) => strip(match[1]));
}

function fileExistsForAbsoluteUrl(url) {
  if (!url.startsWith(`${origin}/`)) return false;
  const pathname = new URL(url).pathname;
  return fs.existsSync(path.join(distDir, pathname.replace(/^\/+/, "")));
}

function escapeCell(value) {
  return String(value ?? "").replaceAll("|", "\\|").replace(/\s+/g, " ").trim();
}

const rows = [];
const titleSet = new Map();

for (const page of expected) {
  const filePath = routeFile(page.path);
  const issues = [];
  const html = fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "";
  const actualTitle = title(html);
  const actualDescription = attr(html, "description");
  const actualCanonical = canonical(html);
  const actualH1 = h1s(html);
  const og = {
    title: attr(html, "og:title", "property"),
    description: attr(html, "og:description", "property"),
    type: attr(html, "og:type", "property"),
    url: attr(html, "og:url", "property"),
    image: attr(html, "og:image", "property"),
    siteName: attr(html, "og:site_name", "property"),
    locale: attr(html, "og:locale", "property")
  };
  const twitter = {
    card: attr(html, "twitter:card"),
    title: attr(html, "twitter:title"),
    description: attr(html, "twitter:description"),
    image: attr(html, "twitter:image")
  };

  if (!fs.existsSync(filePath)) issues.push("missing route HTML");
  if (actualTitle !== page.title) issues.push(`title mismatch`);
  if (actualDescription !== page.description) issues.push(`description mismatch`);
  if (actualCanonical !== `${origin}${page.path === "/" ? "/" : page.path}`) issues.push("canonical mismatch");
  if (actualH1.length !== 1) issues.push(`H1 count ${actualH1.length}`);
  if (actualH1[0] !== page.h1) issues.push("H1 mismatch");
  if (og.title !== page.title) issues.push("og:title mismatch");
  if (og.description !== page.description) issues.push("og:description mismatch");
  if (og.type !== "website") issues.push("og:type missing/mismatch");
  if (og.url !== actualCanonical) issues.push("og:url mismatch");
  if (og.siteName !== "Колобочная") issues.push("og:site_name missing/mismatch");
  if (og.locale !== "ru_RU") issues.push("og:locale missing/mismatch");
  if (!og.image.startsWith(`${origin}/`)) issues.push("og:image is not absolute");
  else if (!fileExistsForAbsoluteUrl(og.image)) issues.push("og:image file missing");
  if (twitter.card !== "summary_large_image") issues.push("twitter:card missing/mismatch");
  if (twitter.title !== page.title) issues.push("twitter:title mismatch");
  if (twitter.description !== page.description) issues.push("twitter:description mismatch");
  if (twitter.image !== og.image) issues.push("twitter:image mismatch");
  if (lang(html) !== "ru") issues.push("lang is not ru");
  if (attr(html, "viewport") !== "width=device-width, initial-scale=1.0") issues.push("viewport mismatch");
  if (/noindex/i.test(html)) issues.push("unexpected noindex");
  for (const phrase of forbiddenPublicText) {
    if (html.includes(phrase)) issues.push(`forbidden text: ${phrase}`);
  }

  if (titleSet.has(actualTitle)) {
    issues.push(`duplicate title with ${titleSet.get(actualTitle)}`);
  } else if (actualTitle) {
    titleSet.set(actualTitle, page.path);
  }

  rows.push({
    route: page.path,
    status: fs.existsSync(filePath) ? 200 : 0,
    title: actualTitle,
    description: actualDescription,
    h1: actualH1.join(" | "),
    canonical: actualCanonical,
    og,
    twitter,
    issues
  });
}

const robotsPath = path.join(distDir, "robots.txt");
const sitemapPath = path.join(distDir, "sitemap.xml");
if (!fs.existsSync(robotsPath)) rows.push({ route: "/robots.txt", status: 0, title: "", description: "", h1: "", canonical: "", og: {}, twitter: {}, issues: ["missing robots.txt"] });
if (!fs.existsSync(sitemapPath)) rows.push({ route: "/sitemap.xml", status: 0, title: "", description: "", h1: "", canonical: "", og: {}, twitter: {}, issues: ["missing sitemap.xml"] });

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
const report = [
  "# SEO Audit",
  "",
  `Generated: ${new Date().toISOString()}`,
  "",
  "| Route | Status | Title | Description | H1 | Canonical | OG | Twitter | Issues | Result |",
  "|---|---:|---|---|---|---|---|---|---|---:|",
  ...rows.map((row) => {
    const ogStatus = row.og?.title && row.og?.description && row.og?.url && row.og?.image ? "OK" : "MISS";
    const twStatus = row.twitter?.card && row.twitter?.title && row.twitter?.description && row.twitter?.image ? "OK" : "MISS";
    return `| ${escapeCell(row.route)} | ${row.status} | ${escapeCell(row.title)} | ${escapeCell(row.description)} | ${escapeCell(row.h1)} | ${escapeCell(row.canonical)} | ${ogStatus} | ${twStatus} | ${escapeCell(row.issues.join("; "))} | ${row.issues.length ? "FAIL" : "OK"} |`;
  })
].join("\n");
fs.writeFileSync(reportPath, `${report}\n`, "utf8");

const issueCount = rows.reduce((sum, row) => sum + row.issues.length, 0);
console.log(JSON.stringify({ reportPath, routeCount: expected.length, issueCount }, null, 2));
if (issueCount) process.exit(1);
