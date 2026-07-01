import type { HeroVideo, ImageSpec } from "../types";
import { approvedCopy } from "./approved-copy";
import { mediaMap } from "./media-map";

type QualitySection = {
  id: string;
  title: string;
  text: string[];
  image?: ImageSpec | null;
  video?: HeroVideo | null;
  tone?: "light" | "paper";
};

type QualityDrinkLine = {
  title: string;
  text: string;
  image?: ImageSpec | null;
};

const productVisual: ImageSpec = {
  base: "hero-kolobok",
  widths: [768, 1200, 1440],
  sizes: "(max-width: 860px) 100vw, 48vw",
  alt: "Готовая порция Колобочной"
};

const greensVisual: ImageSpec = {
  base: "product-greens",
  widths: [420, 720, 960],
  sizes: "(max-width: 860px) 100vw, 42vw",
  alt: "Колобки со свежей зеленью и дополнениями"
};

const cutawayVisual: ImageSpec = {
  base: "cutaway-02",
  widths: [420, 760],
  sizes: "(max-width: 860px) 100vw, 42vw",
  alt: "Разрез продукта Колобочной"
};

const hotDrinkVisual: ImageSpec = {
  base: "drink-dark",
  widths: [420, 720, 960],
  sizes: "(max-width: 720px) 100vw, 32vw",
  alt: "Горячий напиток Колобочной"
};

const coldDrinkVisual: ImageSpec = {
  base: "drink-tea",
  widths: [420, 720, 960],
  sizes: "(max-width: 720px) 100vw, 32vw",
  alt: "Холодный напиток Колобочной"
};

export const qualityHero = {
  eyebrow: "Качество и подход",
  title: approvedCopy.qualityFormula,
  lead: approvedCopy.qualityLead,
  text: "Вкус создаётся выбором продукта, авторской технологией и контролем приготовления на каждом этапе.",
  image: mediaMap.qualityPage.hero ?? productVisual,
  heroClassName: "quality-page-hero"
};

export const qualitySections: QualitySection[] = [
  {
    id: "portion",
    title: "Качество в каждой порции",
    text: [
      "Колобочная собирает продукт как цельную подачу: колобки, соус, свежие дополнения, микрозелень, сыр и топпинги работают вместе. Это ресторанная логика подачи, перенесённая в формат еды в пути."
    ],
    image: mediaMap.qualityPage.portion ?? productVisual,
    tone: "light"
  },
  {
    id: "product-taste",
    title: "Продукты с собственным вкусом",
    text: [
      "Мы выбираем ингредиенты, у которых уже есть яркий вкус: фермерское и региональное сырьё, морепродукты, деликатесные позиции, свежие дополнения и сезонные продукты. Рецептура строится так, чтобы не перекрыть продукт, а раскрыть его.",
      "Вкус готовой порции начинается с качества исходного продукта."
    ],
    image: mediaMap.qualityPage.productTaste ?? cutawayVisual,
    tone: "paper"
  },
  {
    id: "technology",
    title: "Технология создана под продукт",
    text: [
      "Форма, рецептура и способ приготовления разработаны внутри проекта. Мы не адаптируем чужую кухню, а создаём собственный формат еды в пути с повторяемым вкусом и стабильной подачей."
    ],
    image: mediaMap.homeQualityLoop.poster,
    video: mediaMap.homeQualityLoop,
    tone: "light"
  },
  {
    id: "fresh-details",
    title: "Свежесть в деталях",
    text: [
      "Микрозелень, мята и свежие травы — небольшие элементы, которые заметно влияют на вкус, вид и ощущение порции. Часть этих ингредиентов выращивается внутри собственной городской фермы.",
      "Это даёт контроль свежести и возможность развивать направление дальше — от зелени к новым растительным позициям."
    ],
    image: mediaMap.qualityPage.freshDetails ?? greensVisual,
    tone: "paper"
  }
];

export const qualityDrinks = {
  title: "Напитки как часть формата",
  text: "Напиточная линия дополняет продукт и не повторяет стандартную кофейную карту. В основе — горячие чайные напитки и холодные натуральные сочетания.",
  lines: [
    {
      title: "Горячие напитки",
      text: "Пуэры и другие чайные позиции в формате стакана с собой: насыщенный вкус, бодрящий характер и городская подача. Альтернатива большому количеству кофейных точек.",
      image: mediaMap.qualityPage.drinksHot ?? hotDrinkVisual
    },
    {
      title: "Холодные лимонады",
      text: "Неожиданные сочетания вкусов. Только органические ингредиенты.",
      image: mediaMap.qualityPage.drinksCold ?? coldDrinkVisual
    }
  ] satisfies QualityDrinkLine[]
};

export const repeatableQuality = {
  title: "Качество должно повторяться",
  text: "Для сети важно не только создать вкусный продукт, но и повторять его в разных точках. Поэтому ключевые компоненты готовятся внутри собственной производственной системы, а на точке сохраняется финальная подача и единый стандарт.",
  note: "Производственная система позволяет воспроизводить качество независимо от города и формата заведения.",
  image: mediaMap.qualityPage.repeatableQuality
};

export const qualityCta = {
  title: "Качество как основа масштабирования",
  text: "Подход к продукту, напиткам, свежим ингредиентам и производственной системе формирует базу для развития сети с единым стандартом качества.",
  primaryLabel: "Обсудить участие",
  primaryHref: "/investor-questions",
  secondaryLabel: "К инвестиционной модели",
  secondaryHref: "/investment"
};
