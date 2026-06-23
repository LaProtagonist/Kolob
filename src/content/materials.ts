import type { DocumentItem, ProductItem, VideoItem } from "../types";
import { overviewVideos } from "./home";

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

export const photoGroups: ProductItem[] = [
  {
    title: "Продукт",
    text: "Студийные кадры продукта и разрезов для объяснения формы, начинки и визуального стандарта.",
    image: {
      base: "hero-kolobok",
      widths: [768, 1200, 1440],
      sizes: "(max-width: 720px) 100vw, 31vw",
      alt: "Основной продуктовый кадр Колобочной"
    }
  },
  {
    title: "Разрезы",
    text: "Фотографии, которые показывают внутреннее устройство продукта и работу начинки внутри формы.",
    image: {
      base: "cutaway-01",
      widths: [420, 760],
      sizes: "(max-width: 720px) 100vw, 31vw",
      alt: "Разрез продукта Колобочной"
    }
  },
  {
    title: "Точки",
    text: "Городские материалы: фасад, интерьер, выдача и контакт с гостями.",
    image: {
      base: "point-facade",
      widths: [480, 840],
      sizes: "(max-width: 720px) 100vw, 31vw",
      alt: "Фасад точки Колобочной"
    }
  },
  {
    title: "Фестивали",
    text: "Событийные кадры, подтверждающие работу продукта вне стационарной точки.",
    image: {
      base: "festival-window",
      widths: [480, 840],
      sizes: "(max-width: 720px) 100vw, 31vw",
      alt: "Фестивальный материал Колобочной"
    }
  },
  {
    title: "Напитки",
    text: "Пуэр, пуэр с кокосовыми сливками, натуральные лимонады и сезонные сочетания.",
    image: {
      base: "drink-tea",
      widths: [420, 720, 960],
      sizes: "(max-width: 720px) 100vw, 31vw",
      alt: "Напиточная линия Колобочной"
    }
  },
  {
    title: "Открытая кухня",
    text: "Кадры точки и процесса показывают финальное приготовление перед выдачей гостю.",
    image: {
      base: "point-interior",
      widths: [480, 840],
      sizes: "(max-width: 720px) 100vw, 31vw",
      alt: "Открытая кухня как часть процесса"
    }
  }
];

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
