import type { DocumentItem, VideoItem } from "../types";
import { overviewVideos } from "./home";
import { mediaMap } from "./media-map";

export const materialsHero = {
  eyebrow: "Материалы",
  title: "Медиа и документы первого касания",
  lead:
    "Единое место для фото, видео и материалов проекта, которые помогают быстро понять продукт и стадию развития.",
  text:
    "Обзорные видео, фотографии продукта, городских точек и фестивальных площадок собраны как первый слой знакомства с «Колобочной».",
  image: {
    base: "point-guests",
    widths: [480, 840],
    sizes: "(max-width: 860px) 100vw, 48vw",
    alt: "Гости у городской точки Колобочной"
  }
};

export const materialVideos: VideoItem[] = overviewVideos;

export const moments = mediaMap.moments;

export const documents: DocumentItem[] = [
  {
    title: "Инвестиционный меморандум",
    description:
      "Закрытый документ первого касания с описанием продукта, модели развития и вопросов для обсуждения.",
    status: "по запросу",
    actionLabel: "Запросить",
    href: "/investor-questions",
    documentUrl: null
  }
];
