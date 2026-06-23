import type { ProductItem, VideoItem } from "../types";
import { approvedCopy } from "./approved-copy";

export const homeHero = {
  eyebrow: approvedCopy.brand,
  title: approvedCopy.tagline,
  lead: approvedCopy.heroSubtitle,
  text: null,
  image: {
    base: "hero-kolobok",
    widths: [768, 1200, 1440],
    sizes: "(max-width: 860px) 100vw, 56vw",
    alt: "Колобки с начинкой, зеленью и разрезом на тёмном фоне"
  },
  video: {
    mp4: null,
    webm: null,
    poster: {
      base: "hero-kolobok",
      widths: [768, 1200, 1440],
      sizes: "(max-width: 860px) 100vw, 56vw",
      alt: "Колобки с начинкой, зеленью и разрезом на тёмном фоне"
    }
  }
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
    title: "Продукт в городской точке",
    meta: "Обзорный материал",
    year: "2023–2024",
    place: "Санкт-Петербург",
    description: "Кадры городской точки, выдачи продукта и живого контакта с гостями.",
    originalPublicationUrl: null,
    reach: null,
    poster: {
      base: "point-facade",
      widths: [480, 840],
      sizes: "(max-width: 720px) 84vw, 43vw",
      alt: "Фасад городской точки Колобочной"
    }
  },
  {
    title: "Событийный формат",
    meta: "Обзорный материал",
    year: "2024",
    place: "Solar Systo Togathering",
    description: "Фестивальная площадка, рабочие процессы, очередь и реакция гостей на продукт.",
    originalPublicationUrl: null,
    reach: null,
    poster: {
      base: "festival-truck",
      widths: [480, 840],
      sizes: "(max-width: 720px) 84vw, 38vw",
      alt: "Фестивальная точка с графикой Колобочной"
    }
  }
];

export const homeQuality = {
  title: approvedCopy.fastFormat,
  text: approvedCopy.fastFormatText,
  items: ["Качественное сырьё", "Собственная технология", "Удобная форма"],
  link: { href: "/quality", label: "Подробнее о качестве" }
};

export const homeScale = {
  title: "Производственная модель",
  text: approvedCopy.productionFormula,
  steps: ["производство", "поставки", "городские точки"],
  link: { href: "/investment", label: "Инвестиционная модель" }
};

export const homeTeasers: ProductItem[] = [
  {
    title: "Одна форма",
    text: "Узнаваемая форма помогает быстро понять продукт и удерживает единый визуальный стандарт.",
    image: {
      base: "product-classic",
      widths: [420, 720, 960],
      sizes: "(max-width: 720px) 100vw, 31vw",
      alt: "Студийное фото колобков на тёмном фоне"
    }
  },
  {
    title: "Множество вкусов",
    text: "Внутри формы раскрываются мясные, морские, вегетарианские и сладкие направления.",
    image: {
      base: "hero-dessert",
      widths: [720, 1080],
      sizes: "(max-width: 720px) 100vw, 31vw",
      alt: "Десертный вариант продукта Колобочной"
    }
  },
  {
    title: "Еда в пути",
    text: "Формат рассчитан на быструю выдачу, удобное потребление и полноценную начинку внутри.",
    image: {
      base: "cutaway-02",
      widths: [420, 760],
      sizes: "(max-width: 720px) 100vw, 31vw",
      alt: "Разрез колобка с начинкой"
    }
  }
];
