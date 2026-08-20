import type { DocumentItem, VideoItem } from "../types";
import { overviewVideos } from "./home";
import { heroVideo, mediaMap } from "./media-map";

export const materialsHero = {
  eyebrow: "Материалы",
  title: "Материалы проекта",
  lead:
    "Фото, видео материалы, которые помогают быстро понять продукт и стадию развития.",
  text:
    "Обзорные видео, фотографии продукта, городских точек и фестивальных площадок собраны как первый шаг знакомства с «Колобочной».",
  image: mediaMap.hero.poster,
  video: heroVideo,
  mediaShape: "circle" as const
};

export const materialVideos: VideoItem[] = overviewVideos;

export const moments = mediaMap.moments;

export const documents: DocumentItem[] = [
  {
    title: "Ознакомиться с расчётами запуска",
    description:
      "Доходы, стоимость запуска и экономика объекта в трёх сценариях.",
    href: "/revenue-model",
    documentUrl: null,
    featured: true,
    fullCardLink: true
  },
  {
    title: "Инвестиционный меморандум",
    description:
      "Закрытый документ первого касания с описанием продукта, модели развития и вопросов для обсуждения.",
    status: "по запросу",
    actionLabel: null,
    href: null,
    documentUrl: null
  }
];
