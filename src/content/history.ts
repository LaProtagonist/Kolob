import type { TimelineItem } from "../types";
import { approvedCopy } from "./approved-copy";

function historyCover(base: string, alt: string) {
  return {
    mp4: `/media/${base}.mp4`,
    webm: `/media/${base}.webm`,
    poster: {
      base: `${base}-poster`,
      widths: [480, 840],
      sizes: "(max-width: 720px) 100vw, 38vw",
      alt
    }
  };
}

const crimea2021Cover = historyCover(
  "history-crimea-2021-cover",
  "Архивное видео Колобочной в Крыму"
);

const fligel2023Cover = historyCover(
  "history-fligel-2023-cover",
  "Видео открытия стационарной точки Колобочной во Флигеле"
);

const solar2024Cover = historyCover(
  "history-solar-2024-cover",
  "Видео Колобочной на Solar Systo Togathering"
);

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
    image: crimea2021Cover.poster,
    coverVideo: crimea2021Cover
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
    image: fligel2023Cover.poster,
    coverVideo: fligel2023Cover
  },
  {
    period: "2024",
    title: "Solar Systo Togathering",
    text: approvedCopy.history.solar2024,
    image: solar2024Cover.poster,
    coverVideo: solar2024Cover
  }
];
