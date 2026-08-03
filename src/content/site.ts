import type { PageMeta } from "../types";
import { approvedCopy } from "./approved-copy";

export const site = {
  name: approvedCopy.brand,
  tagline: approvedCopy.tagline,
  origin: "https://colob.spi.ski",
  ctaLabel: approvedCopy.cta.discuss,
  ctaHref: "/investor-questions",
  materialHref: "/materials",
  logoDark: "/media/logo-black.png",
  logoLight: "/media/logo-yellow.png",
  year: new Date().getFullYear(),
  contact: {
    email: null,
    telegram: null,
    phone: null
  },
  disclaimer:
    "Информация на сайте носит ознакомительный характер и не является публичной офертой, инвестиционной рекомендацией или предложением ценных бумаг. Подробные условия участия обсуждаются индивидуально."
};

export const pages: PageMeta[] = [
  {
    id: "home",
    path: "/",
    label: "Главная",
    title: approvedCopy.seo.home.title,
    description: approvedCopy.seo.home.description,
    ogImage: "/media/hero-kolobok-1200.webp"
  },
  {
    id: "concept",
    path: "/concept",
    label: "Концепция",
    title: approvedCopy.seo.concept.title,
    description: approvedCopy.seo.concept.description,
    ogImage: "/media/product-classic-960.webp"
  },
  {
    id: "history",
    path: "/history",
    label: "История проекта",
    title: approvedCopy.seo.history.title,
    description: approvedCopy.seo.history.description,
    ogImage: "/media/festival-truck-840.webp"
  },
  {
    id: "quality",
    path: "/quality",
    label: "Качество и подход",
    title: approvedCopy.seo.quality.title,
    description: approvedCopy.seo.quality.description,
    ogImage: "/media/product-greens-960.webp"
  },
  {
    id: "investment",
    path: "/investment",
    label: "Модель развития",
    title: approvedCopy.seo.investment.title,
    description: approvedCopy.seo.investment.description,
    ogImage: "/media/investment-hero-main-840.webp"
  },
  {
    id: "materials",
    path: "/materials",
    label: "Материалы",
    title: approvedCopy.seo.materials.title,
    description: approvedCopy.seo.materials.description,
    ogImage: "/media/point-guests-840.webp"
  },
  {
    id: "investorQuestions",
    path: "/investor-questions",
    label: "Обсудить участие",
    title: approvedCopy.seo.investorQuestions.title,
    description: approvedCopy.seo.investorQuestions.description,
    ogImage: "/media/hero-kolobok-1200.webp"
  },
  {
    id: "privacy",
    path: "/privacy",
    label: "Политика конфиденциальности",
    title: approvedCopy.seo.privacy.title,
    description: approvedCopy.seo.privacy.description,
    ogImage: "/media/hero-kolobok-1200.webp"
  },
  {
    id: "capexConfigurator",
    path: "/capex-configurator",
    label: "CAPEX-конфигуратор",
    title: "CAPEX-конфигуратор — Колобочная",
    description: "Внутренняя рабочая страница для выбора формата точки, модулей и оборудования с исследовательскими ценами.",
    ogImage: "/media/hero-kolobok-1200.webp",
    noindex: true
  }
];

export const notFoundPage: PageMeta = {
  id: "notFound",
  path: "/404",
  label: "Страница не найдена",
  title: "Страница не найдена — Колобочная",
  description: "Запрошенная страница сайта проекта “Колобочная” не найдена.",
  ogImage: "/media/hero-kolobok-1200.webp",
  noindex: true
};

export function pageByPath(pathname: string) {
  const normalized = pathname === "" ? "/" : pathname.replace(/\/+$/, "") || "/";
  return pages.find((page) => page.path === normalized) ?? notFoundPage;
}
