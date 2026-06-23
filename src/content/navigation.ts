import type { LinkItem, NavGroup } from "../types";

export const primaryNav: LinkItem[] = [
  { href: "/", label: "Главная" }
];

export const navGroups: NavGroup[] = [
  {
    label: "О проекте",
    items: [
      { href: "/concept", label: "Концепция" },
      { href: "/history", label: "История" },
      { href: "/quality", label: "Качество и подход" }
    ]
  },
  {
    label: "Инвесторам",
    items: [
      { href: "/investment", label: "Инвестиционное предложение" },
      { href: "/materials", label: "Материалы" },
      { href: "/investor-questions", label: "Вопросы инвестора" }
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
      { href: "/investment", label: "Инвестиционная модель" },
      { href: "/materials", label: "Материалы" },
      { href: "/investor-questions", label: "Вопросы инвестора" }
    ]
  },
  {
    label: "Юридическое",
    items: [
      { href: "/privacy", label: "Политика конфиденциальности" }
    ]
  }
];
