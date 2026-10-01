// Тёмная тема: переводит цвета из стилей в переменные и строит для них тёмные значения.
//
// Запуск: npm run theme:tones            — обработать стили и пересобрать src/theme-tones.css
//         npm run theme:tones -- --check — убедиться, что новых «голых» цветов не появилось
//
// Как решается, что перекрашивать. Правило стиля остаётся как есть, если оно само тёмное
// (тёмный фон или светлый текст) либо лежит на фирменном жёлтом: такие блоки одинаковы в обеих
// темах. Остальные правила перекрашиваются: светлое становится тёмным, тёмное — светлым,
// фирменные цвета сохраняются. Тени и маски не трогаются.
// Исключения задаются списками forceKeep и forceFlip ниже.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postcss from "postcss";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const check = process.argv.includes("--check");
const tonesFile = path.join(root, "src", "theme-tones.css");
// Все стили сайта, включая вложенные папки (лаборатория визуализаций); сам файл тонов не обрабатывается.
function cssFiles(directory) {
  return fs.readdirSync(path.join(root, directory), { withFileTypes: true }).flatMap((entry) => {
    const relative = `${directory}/${entry.name}`;
    if (entry.isDirectory()) return cssFiles(relative);
    return entry.name.endsWith(".css") && relative !== "src/theme-tones.css" ? [relative] : [];
  });
}
const files = cssFiles("src").sort();

// Селекторы (или их начало), для которых автоматическое решение переопределено.
// Карты лаборатории в стиле плаката и картона и жизнь сети поверх карт (фургоны, монеты, прохожие,
// места под точки) — рисунок: одинаковы в обеих темах, как картинка.
const forceKeep = [".is-cartoon", ".is-paper", ".lf-layer", ".lf-lots"];
const forceFlip = [];

const colorPattern = /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)/g;
const skippedProperty = /shadow|mask|^filter$|^-webkit-filter$|^backdrop-filter$|^-webkit-backdrop-filter$/;
const rootTokens = ["--color-ink", "--color-black", "--color-paper", "--color-white", "--color-muted", "--color-text-muted"];

function parseColor(text) {
  const value = text.trim().toLowerCase();
  if (value.startsWith("#")) {
    let hex = value.slice(1);
    if (hex.length === 3 || hex.length === 4) hex = hex.split("").map((char) => char + char).join("");
    const number = parseInt(hex.slice(0, 6), 16);
    return { r: (number >> 16) & 255, g: (number >> 8) & 255, b: number & 255, a: hex.length === 8 ? parseInt(hex.slice(6), 16) / 255 : 1 };
  }
  const parts = value.replace(/rgba?\(|\)/g, "").split(/[\s,/]+/).filter(Boolean).map((part) => (part.endsWith("%") ? parseFloat(part) / 100 : parseFloat(part)));
  if (parts.length < 3 || parts.some(Number.isNaN)) return null;
  return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 };
}

function toHsl({ r, g, b }) {
  const [red, green, blue] = [r / 255, g / 255, b / 255];
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const lightness = (max + min) / 2;
  const chroma = max - min;
  let hue = 0;
  if (chroma) {
    if (max === red) hue = ((green - blue) / chroma) % 6;
    else if (max === green) hue = (blue - red) / chroma + 2;
    else hue = (red - green) / chroma + 4;
    hue = (hue * 60 + 360) % 360;
  }
  const saturation = chroma === 0 ? 0 : chroma / (1 - Math.abs(2 * lightness - 1));
  return { hue, saturation, lightness, chroma };
}

function fromHsl(hue, saturation, lightness) {
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const x = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = lightness - chroma / 2;
  const [red, green, blue] = hue < 60 ? [chroma, x, 0] : hue < 120 ? [x, chroma, 0] : hue < 180 ? [0, chroma, x] : hue < 240 ? [0, x, chroma] : hue < 300 ? [x, 0, chroma] : [chroma, 0, x];
  return { r: Math.round((red + m) * 255), g: Math.round((green + m) * 255), b: Math.round((blue + m) * 255) };
}

const luminance = (color) => (0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b) / 255;
const isAccent = (color) => {
  const { chroma, lightness } = toHsl(color);
  return chroma >= 0.45 && lightness > 0.3 && lightness < 0.75;
};

function format({ r, g, b, a }) {
  if (a >= 1) return `#${[r, g, b].map((part) => Math.round(part).toString(16).padStart(2, "0")).join("")}`;
  return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${Number(a.toFixed(3))})`;
}

// Тёмный двойник цвета: нейтральные тона зеркалятся по светлоте, фирменные сохраняются.
function darkTwin(color) {
  const { hue, saturation, lightness, chroma } = toHsl(color);
  let next;
  if (chroma < 0.22) {
    const mirrored = 0.085 + (1 - lightness) * 0.875;
    next = fromHsl(hue, saturation * (lightness > 0.8 ? 0.16 : lightness < 0.2 ? 0.35 : 0.7), mirrored);
  } else if (lightness > 0.72) {
    next = fromHsl(hue, saturation * 0.45, 0.19);
  } else if (lightness < 0.35) {
    next = fromHsl(hue, Math.min(saturation, 0.6), 0.66);
  } else if (lightness < 0.5) {
    next = fromHsl(hue, saturation, lightness + 0.16);
  } else {
    next = { r: color.r, g: color.g, b: color.b };
  }
  return { ...next, a: color.a };
}

function toneName(color) {
  const hex = [color.r, color.g, color.b].map((part) => Math.round(part).toString(16).padStart(2, "0")).join("");
  return color.a >= 1 ? `--tone-${hex}` : `--tone-${hex}-a${String(Math.round(color.a * 100)).padStart(2, "0")}`;
}

const normalize = (selector) => selector.trim().replace(/\s+/g, " ");
const startsWithSelector = (part, prefix) => part === prefix || (part.startsWith(prefix) && /[\s>:.[+~]/.test(part[prefix.length]));
const matchesAny = (selector, list) => selector.split(",").some((part) => list.some((prefix) => startsWithSelector(normalize(part), prefix)));

// --- 1. Читаем стили и значения переменных-цветов -----------------------------------------
const sheets = files.map((file) => ({ file, css: postcss.parse(fs.readFileSync(path.join(root, file), "utf8"), { from: file }) }));
const tokenValues = new Map();
for (const { css } of sheets) {
  css.walkDecls(/^--/, (decl) => {
    const match = decl.value.match(colorPattern);
    const looksLikeShadow = /\dpx/.test(decl.value);
    if (match && !looksLikeShadow && !tokenValues.has(decl.prop)) tokenValues.set(decl.prop, match[0]);
  });
}

// Повторный запуск должен принимать те же решения, что и первый: уже заменённые цвета
// читаются обратно — постоянные по исходным переменным, тона — из прежнего файла тонов.
for (const name of rootTokens) {
  if (tokenValues.has(name)) tokenValues.set(`--fixed-${name.slice("--color-".length)}`, tokenValues.get(name));
}
const previousTones = fs.existsSync(tonesFile) ? fs.readFileSync(tonesFile, "utf8").match(/:root \{\n([\s\S]*?)\n\}/) : null;
if (previousTones) {
  for (const match of previousTones[1].matchAll(/(--tone-[\w-]+):\s*([^;]+);/g)) tokenValues.set(match[1], match[2].trim());
}

function firstColor(value) {
  const literal = value.match(colorPattern);
  const token = value.match(/var\((--[\w-]+)/);
  const literalIndex = literal ? value.indexOf(literal[0]) : Infinity;
  const tokenIndex = token && tokenValues.has(token[1]) ? value.indexOf(token[0]) : Infinity;
  if (literalIndex === Infinity && tokenIndex === Infinity) return null;
  return parseColor(literalIndex < tokenIndex ? literal[0] : tokenValues.get(token[1]));
}

// --- 2. Решаем судьбу каждого правила -----------------------------------------------------
const darkSurfaces = [];
const accentSurfaces = [];
const accentWithOwnText = new Set();
const verdicts = new Map();

function ownNature(rule) {
  let background = null;
  let text = null;
  rule.each((node) => {
    if (node.type !== "decl") return;
    if (node.prop === "background" || node.prop === "background-color") background = firstColor(node.value) ?? background;
    if (node.prop === "color") text = firstColor(node.value) ?? text;
  });
  const solid = background && background.a >= 0.5;
  return {
    hasText: Boolean(text),
    darkBackground: Boolean(solid && luminance(background) < 0.25 && !isAccent(background)),
    accentBackground: Boolean(solid && isAccent(background)),
    lightBackground: Boolean(solid && luminance(background) > 0.6 && !isAccent(background)),
    lightText: Boolean(text && luminance(text) > 0.8),
    darkText: Boolean(text && luminance(text) < 0.4),
  };
}

for (const { css } of sheets) {
  css.walkRules((rule) => {
    if (rule.parent?.type === "atrule" && /keyframes/.test(rule.parent.name)) return;
    const nature = ownNature(rule);
    for (const part of rule.selector.split(",")) {
      if (nature.darkBackground) darkSurfaces.push(normalize(part));
      if (nature.accentBackground) accentSurfaces.push(normalize(part));
      if (nature.accentBackground && nature.hasText) accentWithOwnText.add(normalize(part));
    }
  });
}

function keeps(rule) {
  if (matchesAny(rule.selector, forceFlip)) return false;
  if (matchesAny(rule.selector, forceKeep)) return true;
  const nature = ownNature(rule);
  if (nature.darkBackground || nature.accentBackground || nature.lightText) return true;
  if (matchesAny(rule.selector, accentSurfaces)) return true;
  if (matchesAny(rule.selector, darkSurfaces)) return !(nature.lightBackground || nature.darkText);
  return false;
}

// --- 3. Переписываем значения -------------------------------------------------------------
const scopedTokenNames = new Set();
for (const { css } of sheets) {
  css.walkDecls(/^--/, (decl) => {
    if (decl.parent.selector?.trim() !== ":root" && tokenValues.has(decl.prop)) scopedTokenNames.add(decl.prop);
  });
}
const tones = new Map();
const scopedTokens = new Map();
let bareColors = 0;

function tone(literal) {
  const color = parseColor(literal);
  if (!color) return literal;
  const name = toneName(color);
  if (!tones.has(name)) tones.set(name, { light: format(color), dark: format(darkTwin(color)) });
  return `var(${name})`;
}

for (const { css } of sheets) {
  css.walkRules((rule) => {
    if (rule.parent?.type === "atrule" && /keyframes/.test(rule.parent.name)) return;
    const keep = keeps(rule);
    verdicts.set(rule, keep);
    rule.each((decl) => {
      if (decl.type !== "decl" || skippedProperty.test(decl.prop)) return;
      if (decl.prop.startsWith("--")) {
        const literal = decl.value.match(colorPattern);
        if (!literal || /\dpx/.test(decl.value) || rule.selector.trim() === ":root") return;
        const color = parseColor(literal[0]);
        if (color && literal[0] === decl.value.trim()) {
          const entries = scopedTokens.get(normalize(rule.selector)) ?? [];
          entries.push([decl.prop, format(darkTwin(color))]);
          scopedTokens.set(normalize(rule.selector), entries);
        }
        return;
      }
      if (keep) {
        // Блок одинаков в обеих темах: переменные, которые меняются от темы, заменяются постоянными значениями.
        decl.value = decl.value.replace(/var\((--[\w-]+)(?:,[^)]*)?\)/g, (whole, name) => {
          if (rootTokens.includes(name)) return `var(--fixed-${name.slice("--color-".length)})`;
          if (name.startsWith("--tone-") || name.startsWith("--fixed-")) return whole;
          return tokenValues.has(name) && scopedTokenNames.has(name) ? tokenValues.get(name) : whole;
        });
        return;
      }
      decl.value = decl.value.replace(colorPattern, (literal, offset, whole) => {
        if (/url\([^)]*$/.test(whole.slice(0, offset))) return literal;
        bareColors += 1;
        return tone(literal);
      });
    });
  });
}

if (check) {
  if (bareColors) {
    process.stderr.write(`В стилях ${bareColors} цветов записаны числом. Запустите: npm run theme:tones\n`);
    process.exit(1);
  }
  process.stdout.write("Тёмная тема: все цвета в стилях проходят через переменные.\n");
  process.exit(0);
}

// --- 4. Записываем стили и файл с тонами --------------------------------------------------
for (const { file, css } of sheets) fs.writeFileSync(path.join(root, file), css.toString());

const existing = fs.existsSync(tonesFile) ? fs.readFileSync(tonesFile, "utf8") : "";
// Повторный запуск не видит уже заменённых цветов, поэтому светлые значения берутся из прежнего файла.
const lightBlock = existing.match(/:root \{\n([\s\S]*?)\n\}/);
if (lightBlock) {
  for (const match of lightBlock[1].matchAll(/(--tone-[\w-]+):\s*([^;]+);/g)) {
    const color = parseColor(match[2]);
    if (color) tones.set(match[1], { light: format(color), dark: format(darkTwin(color)) });
  }
}

const names = [...tones.keys()].sort();
const fixed = rootTokens.map((name) => `  --fixed-${name.slice("--color-".length)}: ${tokenValues.get(name)};`).join("\n");
const darkRoot = rootTokens.map((name) => `  ${name}: ${format(darkTwin(parseColor(tokenValues.get(name))))};`).join("\n");
const darkTones = names.map((name) => `  ${name}: ${tones.get(name).dark};`).join("\n");
// На фирменном жёлтом текст остаётся тёмным в обеих темах: внутри таких блоков
// переменным возвращаются светлые значения, чтобы вложенные заголовки и абзацы не светлели.
const accentList = [...new Set(accentSurfaces)].filter((selector) => !selector.includes("::")).sort();
const lightRoot = [
  ...[...rootTokens, ...scopedTokenNames].map((name) => `  ${name}: ${tokenValues.get(name)};`),
  ...names.map((name) => `  ${name}: ${tones.get(name).light};`),
].join("\n");
// Второй блок задаёт сам цвет текста тем жёлтым блокам, которые не назначают его себе сами:
// иначе они унаследовали бы светлый текст страницы.
const accentInheriting = accentList.filter((selector) => !accentWithOwnText.has(selector));
const accentIsland = (prefix) => (accentList.length
  ? `${prefix} :is(\n  ${accentList.join(",\n  ")}\n) {\n${lightRoot}\n}\n\n${prefix} :is(\n  ${accentInheriting.join(",\n  ")}\n) {\n  color: var(--fixed-ink);\n}`
  : "");
const scoped = (prefix) => [...scopedTokens.entries()].map(([selector, entries]) => `${selector.split(",").map((part) => `${prefix} ${part.trim()}`).join(",\n")} {\n${entries.map(([name, value]) => `  ${name}: ${value};`).join("\n")}\n}`).join("\n\n");
// Отступ получают только непустые строки: иначе внутри @media остаются строки из одних пробелов.
const indent = (text) => text.replace(/^(?=.)/gm, "  ");

const output = `/* Создано командой npm run theme:tones — руками не править.
   Светлые значения совпадают с цветами, которые раньше были записаны в стилях числом.
   Постоянные цвета (--fixed-*) используются в блоках, одинаковых в обеих темах. */

:root {
${names.map((name) => `  ${name}: ${tones.get(name).light};`).join("\n")}
${fixed}
  color-scheme: light;
}

:root[data-theme="dark"] {
${darkRoot}
${darkTones}
  color-scheme: dark;
}

${scoped(':root[data-theme="dark"]')}

${accentIsland(':root[data-theme="dark"]')}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
${indent(darkRoot)}
${indent(darkTones)}
    color-scheme: dark;
  }

${indent(scoped(":root:not([data-theme=\"light\"])"))}

${indent(accentIsland(":root:not([data-theme=\"light\"])"))}
}
`;
fs.writeFileSync(tonesFile, output);

const kept = [...verdicts.values()].filter(Boolean).length;
process.stdout.write(`Тёмная тема: тонов ${names.length}, правил перекрашивается ${verdicts.size - kept}, остаётся как есть ${kept}, заменено цветов ${bareColors}.\n`);
