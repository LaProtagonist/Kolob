import { useEffect, useState } from "react";

const integerFormatter = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });
const decimalFormatter = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 });

/** Presentation-only numeric formatting. Values remain numeric in runtime state. */
export function formatNumber(value: number, integer = false) {
  return (integer ? integerFormatter : decimalFormatter)
    .format(integer ? Math.round(value) : value)
    .replace(/[\u00a0\u202f]/g, " ");
}

function parseNumber(value: string, integer: boolean) {
  const normalized = value.replace(/[\s\u00a0\u202f]/g, "").replace(",", ".");
  if (normalized === "") return null;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return integer ? Math.floor(parsed) : parsed;
}

export function FormattedNumberInput({
  value,
  onChange,
  ariaLabel,
  testId,
  disabled = false,
  integer = false,
}: {
  value: number | null;
  onChange: (value: number | null) => void;
  ariaLabel: string;
  testId?: string;
  disabled?: boolean;
  integer?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState(value === null ? "" : String(value));

  useEffect(() => {
    if (!focused) setDraft(value === null ? "" : String(value));
  }, [focused, value]);

  const visibleValue = focused
    ? draft
    : value === null
      ? ""
      : formatNumber(value, integer);

  return (
    <input
      aria-label={ariaLabel}
      data-testid={testId}
      disabled={disabled}
      inputMode={integer ? "numeric" : "decimal"}
      min="0"
      type="text"
      value={visibleValue}
      onFocus={(event) => {
        setFocused(true);
        const rawValue = value === null ? "" : String(value);
        setDraft(rawValue);
        // A formatted monetary value should be easy to replace as a whole;
        // otherwise a browser can append a new figure to the spaced display.
        event.currentTarget.value = rawValue;
        event.currentTarget.select();
      }}
      onChange={(event) => {
        const nextDraft = event.target.value;
        setDraft(nextDraft);
        if (nextDraft.trim() === "") {
          onChange(null);
          return;
        }
        const parsed = parseNumber(nextDraft, integer);
        if (parsed !== null) onChange(parsed);
      }}
      onBlur={(event) => {
        setFocused(false);
        const parsed = parseNumber(event.target.value, integer);
        if (event.target.value.trim() === "") onChange(null);
        else if (parsed !== null) onChange(parsed);
      }}
    />
  );
}
