import { approvedCopy } from "./approved-copy";
import { mediaMap } from "./media-map";

export const conceptHero = {
  eyebrow: "Концепция",
  title: approvedCopy.conceptDefinition,
  lead: approvedCopy.productVariety,
  text: approvedCopy.conceptExplanation,
  image: {
    base: "product-warm",
    widths: [420, 720, 960],
    sizes: "(max-width: 860px) 100vw, 48vw",
    alt: "Тёплый продуктовый кадр Колобочной"
  }
};

export const conceptDefinition = approvedCopy.fastFormatAdditional;

export const conceptTasteBlock = {
  title: "Одна форма. Множество вкусов.",
  text: "Форма остаётся узнаваемой, а внутри меняется содержание.",
  tags: "Мясное · Морское · Вегетарианское · Сладкое",
  fox: {
    png: "/media/characters/fox-reaction-transparent.png",
    webp: "/media/characters/fox-reaction-transparent.webp",
    alt: "Лиса смотрит на разнообразие колобков"
  },
  collage: mediaMap.conceptTasteCollage
};

export const conceptMenuFormats = {
  title: "Форматы меню",
  text: "Классические колобки, UFO-линейка, десерты и напитки развивают систему, сохраняя общий принцип: удобно, быстро, всё внутри.",
  items: [
    {
      title: "Классический колобок",
      text: "Основная форма продукта для повседневного сценария еды в пути.",
      image: mediaMap.conceptFormats.classic
    },
    {
      title: "UFO-линейка",
      text: "Отдельный формат формы для новых сочетаний и сценариев подачи.",
      image: mediaMap.conceptFormats.ufo
    },
    {
      title: "Десертные форматы",
      text: "Сладкое направление внутри той же продуктовой системы.",
      image: mediaMap.conceptFormats.dessert
    },
    {
      title: "Напитки",
      text: "Собственная напиточная линия как часть полного формата.",
      image: mediaMap.conceptFormats.drinks
    }
  ]
};

export const movementPoints = [
  "удобно взять с собой",
  "не требуется полноценная сервировка",
  "полноценная начинка внутри",
  "формат подходит современному ритму жизни"
];

export const identityPoints = [
  "знакомый культурный образ",
  "современное прочтение",
  "без декоративного фольклора",
  "без хохломы, матрёшек и псевдорусской стилизации"
];
