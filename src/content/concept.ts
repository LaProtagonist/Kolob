import { approvedCopy } from "./approved-copy";
import { mediaMap } from "./media-map";

const conceptHeroImage = {
  base: "hero-kolobok",
  widths: [768, 1200, 1440],
  sizes: "(max-width: 860px) 100vw, 56vw",
  alt: "Колобки с начинкой, зеленью и разрезом на тёмном фоне"
};

export const conceptHero = {
  eyebrow: "Концепция",
  title: approvedCopy.conceptDefinition,
  lead: approvedCopy.productVariety,
  text: approvedCopy.conceptExplanation,
  image: conceptHeroImage,
  mediaShape: "circle" as const
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
  text: "Классические колобки, Манчесы, десерты и напитки развивают систему, сохраняя общий принцип: удобно, быстро, качественно",
  items: [
    {
      title: "Классические колобки",
      text: "Основная форма продукта для повседневного сценария еды в пути.",
      image: mediaMap.conceptFormats.classic
    },
    {
      title: "Манчесы",
      text: "Отдельный формат со своими особенностями вкусовых сочетаний.",
      image: mediaMap.conceptFormats.ufo
    },
    {
      title: "Десертные форматы",
      text: "Сладкое направление внутри той же продуктовой системы.",
      image: mediaMap.conceptFormats.dessert
    },
    {
      title: "Напитки",
      text: "Авторская технология лимонадов как часть полного формата.",
      image: mediaMap.conceptFormats.drinks
    }
  ]
};

export const conceptMeaningBlock = {
  left: {
    title: "Еда в пути",
    text: [
      "Еда в пути — это полноценный перенос ресторанного качества и логики подачи в мобильный городской формат.",
      "Колобочная сохраняет ощущение цельной порции: колобки, соус, свежие дополнения, микрозелень, сыр и топпинги собираются в удобную подачу, которую можно съесть на месте, взять с собой или встроить в ритм города."
    ],
    tags: [
      "полноценная порция",
      "ресторанная логика подачи",
      "удобно взять с собой",
      "создано для городского ритма"
    ]
  },
  right: {
    title: "Русский культурный код",
    text: [
      "Колобок — русский образ движения: круглая форма, которая не стоит на месте.",
      "Колобочная переносит этот образ в современный городской формат еды, сохраняя форму, идею пути и ощущение собственного национального продукта."
    ],
    tags: [
      "узнаваемая форма",
      "движение и путь",
      "современное прочтение",
      "национальный продукт"
    ]
  }
};
