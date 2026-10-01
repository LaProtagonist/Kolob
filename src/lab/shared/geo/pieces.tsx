/**
 * Силуэты для карт лаборатории: достопримечательности и домики точек сети.
 *
 * Форма общая, цвет задаёт вариант: у частей рисунка только классы (lm-*, pt-*), а заливку
 * и обводку пишет стиль варианта. Начало координат — середина основания, вверх идёт минус y,
 * высота силуэта около 100 единиц. Вариант сам решает, во сколько раз увеличить силуэт на карте.
 */
import type { ReactElement } from "react";
import type { LandmarkKind } from "./geo";

const columns = (from: number, to: number, step: number, top: number, bottom: number, width = 2.2) => {
  const parts: string[] = [];
  for (let x = from; x <= to + 0.01; x += step) parts.push(`M${x - width / 2} ${top}h${width}V${bottom}h${-width}Z`);
  return parts.join("");
};
const windows = (from: number, to: number, step: number, y: number, width = 4, height = 6) => {
  const parts: string[] = [];
  for (let x = from; x <= to + 0.01; x += step) parts.push(`M${x - width / 2} ${y}h${width}v${height}h${-width}Z`);
  return parts.join("");
};
const onion = (x: number, y: number, size: number) =>
  `M${x - size * 0.55} ${y}C${x - size * 0.95} ${y - size * 0.45} ${x - size * 0.55} ${y - size * 0.95} ${x} ${y - size * 1.35}C${x + size * 0.55} ${y - size * 0.95} ${x + size * 0.95} ${y - size * 0.45} ${x + size * 0.55} ${y}Z`;

function Palace() {
  return (
    <>
      <path className="lm-wall" d="M-92 0V-36H92V0Z" />
      <path className="lm-wall-side" d="M-24 -36V-44H24V-36Z" />
      <path className="lm-white" d={columns(-86, 86, 7.2, -34, -4)} />
      <path className="lm-window" d={windows(-82, 82, 14.4, -30) + windows(-82, 82, 14.4, -16)} />
      <path className="lm-roof" d="M-95 -36h190v-5h-190Z" />
      <path className="lm-gold" d={windows(-88, 88, 8, -48, 2.4, 7)} />
    </>
  );
}

function Column() {
  return (
    <>
      <path className="lm-stone" d="M-11 0V-14H11V0Z" />
      <path className="lm-accent" d="M-4.5 -14L-3.6 -108H3.6L4.5 -14Z" />
      <path className="lm-stone" d="M-7 -108h14v-6h-14Z" />
      <path className="lm-gold" d="M-3 -114h6v-8h-6Z M0 -122l-7 4 7 -14 7 14Z M-1 -132h2v-8h-2Z M-4 -137h8v2h-8Z" />
    </>
  );
}

function Spire() {
  return (
    <>
      <path className="lm-wall" d="M-84 0V-28H84V0Z" />
      <path className="lm-roof" d="M-86 -28h172v-4h-172Z" />
      <path className="lm-window" d={windows(-78, -26, 10.4, -22) + windows(26, 78, 10.4, -22)} />
      <path className="lm-wall" d="M-17 -32V-66H17V-32Z" />
      <path className="lm-white" d={columns(-13, 13, 6.5, -62, -34)} />
      <path className="lm-wall-side" d="M-11 -66V-78H11V-66Z" />
      <path className="lm-gold" d="M-11 -78h22l-11 -6Z M-3.4 -84L0 -158L3.4 -84Z M-4 -160h8l-4 -4Z" />
      <path className="lm-door" d="M-7 0v-14a7 7 0 0 1 14 0v14Z" />
    </>
  );
}

function Dome() {
  return (
    <>
      <path className="lm-stone" d="M-62 0V-40H62V0Z" />
      <path className="lm-stone-dark" d="M-40 -40L0 -56L40 -40Z" />
      <path className="lm-white" d={columns(-34, 34, 8.5, -38, -2, 3)} />
      <path className="lm-stone" d="M-27 -42V-78H27V-42Z" />
      <path className="lm-white" d={columns(-23, 23, 6.6, -76, -44, 2)} />
      <path className="lm-gold" d="M-31 -78C-31 -104 -14 -114 0 -114C14 -114 31 -104 31 -78Z M-5 -114h10v-10h-10Z M-1 -124h2v-10h-2Z M-4 -130h8v2h-8Z" />
      <path className="lm-gold" d="M-58 -40c0-10 12-10 12 0Z M46 -40c0-10 12-10 12 0Z" />
    </>
  );
}

function Colonnade() {
  return (
    <>
      <path className="lm-stone" d="M-96 0Q0 -26 96 0V-20Q0 -46 -96 -20Z" />
      <path className="lm-white" d={columns(-90, 90, 9, -40, -6, 2.6)} />
      <path className="lm-stone" d="M-24 -18V-52H24V-18Z" />
      <path className="lm-stone-dark" d="M-24 -52C-24 -70 -10 -76 0 -76C10 -76 24 -70 24 -52Z" />
      <path className="lm-gold" d="M-2 -76h4v-12h-4Z M-6 -84h12v2h-12Z" />
    </>
  );
}

function Fortress() {
  return (
    <>
      <path className="lm-stone" d="M-90 0V-14L-78 -20L-66 -14H-30L-18 -20L-6 -14H40L52 -20L64 -14H90V0Z" />
      <path className="lm-wall" d="M-16 -14V-46H30V-14Z" />
      <path className="lm-roof" d="M-18 -46h50v-4h-50Z" />
      <path className="lm-window" d={windows(-10, 24, 8.5, -38, 3.6, 8)} />
      <path className="lm-wall" d="M-14 -50V-86H2V-50Z" />
      <path className="lm-wall-side" d="M-12 -86V-98H0V-86Z" />
      <path className="lm-gold" d="M-6 -98L-6 -198L-4 -198L0 -98Z M-14 -98h16l-8 -6Z M-8 -200h6v-6h-6Z" />
    </>
  );
}

function Rostral() {
  const one = (x: number) => (
    <g transform={`translate(${x} 0)`}>
      <path className="lm-stone" d="M-11 0V-12H11V0Z" />
      <path className="lm-accent" d="M-5 -12L-4.2 -86H4.2L5 -12Z" />
      <path className="lm-accent-dark" d="M-4.5 -30l-9 -4 9 -3Z M4.5 -30l9 -4 -9 -3Z M-4.3 -50l-9 -4 9 -3Z M4.3 -50l9 -4 -9 -3Z M-4.2 -70l-9 -4 9 -3Z M4.2 -70l9 -4 -9 -3Z" />
      <path className="lm-stone" d="M-8 -86h16v-5h-16Z" />
      <path className="lm-flame" d="M-6 -91C-6 -100 -2 -103 0 -110C2 -103 6 -100 6 -91Z" />
    </g>
  );
  return (
    <>
      {one(-26)}
      {one(26)}
    </>
  );
}

function Onion() {
  return (
    <>
      <path className="lm-wall" d="M-46 0V-38H46V0Z" />
      <path className="lm-white" d="M-46 -38h92v-3h-92Z M-46 -20h92v-2h-92Z" />
      <path className="lm-window" d={windows(-38, 38, 12.6, -32, 4, 8)} />
      <path className="lm-wall" d="M-12 -41L-7 -84H7L12 -41Z" />
      <path className="lm-gold" d={onion(0, -84, 10)} />
      <path className="lm-accent" d={onion(-30, -41, 9)} />
      <path className="lm-accent-2" d={onion(30, -41, 9)} />
      <path className="lm-accent-3" d={onion(-16, -54, 8)} />
      <path className="lm-accent" d={onion(17, -54, 8)} />
      <path className="lm-gold" d="M-1 -98h2v-10h-2Z M-4 -104h8v2h-8Z M-31 -53h2v-7h-2Z M29 -53h2v-7h-2Z" />
    </>
  );
}

function Castle() {
  return (
    <>
      <path className="lm-accent" d="M-58 0V-40H58V0Z" />
      <path className="lm-roof" d="M-60 -40h120v-5h-120Z" />
      <path className="lm-window" d={windows(-50, 50, 12.5, -33, 4, 7) + windows(-50, 50, 12.5, -18, 4, 7)} />
      <path className="lm-white" d="M-14 0V-36H14V0Z" />
      <path className="lm-accent" d="M-9 -45V-62H9V-45Z" />
      <path className="lm-gold" d="M-9 -62h18l-9 -6Z M-2.6 -68L0 -118L2.6 -68Z" />
    </>
  );
}

function Station() {
  return (
    <>
      <path className="lm-wall" d="M-74 0V-30H74V0Z" />
      <path className="lm-roof" d="M-76 -30h152v-4h-152Z" />
      <path className="lm-window" d="M-66 -20a4 4 0 0 1 8 0v10h-8Z M-50 -20a4 4 0 0 1 8 0v10h-8Z M-34 -20a4 4 0 0 1 8 0v10h-8Z M26 -20a4 4 0 0 1 8 0v10h-8Z M42 -20a4 4 0 0 1 8 0v10h-8Z M58 -20a4 4 0 0 1 8 0v10h-8Z" />
      <path className="lm-wall" d="M-15 -34V-66H15V-34Z" />
      <path className="lm-white" d="M-9 -50a9 9 0 1 0 18 0a9 9 0 1 0 -18 0Z" />
      <path className="lm-window" d="M-0.8 -57h1.6v7h-1.6Z M0 -50.8l5 0v1.6l-5 0Z" />
      <path className="lm-roof" d="M-17 -66h34l-17 -12Z" />
      <path className="lm-gold" d="M-1 -78h2v-10h-2Z" />
      <path className="lm-door" d="M-10 0v-16a10 10 0 0 1 20 0v16Z" />
    </>
  );
}

function Theatre() {
  return (
    <>
      <path className="lm-accent" d="M-64 0V-32H64V0Z" />
      <path className="lm-accent" d="M-28 -32V-46H28V-32Z" />
      <path className="lm-roof" d="M-66 -32h132v-4h-132Z M-30 -46h60v-4h-60Z" />
      <path className="lm-white" d={columns(-56, 56, 9.3, -28, -4, 2.4)} />
      <path className="lm-window" d={windows(-22, 22, 8.8, -42, 3.4, 5)} />
      <path className="lm-gold" d="M-1 -50h2v-14h-2Z" />
      <path className="lm-flag" d="M1 -64h12l-3 4 3 4h-12Z" />
    </>
  );
}

function Baroque() {
  return (
    <>
      <path className="lm-accent" d="M-44 0V-40H44V0Z" />
      <path className="lm-white" d={columns(-40, 40, 10, -38, -2, 2.4)} />
      <path className="lm-accent" d="M-13 -40V-70H13V-40Z" />
      <path className="lm-white" d={columns(-10, 10, 5, -68, -42, 1.6)} />
      <path className="lm-accent" d="M-15 -70C-15 -88 -6 -96 0 -98C6 -96 15 -88 15 -70Z" />
      <path className="lm-gold" d={onion(0, -98, 5)} />
      <path className="lm-gold" d="M-1 -104h2v-10h-2Z M-4 -110h8v2h-8Z" />
      <path className="lm-accent" d="M-40 -40V-54H-28V-40Z M28 -40V-54H40V-40Z" />
      <path className="lm-gold" d={onion(-34, -54, 4.6) + onion(34, -54, 4.6)} />
    </>
  );
}

function Ship() {
  return (
    <>
      <path className="lm-hull" d="M-78 -2L74 -2L66 -18L-70 -18Z" />
      <path className="lm-accent" d="M-77 -2L74 -2L72 2L-74 2Z" />
      <path className="lm-stone" d="M-44 -18V-26H40V-18Z M-14 -26V-32H18V-26Z" />
      <path className="lm-stone-dark" d="M-28 -26V-52H-20V-26Z M-6 -32V-56H2V-32Z M14 -26V-52H22V-26Z" />
      <path className="lm-hull" d="M-28 -52h8v-3h-8Z M-6 -56h8v-3h-8Z M14 -52h8v-3h-8Z" />
      <path className="lm-mast" d="M-52 -18V-70h2V-18Z M48 -18V-66h2V-18Z M-51 -66L49 -62v1.6L-51 -64.4Z" />
      <path className="lm-flag" d="M-50 -70h12l-3 3 3 3h-12Z" />
    </>
  );
}

const shapes: Record<LandmarkKind, () => ReactElement> = {
  palace: Palace,
  column: Column,
  spire: Spire,
  dome: Dome,
  colonnade: Colonnade,
  fortress: Fortress,
  rostral: Rostral,
  onion: Onion,
  castle: Castle,
  station: Station,
  theatre: Theatre,
  baroque: Baroque,
  ship: Ship,
};

/** Силуэт достопримечательности; цвет частей задаёт стиль варианта по data-kind. */
export function LandmarkShape({ kind }: { kind: LandmarkKind }) {
  const Shape = shapes[kind];
  return (
    <g className="lm" data-kind={kind}>
      <Shape />
    </g>
  );
}

export type PointLook = "base" | "hall" | "kiosk";

/**
 * Домик точки сети: цех с трубой (первая точка с производством), дом с залом под шатровой крышей
 * или киоск «на вынос» под козырьком. На вывеске — колобок.
 */
export function PointHouse({ look }: { look: PointLook }) {
  return (
    <g className="pt" data-look={look}>
      {look === "base" ? (
        <>
          <path className="pt-wall" d="M-34 0V-34H34V0Z" />
          <path className="pt-roof" d="M-38 -34L-22 -50L-6 -34L10 -50L26 -34H38V-30H-38Z" />
          <path className="pt-chimney" d="M18 -44V-72H28V-38Z" />
          <path className="pt-window" d="M-26 -26h12v9h-12Z M14 -26h12v9h-12Z" />
        </>
      ) : look === "hall" ? (
        <>
          <path className="pt-wall" d="M-28 0V-30H28V0Z" />
          <path className="pt-roof" d="M-34 -28L0 -56L34 -28Z" />
          <path className="pt-awning" d="M-28 -18h56l-4 7h-48Z" />
          <path className="pt-window" d="M-22 -10h10v8h-10Z M12 -10h10v8h-10Z" />
        </>
      ) : (
        <>
          <path className="pt-wall" d="M-20 0V-26H20V0Z" />
          <path className="pt-awning" d="M-26 -26H26L20 -36H-20Z" />
          <path className="pt-window" d="M-15 -20h30v9h-30Z" />
        </>
      )}
      <path className="pt-door" d={look === "kiosk" ? "M-5 0v-9h10v9Z" : "M-6 0v-14h12v14Z"} />
      <g className="pt-sign" transform={`translate(0 ${look === "base" ? -42 : look === "hall" ? -38 : -44})`}>
        <circle className="pt-sign-face" r="7.5" />
        <path className="pt-sign-eyes" d="M-3.4 -2.2a1.3 1.3 0 1 0 2.6 0a1.3 1.3 0 1 0 -2.6 0Z M0.8 -2.2a1.3 1.3 0 1 0 2.6 0a1.3 1.3 0 1 0 -2.6 0Z" />
        <path className="pt-sign-smile" d="M-3.6 1.4Q0 5 3.6 1.4" />
      </g>
    </g>
  );
}

/** Стройка: забор, леса и кран — точка откроется через несколько месяцев. */
export function PointSite() {
  return (
    <g className="pt-site">
      <path className="pt-site-fence" d="M-30 0V-10H30V0Z" />
      <path className="pt-site-frame" d="M-20 -10V-38H20V-10 M-20 -24H20 M-20 -38L20 -10 M20 -38L-20 -10" />
      <path className="pt-site-crane" d="M24 -10V-62h3V-10Z M-14 -62H44v3H-14Z M-8 -59v14" />
      <path className="pt-site-hook" d="M-11 -45h6v5h-6Z" />
    </g>
  );
}

/** Место под будущую точку: пунктирный контур дома. */
export function PointLot() {
  return <path className="pt-lot" d="M-24 0V-24L0 -42L24 -24V0Z" />;
}

// --- Дома кварталов, жизнь города и места под новые точки ------------------------------------

/**
 * Дом квартала в виде фасада: 0 — длинный доходный дом с карнизом, 1 — дом со скатной крышей,
 * 2 — дом с башенкой. Части отдаются строками путей, чтобы вариант мог склеить сотни домов
 * в несколько путей по цвету: так город рисуется быстро.
 */
export function houseParts(kind: 0 | 1 | 2, x: number, y: number, size: number) {
  const r = (value: number) => Math.round(value * 10) / 10;
  const box = (x0: number, y0: number, w: number, h: number) => `M${r(x + x0 * size)} ${r(y + y0 * size)}h${r(w * size)}v${r(h * size)}h${r(-w * size)}Z`;
  const windows = (x0: number, y0: number, columns: number, rows: number, stepX: number, stepY: number) => {
    let path = "";
    for (let row = 0; row < rows; row += 1) for (let column = 0; column < columns; column += 1) path += box(x0 + column * stepX, y0 + row * stepY, 4, 5);
    return path;
  };
  if (kind === 0) {
    return { body: box(-36, -30, 72, 30), roof: box(-38, -34, 76, 5), windows: windows(-30, -25, 6, 3, 10.6, 8.2) };
  }
  if (kind === 1) {
    return {
      body: box(-22, -24, 44, 24),
      roof: `M${r(x - 26 * size)} ${r(y - 24 * size)}L${r(x)} ${r(y - 42 * size)}L${r(x + 26 * size)} ${r(y - 24 * size)}Z`,
      windows: windows(-16, -19, 4, 2, 9.2, 9),
    };
  }
  return {
    body: box(-18, -36, 36, 36),
    roof: `${box(-6, -48, 12, 12)}M${r(x - 9 * size)} ${r(y - 48 * size)}L${r(x)} ${r(y - 62 * size)}L${r(x + 9 * size)} ${r(y - 48 * size)}Z`,
    windows: windows(-13, -31, 3, 3, 10, 9.5),
  };
}

/** Фургон, который везёт заготовки из цеха на точки. */
export function Van() {
  return (
    <g className="lf-van">
      <path className="lf-van-body" d="M-14 -11h20v11h-20Z M6 -8h6l3 4v4h-9Z" />
      <path className="lf-van-window" d="M8 -7h3l2 3h-5Z" />
      <path className="lf-van-wheel" d="M-11 0a2.6 2.6 0 1 0 5.2 0a2.6 2.6 0 1 0 -5.2 0Z M5 0a2.6 2.6 0 1 0 5.2 0a2.6 2.6 0 1 0 -5.2 0Z" />
      <path className="lf-van-logo" d="M-7 -5.5a2.6 2.6 0 1 0 5.2 0a2.6 2.6 0 1 0 -5.2 0Z" />
    </g>
  );
}

/** Монета выручки. */
export function Coin() {
  return (
    <g className="lf-coin">
      <path className="lf-coin-face" d="M-6 0a6 6 0 1 0 12 0a6 6 0 1 0 -12 0Z" />
      <path className="lf-coin-mark" d="M-1.6 -3.4h3a2 2 0 0 1 0 4h-3Z M-1.6 -3.4v7 M-3 2.2h4.4" />
    </g>
  );
}

/** Прохожий: голова и туловище; tone меняет цвет куртки. */
export function Walker({ tone }: { tone: number }) {
  return (
    <g className={`lf-walker is-t${tone % 4}`}>
      <path className="lf-walker-body" d="M-3.4 0v-8a3.4 3.4 0 0 1 6.8 0v8Z" />
      <path className="lf-walker-head" d="M-2.6 -13.5a2.6 2.6 0 1 0 5.2 0a2.6 2.6 0 1 0 -5.2 0Z" />
    </g>
  );
}

/** Сотрудник смены в фирменном колпаке. */
export function Cook() {
  return (
    <g className="lf-cook">
      <path className="lf-cook-body" d="M-3.4 0v-8a3.4 3.4 0 0 1 6.8 0v8Z" />
      <path className="lf-cook-head" d="M-2.6 -13.5a2.6 2.6 0 1 0 5.2 0a2.6 2.6 0 1 0 -5.2 0Z" />
      <path className="lf-cook-cap" d="M-3 -16.5h6v-3.4a2 2 0 0 0 -2 -1.6h-2a2 2 0 0 0 -2 1.6Z" />
    </g>
  );
}

/**
 * Кольцо стройки: доля прошедших месяцев из срока до открытия и сколько месяцев осталось.
 * share от 0 до 1.
 */
export function BuildTimer({ share, left }: { share: number; left: number }) {
  const radius = 13;
  const length = 2 * Math.PI * radius;
  return (
    <g className="lf-timer">
      <circle className="lf-timer-track" r={radius} />
      <circle className="lf-timer-done" r={radius} strokeDasharray={`${(length * Math.max(0.04, Math.min(1, share))).toFixed(1)} ${length.toFixed(1)}`} transform="rotate(-90)" />
      <text className="lf-timer-text" y="4" textAnchor="middle">{left}</text>
    </g>
  );
}

/** Место под новую точку в своей игре: круг с плюсом. */
export function LotMarker() {
  return (
    <g className="lf-lot">
      <path className="lf-lot-ring" d="M-16 0a16 16 0 1 0 32 0a16 16 0 1 0 -32 0Z" />
      <path className="lf-lot-plus" d="M-2 -9h4v7h7v4h-7v7h-4v-7h-7v-4h7Z" />
    </g>
  );
}
