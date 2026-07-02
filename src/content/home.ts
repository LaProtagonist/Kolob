import type { VideoItem } from "../types";
import { approvedCopy } from "./approved-copy";
import { heroVideo, mediaMap } from "./media-map";

export const homeHero = {
  title: approvedCopy.brand,
  taglineParts: ["Еда в пути.", "Всё внутри."],
  lead: approvedCopy.heroSubtitle,
  text: null,
  image: mediaMap.hero.imageCurrent,
  video: heroVideo
};

export const homeStatementMedia = {
  image: {
    base: "hero-kolobok",
    widths: [768, 1200, 1440],
    sizes: "(max-width: 720px) 100vw, 42vw",
    alt: "Готовая порция Колобочной в круглой маске"
  }
};

export const homeAbout = {
  title: "О проекте",
  text: "«Колобочная» — проект создания национальной сети качественной еды в пути. В основе — авторский продукт, собственная технология и узнаваемый русский культурный образ, который можно масштабировать как современный городской формат.",
  link: { href: "/concept", label: "Подробнее о концепции" }
};

export const founderQuote = {
  quote: approvedCopy.founderQuote,
  founderName: null,
  founderRole: null,
  founderImage: null,
  name: null,
  role: null,
  image: null
};

export const overviewVideos: VideoItem[] = [
  {
    title: mediaMap.homeVideos.video1.title,
    meta: "Видео",
    year: mediaMap.homeVideos.video1.year,
    platform: mediaMap.homeVideos.video1.platform,
    description: mediaMap.homeVideos.video1.description ?? undefined,
    originalPublicationUrl: mediaMap.homeVideos.video1.originalUrl,
    viewsLabel: mediaMap.homeVideos.video1.viewsLabel,
    viewsNote: mediaMap.homeVideos.video1.viewsNote,
    videoMp4: mediaMap.homeVideos.video1.videoMp4,
    videoWebm: mediaMap.homeVideos.video1.videoWebm,
    poster: mediaMap.homeVideos.video1.poster ?? mediaMap.hero.poster
  },
  {
    title: mediaMap.homeVideos.video2.title,
    meta: "Видео",
    year: mediaMap.homeVideos.video2.year,
    platform: mediaMap.homeVideos.video2.platform,
    description: mediaMap.homeVideos.video2.description ?? undefined,
    originalPublicationUrl: mediaMap.homeVideos.video2.originalUrl,
    viewsLabel: mediaMap.homeVideos.video2.viewsLabel,
    viewsNote: mediaMap.homeVideos.video2.viewsNote,
    videoMp4: mediaMap.homeVideos.video2.videoMp4,
    videoWebm: mediaMap.homeVideos.video2.videoWebm,
    poster: mediaMap.homeVideos.video2.poster ?? mediaMap.hero.poster
  }
];

export const homeQuality = {
  title: approvedCopy.qualityFormula,
  text: approvedCopy.qualityLead,
  label: "ТРИ ОПОРЫ КАЧЕСТВА",
  pillars: [
    {
      number: "01",
      title: "Фермерское и региональное сырьё",
      text: "Продукты с выраженным вкусом и понятным происхождением.",
      icon: "farm"
    },
    {
      number: "02",
      title: "Авторская технология",
      text: "Собственный способ приготовления, созданный под формат колобка.",
      icon: "technology"
    },
    {
      number: "03",
      title: "Собственное производство",
      text: "Централизованная подготовка компонентов для стабильного качества в каждой точке.",
      icon: "production"
    }
  ],
  link: { href: "/quality", label: "Подробнее о качестве" },
  media: {
    image: mediaMap.homeQualityLoop.poster,
    video: mediaMap.homeQualityLoop
  }
};

export const homeScale = {
  title: "Полный цикл. Единое качество.",
  text: approvedCopy.productionFormula,
  steps: ["сырьё", "производство", "поставки", "открытая кухня", "готовая порция"],
  link: { href: "/investment", label: "Модель развития" }
};

export const homeTeasers = [
  {
    number: "01",
    title: "Авторский продукт",
    text: "Форма, рецептура и технология разработаны внутри проекта. Это не копия существующей кухни, а собственный формат еды в пути.",
    visual: mediaMap.aboutProject.authorProduct.fallback,
    image: mediaMap.aboutProject.authorProduct.image,
    featured: true
  },
  {
    number: "02",
    title: "Русский культурный код",
    text: "Колобок — знакомый образ, превращённый в современную городскую еду без фольклорной стилизации.",
    visual: mediaMap.aboutProject.culturalCode.fallback,
    image: mediaMap.aboutProject.culturalCode.image,
    featured: false
  },
  {
    number: "03",
    title: "Проверенный интерес",
    text: "Проект уже работал в городских и фестивальных форматах, а ролики «Колобочной» собрали миллионы просмотров.",
    visual: mediaMap.aboutProject.provenInterest.fallback,
    image: mediaMap.aboutProject.provenInterest.image,
    featured: false
  }
];
