import type { LinkItem, NavGroup } from "../types";

export const primaryNav: LinkItem[] = [
  { href: "/", label: "Главная" }
];

export const navGroups: NavGroup[] = [
  {
    label: "О проекте",
    items: [
      { href: "/concept", label: "Концепция" },
      { href: "/history", label: "История проекта" },
      { href: "/quality", label: "Качество и подход" }
    ]
  },
  {
    label: "Инвесторам",
    items: [
      { href: "/investment", label: "Модель развития" },
      { href: "/materials", label: "Материалы проекта" },
      { href: "/revenue-model", label: "Расчёты запуска" },
      { href: "/investor-questions", label: "Обсудить участие" }
    ]
  }
];

export const footerGroups: NavGroup[] = [
  {
    label: "О проекте",
    items: [
      { href: "/concept", label: "Концепция" },
      { href: "/history", label: "История проекта" },
      { href: "/quality", label: "Качество и подход" }
    ]
  },
  {
    label: "Инвесторам",
    items: [
      { href: "/investment", label: "Модель развития" },
      { href: "/materials", label: "Материалы" },
      { href: "/investor-questions", label: "Обсудить участие" }
    ]
  },
  {
    label: "Юридическое",
    items: [
      { href: "/privacy", label: "Политика конфиденциальности" }
    ]
  }
];
