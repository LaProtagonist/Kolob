/**
 * Граница лаборатории визуализаций с остальным сайтом.
 *
 * Лаборатория — дополнение: её можно развивать или удалить, не трогая сайт и расчёт.
 * Проверка смотрит только на импорты в исходниках и падает, если граница нарушена:
 * - сайт знает о лаборатории в двух местах: маршрут в App.tsx и список страниц в content/site.ts;
 * - расчёт из src/lib читает только общий слой лаборатории (story.ts, useNetworkStory.ts);
 * - вариант берёт данные только из общего слоя и не заглядывает в соседние варианты;
 * - библиотека three подключается только в варианте «Город в 3D».
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rel = (file: string) => path.relative(root, file).split(path.sep).join("/");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|js|mjs|cjs)$/.test(entry.name)) out.push(full);
  }
  return out;
}

// import … from "x", export … from "x", import "x", import("x"), require("x")
const specifierPattern = /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|^\s*import\s+)["']([^"']+)["']/gm;

/** Импорты файла: путь от корня репозитория для относительных, имя пакета для остальных. */
function importsOf(file: string): string[] {
  const text = fs.readFileSync(file, "utf8");
  return [...text.matchAll(specifierPattern)].map(([, specifier]) =>
    specifier.startsWith(".") ? rel(path.resolve(path.dirname(file), specifier)) : specifier,
  );
}

const packageName = (specifier: string) => specifier.split("/").slice(0, specifier.startsWith("@") ? 2 : 1).join("/");
const isLab = (target: string) => target === "src/lab" || target.startsWith("src/lab/");
const isPackage = (target: string) => !target.startsWith("src/") && !target.startsWith("scripts/") && !target.startsWith("..");

const siteFiles = walk(path.join(root, "src")).filter((file) => !isLab(rel(file)));
const labFiles = walk(path.join(root, "src", "lab"));

test("the site reaches into the lab only through the route and the page list", () => {
  const allowed = new Set(["src/App.tsx -> src/lab/LabPage", "src/content/site.ts -> src/lab/variants.json"]);
  const offenders = siteFiles.flatMap((file) =>
    importsOf(file).filter(isLab).map((target) => `${rel(file)} -> ${target}`).filter((link) => !allowed.has(link)),
  );
  assert.deepEqual(offenders, [], "Сайт не должен зависеть от лаборатории — её можно удалить целиком.");
});

test("only the shared lab layer reads the calculation and the site", () => {
  const shared = new Set(["src/lab/story.ts", "src/lab/useNetworkStory.ts"]);
  const offenders = labFiles.flatMap((file) =>
    importsOf(file)
      .filter((target) => !isPackage(target) && !isLab(target))
      .filter(() => !shared.has(rel(file)))
      .map((target) => `${rel(file)} -> ${target}`),
  );
  assert.deepEqual(offenders, [], "Варианты получают цифры только из story: своих обращений к расчёту быть не должно.");
});

test("a variant uses only the shared lab parts and its own folder", () => {
  const sharedParts = (target: string) =>
    ["src/lab/format", "src/lab/story", "src/lab/useNetworkStory"].includes(target) || target.startsWith("src/lab/shared/");
  const offenders = labFiles.flatMap((file) => {
    const match = /^src\/lab\/variants\/([^/]+)\//.exec(rel(file));
    if (!match) return [];
    const own = `src/lab/variants/${match[1]}/`;
    return importsOf(file)
      .filter((target) => !isPackage(target))
      .filter((target) => !target.startsWith(own) && !sharedParts(target))
      .map((target) => `${rel(file)} -> ${target}`);
  });
  assert.deepEqual(offenders, [], "Вариант правится в своей папке и не зависит от соседних вариантов.");
});

test("packages: react everywhere, three only in the 3D city", () => {
  const offenders = labFiles.flatMap((file) =>
    importsOf(file)
      .filter(isPackage)
      .map(packageName)
      .filter((name) => name !== "react" && !(name === "three" && rel(file).startsWith("src/lab/variants/city3d/")))
      .map((name) => `${rel(file)} -> ${name}`),
  );
  assert.deepEqual(offenders, [], "Новая библиотека — только внутри своего варианта и с загрузкой на его странице.");
});
