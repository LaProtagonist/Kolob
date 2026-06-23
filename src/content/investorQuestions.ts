import { approvedCopy } from "./approved-copy";

export const investorQuestionsHero = {
  eyebrow: "Вопросы инвестора",
  title: approvedCopy.cta.discuss,
  lead:
    "Расскажите, какой формат сотрудничества вам интересен. Мы предоставим дополнительные материалы и обсудим возможную структуру участия.",
  text: approvedCopy.investorContactText,
  image: {
    base: "hero-kolobok",
    widths: [768, 1200, 1440],
    sizes: "(max-width: 860px) 100vw, 48vw",
    alt: "Продукт Колобочной как основной визуал формы"
  }
};

export const interestOptions = [
  "финансовое участие",
  "стратегическое партнёрство",
  "региональное развитие",
  "помещения или инфраструктура",
  "приобретение или лицензирование прав",
  "другое"
];
