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

const historyOriginPoster = {
  base: "history-origin-loop-poster",
  widths: [480, 840],
  sizes: "(max-width: 860px) 100vw, 48vw",
  alt: "С чего начиналась Колобочная: кормление ворона колобками"
};

export const historyHero = {
  eyebrow: "История проекта",
  title: approvedCopy.history.h1,
  lead: approvedCopy.history.intro,
  text: approvedCopy.history.nextStage,
  image: historyOriginPoster,
  video: {
    mp4: "/media/history-origin-loop.mp4",
    webm: "/media/history-origin-loop.webm",
    poster: historyOriginPoster
  },
  mediaShape: "circle" as const
};

export const timeline: TimelineItem[] = [
  {
    period: "2021",
    title: "Резидент творческого пространства «Арт-Ковчег».",
    text: approvedCopy.history.crimea2021,
    image: crimea2021Cover.poster,
    coverVideo: crimea2021Cover
  },
  {
    period: "2022",
    title: "Альтернативная кухня фестиваля AsanaFest.",
    text: approvedCopy.history.sevastopol2022,
    image: {
      base: "history-asana-fest-2022",
      widths: [480, 840],
      sizes: "(max-width: 720px) 100vw, 38vw",
      alt: "Колобочная на AsanaFest в Крыму"
    }
  },
  {
    period: "2022",
    title: "Участник главного фуд-корта молодежного форума «Таврида.Арт».",
    text: approvedCopy.history.sudak2022,
    image: {
      base: "history-tavrida-art-2022",
      widths: [480, 686],
      sizes: "(max-width: 720px) 100vw, 38vw",
      alt: "Площадка форума Таврида.Арт в Судаке"
    }
  },
  {
    period: "2023",
    title: "Открытие стационарной точки в креативном пространстве «Флигель».",
    text: approvedCopy.history.spb2023,
    image: fligel2023Cover.poster,
    coverVideo: fligel2023Cover
  },
  {
    period: "2024",
    title: "Solar Systo Togathering",
    text: approvedCopy.history.solar2024,
    image: {
      base: "history-solar-static-2024",
      widths: [480, 840],
      sizes: "(max-width: 720px) 100vw, 38vw",
      alt: "Фестиваль Solar Systo Togathering"
    }
  }
];
