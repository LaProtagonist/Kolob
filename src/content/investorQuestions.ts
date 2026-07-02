import { approvedCopy } from "./approved-copy";

export const investorQuestionsHero = {
  eyebrow: "Обсудить участие",
  title: approvedCopy.cta.discuss,
  lead:
    "Оставьте удобный контакт — мы свяжемся, уточним формат интереса и после разговора предоставим релевантные материалы.",
  text: approvedCopy.investorContactText,
  image: {
    base: "hero-kolobok",
    widths: [768, 1200, 1440],
    sizes: "(max-width: 860px) 100vw, 48vw",
    alt: "Продукт Колобочной как основной визуал формы"
  },
  mediaShape: "circle" as const
};

export const investorQuestionsIntro = {
  title: "Канал для предметного разговора",
  text:
    "Оставьте удобный контакт — мы свяжемся, уточним формат интереса и после разговора предоставим релевантные материалы."
};

export const interestOptions = [
  "финансовое участие",
  "стратегическое партнёрство",
  "региональное развитие",
  "помещения или инфраструктура",
  "приобретение лицензионных прав",
  "другое"
];
