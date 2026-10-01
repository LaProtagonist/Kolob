/**
 * Нарисованные кодом детали игры: домики, колобок-фишка, флажок, значки кассы и карточек.
 * Каждая деталь лежит в группе с классом toy-piece — её цвета одинаковы в светлой и тёмной теме.
 */
export type HouseKind = "base" | "seating" | "takeaway";

/** Домик-фишка. Начало координат — середина основания. */
export function House({ kind }: { kind: HouseKind }) {
  if (kind === "base") {
    return (
      <g className="toy-piece toy-house is-base">
        <ellipse className="toy-piece-shadow" cx="0" cy="1" rx="31" ry="7" />
        <g className="toy-house-smoke">
          <circle cx="16" cy="-62" r="4" />
          <circle cx="21" cy="-71" r="5.5" />
        </g>
        <rect className="toy-house-chimney" x="11" y="-58" width="10" height="20" rx="3" />
        <rect className="toy-house-body" x="-26" y="-32" width="52" height="32" rx="7" />
        <rect className="toy-house-window" x="-20" y="-23" width="10" height="10" rx="3" />
        <rect className="toy-house-window" x="10" y="-23" width="10" height="10" rx="3" />
        <rect className="toy-house-door" x="-7" y="-19" width="14" height="19" rx="5" />
        <path className="toy-house-roof" d="M-30 -31 L0 -53 L30 -31 Z" />
        <circle className="toy-house-sign" cx="0" cy="-39" r="5.5" />
      </g>
    );
  }
  if (kind === "seating") {
    return (
      <g className="toy-piece toy-house is-seating">
        <ellipse className="toy-piece-shadow" cx="0" cy="1" rx="26" ry="6" />
        <rect className="toy-house-body" x="-21" y="-29" width="42" height="29" rx="6" />
        <path className="toy-house-window" d="M-21 -29 H21 V-24 A7 7 0 0 1 7 -24 A7 7 0 0 1 -7 -24 A7 7 0 0 1 -21 -24 Z" />
        <rect className="toy-house-door" x="-6" y="-16" width="12" height="16" rx="4" />
        <path className="toy-house-roof" d="M-25 -29 L0 -48 L25 -29 Z" />
        <circle className="toy-house-sign" cx="0" cy="-36" r="4.5" />
      </g>
    );
  }
  return (
    <g className="toy-piece toy-house is-takeaway">
      <ellipse className="toy-piece-shadow" cx="0" cy="1" rx="23" ry="5.5" />
      <rect className="toy-house-body" x="-18" y="-25" width="36" height="25" rx="6" />
      <rect className="toy-house-window" x="-12" y="-20" width="24" height="11" rx="4" />
      <rect className="toy-house-door" x="-15" y="-10" width="30" height="4" rx="2" />
      <path className="toy-house-roof" d="M-22 -25 H22 L17 -36 H-17 Z" />
    </g>
  );
}

/** Место под домик, который ещё не поставлен: пунктир и подпись — месяц открытия или «+» для нового хода. */
export function HouseSlot({ label }: { label?: number | string }) {
  return (
    <g className="toy-slot">
      <path d="M-19 -2 V-27 L0 -43 L19 -27 V-2 Z" />
      {label === undefined ? null : <text y="-10">{label}</text>}
    </g>
  );
}

/** Стопка карточек рядом с домиком: формат, команда, гости, инвентарь. */
export function CardStack() {
  return (
    <g className="toy-piece toy-stack">
      <rect className="is-inventory" x="0" y="-22" width="15" height="22" rx="4" transform="rotate(42)" />
      <rect className="is-guests" x="0" y="-22" width="15" height="22" rx="4" transform="rotate(28)" />
      <rect className="is-team" x="0" y="-22" width="15" height="22" rx="4" transform="rotate(14)" />
      <rect className="is-format" x="0" y="-22" width="15" height="22" rx="4" />
    </g>
  );
}

/** Колобок — фишка текущего месяца. Начало координат — центр. */
export function Pawn() {
  return (
    <g className="toy-piece toy-pawn">
      <ellipse className="toy-piece-shadow" cx="0" cy="18" rx="17" ry="5" />
      <circle className="toy-pawn-body" r="20" />
      <path className="toy-pawn-shade" d="M14.1 -14.1 A20 20 0 0 1 -14.1 14.1 A27 27 0 0 0 14.1 -14.1 Z" />
      <circle className="toy-pawn-cheek" cx="-11" cy="4" r="3" />
      <circle className="toy-pawn-cheek" cx="11" cy="4" r="3" />
      <circle className="toy-pawn-eye" cx="-6" cy="-4" r="2.6" />
      <circle className="toy-pawn-eye" cx="6" cy="-4" r="2.6" />
      <path className="toy-pawn-smile" d="M-6 4 Q0 10 6 4" />
    </g>
  );
}

/** Флажок на клетке месяца, когда сеть вернула вложения. */
export function Flag() {
  return (
    <g className="toy-piece toy-flag">
      <rect className="toy-flag-tile" x="-21" y="-21" width="42" height="42" rx="11" />
      <path className="toy-flag-pole" d="M-8 13 V-13" />
      <path className="toy-flag-cloth" d="M-6.5 -13.5 H12 L7 -7.5 L12 -1.5 H-6.5 Z" />
    </g>
  );
}

const iconProps = { viewBox: "0 0 48 48", "aria-hidden": true, focusable: false } as const;

/** Пачка купюр: чем больше вложено, тем выше пачка (от 1 до 4). */
export function BanknotesIcon({ level }: { level: number }) {
  const count = Math.max(1, Math.min(4, Math.round(level * 4)));
  return (
    <svg {...iconProps}>
      <g className="toy-piece toy-notes">
        {Array.from({ length: count }, (_, index) => (
          <g key={index} transform={`translate(0 ${-index * 5})`}>
            <rect className="toy-notes-edge" x="5" y="27" width="38" height="17" rx="5" />
            <rect className="toy-notes-face" x="5" y="24" width="38" height="17" rx="5" />
            <circle className="toy-notes-mark" cx="24" cy="32.5" r="4.5" />
          </g>
        ))}
      </g>
    </svg>
  );
}

/** Столбик монет: высота следует за выручкой месяца (от 1 до 5 монет). */
export function CoinsIcon({ level }: { level: number }) {
  const count = Math.max(1, Math.min(5, Math.round(level * 5)));
  return (
    <svg {...iconProps}>
      <g className="toy-piece toy-coins">
        {Array.from({ length: count }, (_, index) => (
          <g key={index} transform={`translate(0 ${-index * 6})`}>
            <rect className="toy-coins-edge" x="9" y="34" width="30" height="6" />
            <ellipse className="toy-coins-edge" cx="24" cy="40" rx="15" ry="5.5" />
            <ellipse className="toy-coins-face" cx="24" cy="34" rx="15" ry="5.5" />
          </g>
        ))}
      </g>
    </svg>
  );
}

/** Копилка-сундук: пока сеть в минусе — закрыт, когда вложения вернулись — с монетами. */
export function ChestIcon({ open }: { open: boolean }) {
  return (
    <svg {...iconProps}>
      <g className={`toy-piece toy-chest${open ? " is-open" : ""}`}>
        {open ? (
          <>
            <ellipse className="toy-chest-coin" cx="17" cy="17" rx="7" ry="6" />
            <ellipse className="toy-chest-coin" cx="30" cy="16" rx="7" ry="6" />
            <ellipse className="toy-chest-coin" cx="24" cy="12" rx="7" ry="6" />
          </>
        ) : (
          <path className="toy-chest-lid" d="M6 22 C6 12 14 8 24 8 C34 8 42 12 42 22 Z" />
        )}
        <rect className="toy-chest-body" x="6" y="20" width="36" height="22" rx="6" />
        <rect className="toy-chest-band" x="6" y="20" width="36" height="6" rx="3" />
        <rect className="toy-chest-lock" x="20" y="22" width="8" height="10" rx="3" />
      </g>
    </svg>
  );
}

/** Человечек-фишка: один сотрудник в роли. */
export function Meeple({ tone }: { tone: number }) {
  return (
    <svg className="toy-meeple" viewBox="0 0 14 18" aria-hidden focusable={false}>
      <g className={`toy-piece is-tone-${tone % 4}`}>
        <circle cx="7" cy="4.5" r="4" />
        <path d="M1 17 C1 10.5 3.5 9 7 9 C10.5 9 13 10.5 13 17 C13 17.6 12.6 18 12 18 H2 C1.4 18 1 17.6 1 17 Z" />
      </g>
    </svg>
  );
}
