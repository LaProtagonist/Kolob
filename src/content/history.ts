import type { TimelineItem } from "../types";
import { approvedCopy } from "./approved-copy";

export const historyHero = {
  eyebrow: "История проекта",
  title: approvedCopy.history.h1,
  lead: approvedCopy.history.intro,
  text: approvedCopy.history.nextStage,
  image: {
    base: "festival-window",
    widths: [480, 840],
    sizes: "(max-width: 860px) 100vw, 48vw",
    alt: "Фестивальная площадка Колобочной"
  }
};

export const timeline: TimelineItem[] = [
  {
    period: "2021",
    title: "Крым",
    text: approvedCopy.history.crimea2021,
    image: {
      base: "festival-product",
      widths: [480, 840],
      sizes: "(max-width: 720px) 100vw, 38vw",
      alt: "Колобки на фестивальной площадке"
    }
  },
  {
    period: "2022",
    title: "Севастополь",
    text: approvedCopy.history.sevastopol2022,
    image: {
      base: "point-street",
      widths: [480, 840],
      sizes: "(max-width: 720px) 100vw, 38vw",
      alt: "Городская точка Колобочной"
    }
  },
  {
    period: "2022",
    title: "Судак",
    text: approvedCopy.history.sudak2022,
    image: {
      base: "festival-window",
      widths: [480, 840],
      sizes: "(max-width: 720px) 100vw, 38vw",
      alt: "Фестивальная витрина Колобочной"
    }
  },
  {
    period: "2023",
    title: "Санкт-Петербург",
    text: approvedCopy.history.spb2023,
    image: {
      base: "point-interior",
      widths: [480, 840],
      sizes: "(max-width: 720px) 100vw, 38vw",
      alt: "Интерьер городской точки Колобочной"
    }
  },
  {
    period: "2024",
    title: "Solar Systo Togathering",
    text: approvedCopy.history.solar2024,
    image: {
      base: "festival-truck",
      widths: [480, 840],
      sizes: "(max-width: 720px) 100vw, 38vw",
      alt: "Фестивальная точка Колобочной"
    }
  }
];
