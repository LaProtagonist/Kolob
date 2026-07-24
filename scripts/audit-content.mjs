import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const publicRoots = ["src", "public", "index.html", "dist"].map((item) => path.join(projectRoot, item));
const allowedExtensions = new Set([".ts", ".tsx", ".js", ".jsx", ".json", ".html", ".css", ".md"]);
const ignoredDirs = new Set(["node_modules", ".git", ".playwright-browsers", ".npm-cache", "analysis", "reference", "Madia", "tools"]);

const requiredPhrases = [
  "Еда в пути. Всё внутри.",
  "Современный формат качественной еды в удобной форме.",
  "Мы объединили качество, свежесть и удобство в одной форме — чтобы хорошая еда попадала в руки гостя быстро и без потери вкуса",
  "Колобок — полноценная еда, собранная в удобную форму.",
  "Одна форма. Множество вкусов.",
  "Качественная еда. Быстрый формат.",
  "Вкус начинается с продукта.",
  "Полный цикл производства и централизованные поставки обеспечивают стабильное качество каждой порции во всей сети.",
  "Централизованная подготовка сокращает количество операций на точках, упрощает работу открытой кухни и позволяет точно воспроизводить рецептуру независимо от города и формата заведения.",
  "Контроль качества на всём пути — от происхождения сырья до готовой порции в руках гостя.",
  "Часть растительных ингредиентов мы выращиваем на собственной городской ферме, контролируя их путь — от первых всходов до готовой порции.",
  "Неожиданные сочетания вкусов. Только органические ингредиенты."
];

const forbiddenPhrases = [
  "Колобовщина",
  "Колобочное",
  "Клабочный",
  "мы хотим",
  "мы переосмысливаем",
  "может использоваться",
  "возможно будет",
  "один цех — десять точек",
  "100 чеков",
  "средний чек",
  "EBITDA",
  "окупаемость",
  "демонстрационная форма",
  "будет добавлено",
  "уточняется",
  "в разработке",
  "видео появится позже",
  "контакты появятся позже"
];

function walk(target) {
  if (!fs.existsSync(target)) {
    return [];
  }

  const stat = fs.statSync(target);
  if (stat.isFile()) {
    return allowedExtensions.has(path.extname(target)) ? [target] : [];
  }

  const entries = [];
  for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirs.has(entry.name)) {
      continue;
    }
    entries.push(...walk(path.join(target, entry.name)));
  }
  return entries;
}

function relative(file) {
  return path.relative(projectRoot, file).replaceAll(path.sep, "/");
}

const files = publicRoots.flatMap(walk);
const corpus = files.map((file) => ({ file, text: fs.readFileSync(file, "utf8") }));
const combined = corpus.map((item) => item.text).join("\n");

const missing = requiredPhrases.filter((phrase) => !combined.includes(phrase));
const forbidden = [];

for (const item of corpus) {
  for (const phrase of forbiddenPhrases) {
    if (item.text.includes(phrase)) {
      forbidden.push({ file: relative(item.file), phrase });
    }
  }
}

const report = {
  checkedAt: new Date().toISOString(),
  filesChecked: corpus.length,
  requiredPhrases: requiredPhrases.length,
  missing,
  forbidden
};

console.log(JSON.stringify(report, null, 2));

if (missing.length || forbidden.length) {
  process.exit(1);
}
