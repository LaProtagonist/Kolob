const rub = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });
const compact = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 });
const monthNames = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];

export const formatRub = (value: number | null) => (value === null ? "—" : `${rub.format(Math.round(value))} ₽`);

/** 12 400 000 → «12,4 млн ₽»; для подписей на графиках и фишках. */
export function formatMoneyShort(value: number | null) {
  if (value === null) return "—";
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${compact.format(value / 1_000_000)} млн ₽`;
  if (abs >= 1_000) return `${compact.format(value / 1_000)} тыс. ₽`;
  return `${rub.format(value)} ₽`;
}

/** Месяц программы → «М7 · июл» и год от старта. */
export function formatMonth(month: number, calendarMonth: number) {
  return `М${month} · ${monthNames[(calendarMonth - 1 + 12) % 12]}`;
}

export const yearOf = (month: number) => Math.floor(Math.max(month - 1, 0) / 12) + 1;

export const scenarioTitles: Record<string, string> = {
  pessimistic: "Пессимистичный",
  realistic: "Реалистичный",
  optimistic: "Оптимистичный",
};
