/** Shared Control presentation only; calculations retain full numeric precision. */
export const formatNumber = (value: number | null | undefined, digits = 2) =>
  value == null || !Number.isFinite(value)
    ? "Не рассчитано"
    : new Intl.NumberFormat("ru-RU", { maximumFractionDigits: digits }).format(
        value,
      );
export const formatMoney = (value: number | null | undefined, digits = 0) =>
  value == null || !Number.isFinite(value)
    ? "Не рассчитано"
    : `${new Intl.NumberFormat("ru-RU", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value)} ₽`;
export const formatPercent = (value: number | null | undefined) =>
  value == null || !Number.isFinite(value)
    ? "Не рассчитано"
    : `${formatNumber(value * 100)} %`;
export function formatHeadline(
  value: number | null | undefined,
  monthly = false,
  approximate = false,
) {
  if (value == null || !Number.isFinite(value)) return "Недостаточно данных";
  const abs = Math.abs(value),
    text =
      abs >= 1e6
        ? `${formatNumber(value / 1e6)} млн ₽`
        : abs >= 1e3
          ? `${formatNumber(value / 1e3)} тыс. ₽`
          : formatMoney(value);
  return `${approximate ? "≈" : ""}${text}${monthly ? " / мес." : ""}`;
}
export type ParsedNumber =
  { kind: "value"; value: number } | { kind: "empty" } | { kind: "invalid" };
export function parseControlNumber(text: string): ParsedNumber {
  const trimmed = text.trim();
  if (!trimmed) return { kind: "empty" };
  // Group separators may be regular, nonbreaking or narrow nonbreaking spaces.
  const normalized = trimmed.replace(/[\s\u00a0\u202f]/g, "").replace(",", ".");
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalized))
    return { kind: "invalid" };
  const value = Number(normalized);
  return Number.isFinite(value)
    ? { kind: "value", value }
    : { kind: "invalid" };
}
export function formatInput(value: number | null, digits = 2) {
  return value === null ? "" : formatNumber(value, digits);
}
