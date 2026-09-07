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
  },
  {
    id: "investorTerminal",
    path: "/investor-terminal",
    label: "Терминал инвестора",
    title: "Терминал инвестора — Колобочная",
    description: "Рабочая финансовая модель объекта «Колобочной»: исходные параметры, стартовые инвестиции и экономика пользовательского сценария.",
    ogImage: "/media/hero-kolobok-1200.webp",
    noindex: true
  },
  {
    id: "franchisePlatform",
    path: "/investor/franchise-platform",
    label: "Franchise Platform Strategy",
    title: "Franchise Platform Strategy — Колобочная",
    description: "Внутренняя proposed-архитектура центрального производства, Franchise Operating System и масштабирования сети «Колобочная».",
    ogImage: "/media/hero-kolobok-1200.webp",
    noindex: true
  },
  {
    id: "franchisePlatformPetrogradka",
    path: "/investor/franchise-platform/petrogradka",
    label: "PETROGRADKA scenario",
    title: "READY_PRODUCTION_BASE / PETROGRADKA — Колобочная",
    description: "Research-сценарий готового производственного помещения как первого центрального заготовочного узла «Колобочной».",
    ogImage: "/media/hero-kolobok-1200.webp",
    noindex: true
  },
  {
    id: "launchBudget",
    path: "/launch-budget",
    label: "Расчёт стоимости запуска",
    title: "Расчёт стоимости запуска — Колобочная",
    description: "Предварительный расчёт стоимости запуска первого совмещённого объекта «Колобочной» при покупке или аренде помещения.",
    ogImage: "/media/hero-kolobok-1200.webp",
    noindex: true
  },
  {
    id: "revenueModel",
    path: "/revenue-model",
    label: "Расчёт объёма продаж",
    title: "Расчёт объёма продаж — Колобочная",
    description: "Модель потенциального объёма продаж совмещённого объекта «Колобочной»: поток заказов, структура среднего чека и производственная нагрузка.",
    ogImage: "/media/hero-kolobok-1200.webp",
    noindex: true
  },
  {
    id: "economics",
    path: "/economics",
    label: "Экономика объекта",
    title: "Экономика объекта — Колобочная",
    description: "Модель экономики совмещённого объекта «Колобочной»: объём продаж, операционные расходы, стартовые инвестиции и срок окупаемости.",
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
