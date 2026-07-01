import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const projectRoot = "D:\\Protagonist_DEV\\Колобочная";
const outDir = path.join(projectRoot, "public", "media");

const media = {
  logoBlack: "D:\\Protagonist_Dev\\Колобочная\\Madia\\4. КОЛОБКИ\\Дизайн\\Логотип-02.png",
  logoYellow: "D:\\Protagonist_Dev\\Колобочная\\Madia\\4. КОЛОБКИ\\Дизайн\\Логотип_Монтажная область 1.png",
  hero: "D:\\Protagonist_Dev\\Колобочная\\Madia\\IMG_6914.JPG",
  heroAlt: "D:\\Protagonist_Dev\\Колобочная\\Madia\\4. КОЛОБКИ\\Дизайн\\колобочная\\Веб\\Колобочная1958.jpg",
  products: [
    ["product-classic", "D:\\Protagonist_Dev\\Колобочная\\Madia\\4. КОЛОБКИ\\Дизайн\\колобочная\\Веб\\Колобочная0008.jpg"],
    ["product-greens", "D:\\Protagonist_Dev\\Колобочная\\Madia\\4. КОЛОБКИ\\Дизайн\\колобочная\\Веб\\Колобочная1928.jpg"],
    ["product-warm", "D:\\Protagonist_Dev\\Колобочная\\Madia\\4. КОЛОБКИ\\Дизайн\\колобочная\\Веб\\Колобочная1946.jpg"],
    ["product-dessert", "D:\\Protagonist_Dev\\Колобочная\\Madia\\4. КОЛОБКИ\\Дизайн\\колобочная\\Веб\\Колобочная1958.jpg"]
  ],
  drinks: [
    ["drink-tea", "D:\\Protagonist_Dev\\Колобочная\\Madia\\4. КОЛОБКИ\\Дизайн\\колобочная\\Веб\\Колобочная0012.jpg"],
    ["drink-dark", "D:\\Protagonist_Dev\\Колобочная\\Madia\\4. КОЛОБКИ\\Дизайн\\колобочная\\Веб\\Колобочная0273.jpg"]
  ],
  cutaways: [
    ["cutaway-02", "D:\\Protagonist_Dev\\Колобочная\\Madia\\2024\\IMG_0963.JPG"],
    ["cutaway-03", "D:\\Protagonist_Dev\\Колобочная\\Madia\\2024\\IMG_0969_jpg.JPG"]
  ],
  history: [
    ["point-interior", "D:\\Protagonist_Dev\\Колобочная\\Madia\\4. КОЛОБКИ\\Фото\\Обработ\\IMG_20230904_193745.jpg"],
    ["point-street", "D:\\Protagonist_Dev\\Колобочная\\Madia\\4. КОЛОБКИ\\Фото\\Обработ\\IMG_20230905_165711.jpg"],
    ["point-guests", "D:\\Protagonist_Dev\\Колобочная\\Madia\\4. КОЛОБКИ\\Фото\\Обработ\\IMG_4479.JPG"],
    ["festival-product", "D:\\Protagonist_Dev\\Колобочная\\Madia\\сист 2024\\IMG_6652.JPG"],
    ["festival-truck", "D:\\Protagonist_Dev\\Колобочная\\Madia\\сист 2024\\IMG_6772.JPG"]
  ],
  people: [
    ["person-placeholder", "D:\\Protagonist_Dev\\Колобочная\\Madia\\4. КОЛОБКИ\\Фото\\Обработ\\IMG_0716.JPG"]
  ]
};

async function ensureDir() {
  await fs.mkdir(outDir, { recursive: true });
}

async function copyLogo(source, name) {
  await fs.copyFile(source, path.join(outDir, `${name}.png`));
  await sharp(source)
    .rotate()
    .resize({ width: 512, height: 512, fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .webp({ quality: 92 })
    .toFile(path.join(outDir, `${name}.webp`));
}

async function makeFavicon(source) {
  await sharp(source)
    .rotate()
    .resize({ width: 256, height: 256, fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(path.join(outDir, "favicon.png"));
}

async function makeResponsive(source, baseName, widths, options = {}) {
  const metadata = await sharp(source).metadata();
  const outputs = [];
  for (const width of widths) {
    const fileName = `${baseName}-${width}.webp`;
    const target = path.join(outDir, fileName);
    const pipeline = sharp(source).rotate();
    if (options.aspectRatio) {
      const height = Math.round(width / options.aspectRatio);
      pipeline.resize({ width, height, fit: "cover", position: options.position ?? "attention" });
    } else {
      pipeline.resize({ width, withoutEnlargement: true });
    }
    await pipeline.webp({ quality: options.quality ?? 82, effort: 5 }).toFile(target);
    outputs.push({ width, file: `/media/${fileName}` });
  }
  return {
    name: baseName,
    source,
    sourceWidth: metadata.width,
    sourceHeight: metadata.height,
    outputs
  };
}

async function main() {
  await ensureDir();
  await copyLogo(media.logoBlack, "logo-black");
  await copyLogo(media.logoYellow, "logo-yellow");
  await makeFavicon(media.logoYellow);

  const manifest = [];
  manifest.push(await makeResponsive(media.hero, "hero-kolobok", [768, 1200, 1440], { quality: 84 }));
  manifest.push(await makeResponsive(media.heroAlt, "hero-dessert", [720, 1080], { quality: 84 }));

  for (const [name, source] of [...media.products, ...media.drinks]) {
    manifest.push(await makeResponsive(source, name, [420, 720, 960], { aspectRatio: 1.18, quality: 82 }));
  }

  for (const [name, source] of media.cutaways) {
    manifest.push(await makeResponsive(source, name, [420, 760], { aspectRatio: 1.35, quality: 82 }));
  }

  for (const [name, source] of media.history) {
    manifest.push(await makeResponsive(source, name, [480, 840], { aspectRatio: 1.25, quality: 80 }));
  }

  for (const [name, source] of media.people) {
    manifest.push(await makeResponsive(source, name, [360, 640], { aspectRatio: 0.86, quality: 82 }));
  }

  await fs.writeFile(path.join(outDir, "media-manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
  console.log(`Prepared ${manifest.length} image groups in ${outDir}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
