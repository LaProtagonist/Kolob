import type { ProductItem } from "../types";
import { approvedCopy } from "./approved-copy";

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

export const productFamilies: ProductItem[] = [
  {
    title: approvedCopy.productCategories.meat,
    text: "Мясные и гастрономические сочетания.",
    tag: "категория",
    image: {
      base: "product-classic",
      widths: [420, 720, 960],
      sizes: "(max-width: 720px) 84vw, 28vw",
      alt: "Мясная продуктовая категория Колобочной"
    }
  },
  {
    title: approvedCopy.productCategories.sea,
    text: "Рыба, креветки, краб, гребешок и другие морские продукты.",
    tag: "категория",
    image: {
      base: "product-greens",
      widths: [420, 720, 960],
      sizes: "(max-width: 720px) 84vw, 28vw",
      alt: "Морская продуктовая категория Колобочной"
    }
  },
  {
    title: approvedCopy.productCategories.vegetarian,
    text: "Овощи, грибы, сыр и растительные начинки.",
    tag: "категория",
    image: {
      base: "cutaway-03",
      widths: [420, 760],
      sizes: "(max-width: 720px) 84vw, 28vw",
      alt: "Вегетарианская категория продукта Колобочной"
    }
  },
  {
    title: approvedCopy.productCategories.sweet,
    text: "Ягоды, фрукты, шоколадные, сливочные и десертные сочетания.",
    tag: "категория",
    image: {
      base: "product-dessert",
      widths: [420, 720, 960],
      sizes: "(max-width: 720px) 84vw, 28vw",
      alt: "Сладкий вариант продукта Колобочной"
    }
  }
];

export const productFormats: ProductItem[] = [
  {
    title: approvedCopy.productFormats.classic,
    text: "Базовая форма продукта для основной линейки.",
    tag: "формат",
    image: {
      base: "product-classic",
      widths: [420, 720, 960],
      sizes: "(max-width: 720px) 84vw, 28vw",
      alt: "Классический колобок Колобочной"
    }
  },
  {
    title: approvedCopy.productFormats.ufo,
    text: "Отдельное направление формы, которое расширяет сценарии продукта.",
    tag: "формат",
    image: {
      base: "hero-dessert",
      widths: [720, 1080],
      sizes: "(max-width: 720px) 84vw, 28vw",
      alt: "UFO-линейка Колобочной"
    }
  },
  {
    title: approvedCopy.productFormats.dessert,
    text: "Сладкие сценарии продукта и подачи.",
    tag: "формат",
    image: {
      base: "product-dessert",
      widths: [420, 720, 960],
      sizes: "(max-width: 720px) 84vw, 28vw",
      alt: "Десертный формат Колобочной"
    }
  },
  {
    title: approvedCopy.productFormats.drinks,
    text: "Собственная напиточная линия для еды в пути.",
    tag: "формат",
    image: {
      base: "drink-tea",
      widths: [420, 720, 960],
      sizes: "(max-width: 720px) 84vw, 28vw",
      alt: "Напитки Колобочной"
    }
  }
];

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
