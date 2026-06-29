import type { ProductItem, VideoItem } from "../types";
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

export const homeAbout = {
  title: "О проекте",
  text: approvedCopy.projectDescription,
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
  items: ["фермерское и региональное сырьё", "собственная технология", "открытая кухня"],
  link: { href: "/quality", label: "Подробнее о качестве" }
};

export const homeScale = {
  title: "Полный цикл. Единое качество.",
  text: approvedCopy.productionFormula,
  steps: ["сырьё", "производство", "поставки", "открытая кухня", "готовая порция"],
  link: { href: "/investment", label: "Инвестиционная модель" }
};

export const homeTeasers: ProductItem[] = [
  {
    title: "Продукт",
    text: "Колобок — полноценная еда, собранная в удобную форму.",
    image: mediaMap.aboutCircles.product ?? undefined
  },
  {
    title: "Технология",
    text: "Полный цикл производства и централизованные поставки обеспечивают стабильное качество каждой порции.",
    image: mediaMap.aboutCircles.technology ?? undefined
  },
  {
    title: "Масштаб",
    text: "Формат рассчитан на развитие сети городских точек в разных регионах.",
    image: mediaMap.aboutCircles.scale ?? undefined
  }
];
