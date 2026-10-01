/**
 * Рисунок города и точек сети: всё собирается из простых фигур SVG.
 * Город (вода, кварталы, дома, знакомые здания) строится один раз на расклад точек и не зависит от месяца;
 * от месяца зависят только сами точки — стройплощадка или открытое здание.
 */
import { memo, useEffect, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import type { StoryPoint } from "../../story";
import {
  at,
  blockKind,
  box,
  CANAL_COL,
  heightLimit,
  inFrame,
  isLand,
  isQuay,
  LIGOVSKY_COL,
  mod,
  NEVA,
  NEVA_BRIDGE_COL,
  NEVSKY_ROW,
  noise,
  panesLeft,
  panesRight,
  roofFlat,
  screenX,
  screenY,
  shadowOf,
  shape,
  visibleCells,
  wallLeft,
  wallRight,
  type Camera,
  type Cell,
} from "./city";

/** Предмет сцены с местом в очереди рисования: дальние ряды рисуются раньше ближних. */
export type SceneItem = { order: number; key: string; node: ReactNode };

export const orderOf = (cell: Cell) => cell.j * 100 + cell.i;

const line = (from: string, to: string) => `M${from}L${to}`;

function Tree({ gx, gy, size = 1 }: { gx: number; gy: number; size?: number }) {
  const x = screenX(gx, gy);
  const y = screenY(gx, gy, 2);
  return (
    <g className="iso-tree">
      <ellipse className="iso-shadow" cx={x + 3 * size} cy={y} rx={6.5 * size} ry={2.8 * size} />
      <rect className="iso-tree-trunk" x={x - 1.1} y={y - 7 * size} width="2.2" height={7 * size} />
      <circle className="iso-tree-crown" cx={x} cy={y - 12.5 * size} r={7.2 * size} />
      <circle className="iso-tree-light" cx={x - 2 * size} cy={y - 14.5 * size} r={3.8 * size} />
    </g>
  );
}

/** Шпиль: тонкий золотой клин от основания на высоте z0 до вершины z1. */
function spire(gx: number, gy: number, z0: number, z1: number, half: number) {
  const x = screenX(gx, gy);
  return `M${x - half} ${screenY(gx, gy, z0)}L${x} ${screenY(gx, gy, z1)}L${x + half} ${screenY(gx, gy, z0)}Z`;
}

/** Адмиралтейство: длинный жёлтый корпус, башня и золотой шпиль. */
function admiralty(a: number, b: number) {
  const wing = box(a + 0.1, b + 0.5, a + 1.9, b + 1.5, 2, 17);
  const tower = box(a + 0.76, b + 0.76, a + 1.24, b + 1.24, 17, 33);
  const lantern = box(a + 0.88, b + 0.88, a + 1.12, b + 1.12, 33, 43);
  return (
    <g key="admiralty" className="iso-landmark">
      <path className="iso-lm-wall-l" d={wing.left} />
      <path className="iso-lm-wall-r" d={wing.right} />
      <path className="iso-lm-roof" d={wing.top} />
      <path className="iso-lm-trim" d={panesLeft(a + 0.14, a + 1.86, b + 1.5, 4, 15, 10, 1)} />
      <path className="iso-lm-wall-l" d={tower.left} />
      <path className="iso-lm-wall-r" d={tower.right} />
      <path className="iso-lm-roof" d={tower.top} />
      <path className="iso-lm-trim" d={wallLeft(a + 0.9, a + 1.1, b + 1.24, 17, 28)} />
      <path className="iso-lm-trim" d={lantern.left + lantern.right} />
      <path className="iso-lm-roof" d={lantern.top} />
      <path className="iso-gold" d={spire(a + 1, b + 1, 43, 92, 3.4)} />
      <circle className="iso-gold" cx={screenX(a + 1, b + 1)} cy={screenY(a + 1, b + 1, 93)} r="1.8" />
    </g>
  );
}

/** Исаакиевский собор: гранитный объём, барабан и золотой купол. */
function isaac(a: number, b: number) {
  const body = box(a + 0.28, b + 0.28, a + 1.72, b + 1.72, 2, 21);
  const x = screenX(a + 1, b + 1);
  const y = screenY(a + 1, b + 1, 21);
  return (
    <g key="isaac" className="iso-landmark">
      <path className="iso-stone-l" d={body.left} />
      <path className="iso-stone-r" d={body.right} />
      <path className="iso-stone-t" d={body.top} />
      <path className="iso-lm-trim" d={panesLeft(a + 0.5, a + 1.5, b + 1.72, 3, 19, 7, 1) + panesRight(b + 0.5, b + 1.5, a + 1.72, 3, 19, 7, 1)} />
      <path className="iso-stone-r" d={`M${x - 12} ${y - 13}V${y}A12 6 0 0 0 ${x + 12} ${y}V${y - 13}Z`} />
      <path className="iso-lm-trim" d={[-8, -4, 0, 4, 8].map((dx) => `M${x + dx - 0.9} ${y - 11}h1.8v${12.5 - Math.abs(dx) * 0.12}h-1.8z`).join("")} />
      <path className="iso-gold" d={`M${x - 12.5} ${y - 13}A12.5 15 0 0 1 ${x + 12.5} ${y - 13}A12.5 5 0 0 1 ${x - 12.5} ${y - 13}Z`} />
      <path className="iso-gold-light" d={`M${x - 8.5} ${y - 16}A9 11 0 0 1 ${x - 2} ${y - 26}A14 14 0 0 0 ${x - 8.5} ${y - 16}Z`} />
      <rect className="iso-stone-t" x={x - 2} y={y - 34} width="4" height="7" />
      <path className="iso-gold" d={`M${x - 2.6} ${y - 34}L${x} ${y - 41}L${x + 2.6} ${y - 34}Z`} />
      {[[0.42, 1.58], [1.58, 1.58], [1.58, 0.42]].map(([dx, dy]) => (
        <circle key={`${dx}-${dy}`} className="iso-gold" cx={screenX(a + dx, b + dy)} cy={screenY(a + dx, b + dy, 24)} r="3.2" />
      ))}
    </g>
  );
}

/** Петропавловская крепость на своём острове посреди Невы. */
function fortress() {
  const walls = box(6.2, -2.3, 7.9, -1.0, 0, 5);
  const church = box(6.85, -1.95, 7.3, -1.5, 5, 16);
  const tower = box(6.98, -1.82, 7.17, -1.63, 16, 30);
  return (
    <g key="fortress" className="iso-landmark">
      <path className="iso-brick-l" d={walls.left} />
      <path className="iso-brick-r" d={walls.right} />
      <path className="iso-fort-yard" d={walls.top} />
      <path className="iso-lm-wall-l" d={church.left + tower.left} />
      <path className="iso-lm-wall-r" d={church.right + tower.right} />
      <path className="iso-lm-roof" d={church.top} />
      <path className="iso-gold" d={spire(7.075, -1.725, 30, 84, 2.8)} />
      <Tree gx={6.5} gy={-1.5} size={0.8} />
      <Tree gx={7.6} gy={-1.35} size={0.8} />
    </g>
  );
}

/**
 * Трамвай и машина на Невском стоят у остановки. Движущийся транспорт перерисовывал бы весь город на каждом кадре,
 * а дома его заслоняют, поэтому в верхний слой его не перенести.
 */
function traffic() {
  const tram = box(-0.42, 0.34, 0.42, 0.52, 1.5, 9.5);
  const car = box(-0.2, 0.66, 0.2, 0.8, 1, 5);
  const cabin = box(-0.1, 0.68, 0.12, 0.78, 5, 8);
  return (
    <g key="traffic" className="iso-traffic" transform={`translate(${screenX(8, NEVSKY_ROW)} ${screenY(8, NEVSKY_ROW)})`}>
      <g className="iso-tram">
        <path className="iso-tram-l" d={tram.left} />
        <path className="iso-tram-r" d={tram.right} />
        <path className="iso-tram-t" d={tram.top} />
        <path className="iso-tram-glass" d={panesLeft(-0.4, 0.4, 0.52, 4.5, 9, 5, 1)} />
      </g>
      <g className="iso-car" transform={`translate(${screenX(1.3, 0) - screenX(0, 0)} ${screenY(1.3, 0) - screenY(0, 0)})`}>
        <path className="iso-car-l" d={car.left + cabin.left} />
        <path className="iso-car-r" d={car.right + cabin.right} />
        <path className="iso-car-t" d={car.top + cabin.top} />
      </g>
    </g>
  );
}

/** Катер на Неве: перед ним ничего не стоит, поэтому он живёт в верхнем слое и не тревожит город. */
export function Boat() {
  const hull = box(-0.34, -0.08, 0.34, 0.08, 0, 3);
  const cabin = box(-0.16, -0.055, 0.14, 0.055, 3, 6.5);
  return (
    <g transform={`translate(${screenX(5.6, 0.9)} ${screenY(5.6, 0.9)})`}>
      <g className="iso-boat">
        <path className="iso-boat-wake" d={line(at(-0.95, 0), at(-0.42, 0))} />
        <path className="iso-boat-hull" d={hull.left + hull.right + hull.top} />
        <path className="iso-boat-cabin-l" d={cabin.left} />
        <path className="iso-boat-cabin-r" d={cabin.right + cabin.top} />
      </g>
    </g>
  );
}

/**
 * Город в кадре. Возвращает «землю» (воду, мостовые, подписи, тени) и предметы,
 * которые надо рисовать по очереди вместе с точками сети, чтобы ближние закрывали дальние.
 */
export function buildCity(camera: Camera, lots: Cell[]): { ground: ReactNode; items: SceneItem[] } {
  const range = visibleCells(camera);
  const gx0 = range.i0;
  const gx1 = range.i1 + 1;
  const gy1 = range.j1 + 1;
  const lotKeys = new Set(lots.map((lot) => `${lot.i},${lot.j}`));
  const slabTops: string[] = [];
  const slabSides: string[] = [];
  const lawns: string[] = [];
  const shadows: string[] = [];
  const items: SceneItem[] = [];

  for (let b = range.j0 - mod(range.j0, 3); b <= range.j1; b += 3) {
    if (!isLand(b) || !isLand(b + 1)) continue;
    for (let a = range.i0 - mod(range.i0, 3); a <= range.i1; a += 3) {
      if (!inFrame(camera, screenX(a + 1, b + 1), screenY(a + 1, b + 1), 110)) continue;
      const kind = blockKind(a, b);
      slabTops.push(roofFlat(a - 0.08, b - 0.08, a + 2.08, b + 2.08, 2));
      slabSides.push(wallLeft(a - 0.08, a + 2.08, b + 2.08, 0, 2), wallRight(b - 0.08, b + 2.08, a + 2.08, 0, 2));

      if (kind === "admiralty" || kind === "isaac") {
        lawns.push(roofFlat(a + 0.04, b + 0.04, a + 1.96, b + 1.96, 2));
        shadows.push(kind === "admiralty" ? shadowOf(a + 0.1, b + 0.5, a + 1.9, b + 1.5, 20) : shadowOf(a + 0.28, b + 0.28, a + 1.72, b + 1.72, 30));
        items.push({ order: (b + 1) * 100 + a + 1, key: kind, node: kind === "admiralty" ? admiralty(a, b) : isaac(a, b) });
        continue;
      }

      if (kind === "park") {
        lawns.push(roofFlat(a + 0.04, b + 0.04, a + 1.96, b + 1.96, 2));
        for (let row = 0; row < 3; row += 1) {
          for (let col = 0; col < 3; col += 1) {
            if (noise(a * 3 + col, b * 3 + row, 5) < 0.22) continue;
            const gx = a + 0.34 + col * 0.66 + (noise(a + col, b + row, 6) - 0.5) * 0.2;
            const gy = b + 0.34 + row * 0.66 + (noise(a + col, b + row, 7) - 0.5) * 0.2;
            items.push({
              order: Math.floor(gy) * 100 + Math.floor(gx) + gy - Math.floor(gy),
              key: `tree-${a}-${b}-${row}-${col}`,
              node: <Tree key={`tree-${a}-${b}-${row}-${col}`} gx={gx} gy={gy} size={0.85 + noise(a + col, b + row, 8) * 0.3} />,
            });
          }
        }
        continue;
      }

      const blockHeight = 20 + Math.floor(noise(a, b, 1) * 3) * 4;
      for (let dj = 0; dj < 2; dj += 1) {
        for (let di = 0; di < 2; di += 1) {
          const i = a + di;
          const j = b + dj;
          if (lotKeys.has(`${i},${j}`)) continue;
          if (isQuay(i, j)) {
            lawns.push(roofFlat(i + 0.12, dj === 0 ? j + 0.1 : j, i + 0.92, dj === 0 ? j + 1 : j + 0.9, 2));
            const gy = j + 0.3 + noise(i, j, 9) * 0.4;
            items.push({ order: orderOf({ i, j }) + 0.5, key: `quay-${j}`, node: <Tree key={`quay-${j}`} gx={i + 0.52} gy={gy} size={0.8 + noise(i, j, 8) * 0.2} /> });
            continue;
          }
          const limit = heightLimit(i, j, lots);
          if (limit === 0) {
            // Перед точкой сети дом не ставится: остаётся сквер, чтобы здание было видно целиком.
            lawns.push(roofFlat(i + 0.16, j + 0.16, i + 0.84, j + 0.84, 2));
            items.push({
              order: orderOf({ i, j }),
              key: `yard-${i}-${j}`,
              node: (
                <g key={`yard-${i}-${j}`} className="iso-tree">
                  <circle className="iso-tree-crown" cx={screenX(i + 0.34, j + 0.5)} cy={screenY(i + 0.34, j + 0.5, 5)} r="3.6" />
                  <circle className="iso-tree-light" cx={screenX(i + 0.62, j + 0.4)} cy={screenY(i + 0.62, j + 0.4, 5)} r="3" />
                </g>
              ),
            });
            continue;
          }
          const height = Math.min(limit, blockHeight + Math.floor(noise(i, j, 2) * 3) * 4);
          const x0 = di === 0 ? i + 0.1 : i;
          const x1 = di === 0 ? i + 1 : i + 0.9;
          const y0 = dj === 0 ? j + 0.1 : j;
          const y1 = dj === 0 ? j + 1 : j + 0.9;
          const house = box(x0, y0, x1, y1, 2, height);
          const floors = height >= 31 ? 4 : height >= 23 ? 3 : 2;
          shadows.push(shadowOf(x0, y0, x1, y1, height));
          items.push({
            order: orderOf({ i, j }),
            key: `house-${i}-${j}`,
            node: (
              <g key={`house-${i}-${j}`} className={`iso-house iso-f${1 + Math.floor(noise(i, j, 4) * 5)}`}>
                <path className="iso-house-l" d={house.left} />
                <path className="iso-house-r" d={house.right} />
                <path className="iso-house-t" d={house.top} />
                <path className="iso-house-roof" d={roofFlat(x0 + 0.13, y0 + 0.13, x1 - 0.13, y1 - 0.13, height)} />
                <path className="iso-win" d={panesLeft(x0 + 0.04, x1 - 0.04, y1, 4, height - 2, 3, floors) + panesRight(y0 + 0.04, y1 - 0.04, x1, 4, height - 2, 3, floors)} />
              </g>
            ),
          });
        }
      }
    }
  }

  items.push({ order: -100 + 7, key: "fortress", node: fortress() });
  items.push({ order: NEVSKY_ROW * 100 + 99, key: "traffic", node: traffic() });
  items.sort((left, right) => left.order - right.order);

  // Мосты через Фонтанку стоят на каждой поперечной улице; Невский шире остальных.
  const bridges: ReactNode[] = [];
  for (let j = NEVA.to; j <= range.j1; j += 3) {
    const edge = j === NEVSKY_ROW ? 0.05 : 0.2;
    bridges.push(
      <g key={`bridge-${j}`}>
        <path className="iso-quay" d={wallLeft(CANAL_COL + 0.12, CANAL_COL + 0.88, j + 1 - edge, 0, 3)} />
        <path className="iso-bridge" d={roofFlat(CANAL_COL + 0.04, j + edge, CANAL_COL + 0.96, j + 1 - edge, 3)} />
        <path className="iso-rail" d={line(at(CANAL_COL + 0.06, j + edge, 5.5), at(CANAL_COL + 0.94, j + edge, 5.5)) + line(at(CANAL_COL + 0.06, j + 1 - edge, 5.5), at(CANAL_COL + 0.94, j + 1 - edge, 5.5))} />
      </g>,
    );
  }

  const bridgeX = NEVA_BRIDGE_COL;
  const ground = (
    <g className="iso-ground-layer">
      <rect className="iso-ground" x={camera.x - 4} y={camera.y - 4} width={camera.w + 8} height={camera.h + 8} />
      <path className="iso-water" d={roofFlat(gx0, NEVA.from, gx1, NEVA.to, 0)} />
      <path className="iso-quay" d={wallLeft(gx0, gx1, NEVA.from, -5, 0)} />
      <path className="iso-water" d={roofFlat(CANAL_COL + 0.12, NEVA.to - 0.02, CANAL_COL + 0.88, gy1, 0)} />
      <path className="iso-quay" d={wallRight(NEVA.to, gy1, CANAL_COL + 0.12, -4, 0)} />
      <path
        className="iso-wave"
        d={[[3.4, -1.6], [4.6, -0.2], [9.2, -2.1], [10.4, 0.6], [8.3, 1.2], [12.2, -0.9], [0.6, 0.4], [-1.4, -1.2], [6.6, -0.1], [13.4, 1.1]]
          .map(([gx, gy]) => `M${screenX(gx, gy) - 7} ${screenY(gx, gy)}q3.5 -2.4 7 0t7 0`)
          .join("")}
      />
      <path className="iso-island" d={shape(at(6.25, -2.5), at(7.75, -2.5), at(8.15, -2.0), at(8.15, -1.15), at(7.7, -0.8), at(6.35, -0.8), at(5.95, -1.3), at(5.95, -2.05))} />
      <path className="iso-lane" d={line(at(gx0, NEVSKY_ROW + 0.5), at(gx1, NEVSKY_ROW + 0.5)) + line(at(LIGOVSKY_COL + 0.5, NEVA.to + 1), at(LIGOVSKY_COL + 0.5, gy1))} />
      <path className="iso-slab-side" d={slabSides.join("")} />
      <path className="iso-slab" d={slabTops.join("")} />
      <path className="iso-lawn" d={lawns.join("")} />
      {bridges}
      <path className="iso-quay" d={wallRight(NEVA.from, NEVA.to, bridgeX + 0.8, 2.5, 5) + [-2, -1, 0, 1].map((y) => wallRight(y - 0.1, y + 0.1, bridgeX + 0.8, 0, 2.5)).join("")} />
      <path className="iso-bridge" d={roofFlat(bridgeX + 0.2, NEVA.from - 0.05, bridgeX + 0.8, NEVA.to + 0.05, 5)} />
      <path className="iso-rail" d={line(at(bridgeX + 0.8, NEVA.from, 7.5), at(bridgeX + 0.8, NEVA.to, 7.5)) + line(at(bridgeX + 0.2, NEVA.from, 7.5), at(bridgeX + 0.2, NEVA.to, 7.5))} />
      <path className="iso-shadow" d={shadows.join("")} />
      <text className="iso-street-name" transform={`matrix(0.894 0.447 -0.894 0.447 ${at(CANAL_COL + 0.2, NEVSKY_ROW + 0.62)})`}>Невский пр.</text>
      <text className="iso-street-name" transform={`matrix(0.894 -0.447 0.894 0.447 ${at(LIGOVSKY_COL + 0.62, 7.95)})`}>Лиговский пр.</text>
      <text className="iso-water-name" transform={`matrix(0.894 -0.447 0.894 0.447 ${at(CANAL_COL + 0.62, 7.75)})`}>Фонтанка</text>
      <text className="iso-water-name is-river" transform={`matrix(0.894 0.447 -0.894 0.447 ${at(3.3, 0.35)})`}>Нева</text>
    </g>
  );

  return { ground, items };
}

// --- Здания сети --------------------------------------------------------------------------
// Фигуры заданы внутри одной клетки: угол клетки — начало координат, сторона равна единице.

function stripes(count: number, make: (from: number, to: number) => string) {
  const even: string[] = [];
  const odd: string[] = [];
  for (let index = 0; index < count; index += 1) (index % 2 ? odd : even).push(make(index / count, (index + 1) / count));
  return [even.join(""), odd.join("")];
}

/** Колобок — круглая вывеска с лицом, общая для всех зданий сети. */
function Logo({ x, y, r }: { x: number; y: number; r: number }) {
  return (
    <g className="iso-logo" transform={`translate(${x} ${y})`}>
      <circle className="iso-logo-ball" r={r} />
      <circle className="iso-logo-ink" cx={-r * 0.34} cy={-r * 0.14} r={r * 0.13} />
      <circle className="iso-logo-ink" cx={r * 0.34} cy={-r * 0.14} r={r * 0.13} />
      <path className="iso-logo-smile" d={`M${-r * 0.38} ${r * 0.2}Q0 ${r * 0.66} ${r * 0.38} ${r * 0.2}`} />
    </g>
  );
}

type Kind = "works" | "hall" | "kiosk";

/** Цех первой точки: кирпичный корпус, пилообразная крыша и труба. */
function worksArt() {
  const body = box(0.04, 0.04, 0.96, 0.96, 0, 28);
  const chimney = box(0.1, 0.1, 0.27, 0.27, 28, 72);
  const band = box(0.085, 0.085, 0.285, 0.285, 61, 66);
  const tooth = (index: number) => {
    const from = 0.04 + index * 0.3067;
    const to = from + 0.3067;
    return (
      <g key={index}>
        <path className="iso-k-roof" d={shape(at(from, 0.04, 39), at(from, 0.96, 39), at(to, 0.96, 28), at(to, 0.04, 28))} />
        <path className="iso-k-skylight" d={shape(at(from + 0.05, 0.12, 37.2), at(from + 0.05, 0.88, 37.2), at(from + 0.17, 0.88, 32.9), at(from + 0.17, 0.12, 32.9))} />
        <path className="iso-k-brick-l" d={shape(at(from, 0.96, 28), at(from, 0.96, 39), at(to, 0.96, 28))} />
      </g>
    );
  };
  return (
    <>
      <path className="iso-k-brick-l" d={body.left} />
      <path className="iso-k-brick-r" d={body.right} />
      <path className="iso-k-glass" d={panesLeft(0.08, 0.62, 0.96, 5, 23, 3, 1) + wallRight(0.1, 0.24, 0.96, 9, 19)} />
      <path className="iso-k-door" d={wallLeft(0.68, 0.86, 0.96, 0, 17)} />
      <path className="iso-k-gate" d={wallRight(0.34, 0.8, 0.96, 0, 19)} />
      <path className="iso-k-gate-line" d={[5, 10, 15].map((z) => line(at(0.96, 0.34, z), at(0.96, 0.8, z))).join("")} />
      {tooth(0)}
      <path className="iso-k-chimney-l" d={chimney.left} />
      <path className="iso-k-chimney-r" d={chimney.right} />
      <path className="iso-k-chimney-r" d={chimney.top} />
      <path className="iso-k-band" d={band.left + band.right} />
      {tooth(1)}
      {tooth(2)}
      <Logo x={-7} y={-13} r={7.5} />
    </>
  );
}

/** Точка с залом: два этажа, полосатый навес над входом и шатровая крыша. */
function hallArt() {
  const body = box(0.1, 0.1, 0.9, 0.9, 0, 30);
  const apex = at(0.5, 0.5, 48);
  const [awningEven, awningOdd] = stripes(8, (from, to) =>
    shape(at(0.1 + 0.8 * from, 0.9, 19), at(0.1 + 0.8 * to, 0.9, 19), at(0.1 + 0.8 * to, 1.07, 14), at(0.1 + 0.8 * from, 1.07, 14)));
  return (
    <>
      <path className="iso-k-wall-l" d={body.left} />
      <path className="iso-k-wall-r" d={body.right} />
      <path className="iso-k-glass" d={wallLeft(0.15, 0.37, 0.9, 4, 14) + wallLeft(0.63, 0.85, 0.9, 4, 14) + panesLeft(0.12, 0.88, 0.9, 20, 29, 3, 1) + panesRight(0.14, 0.86, 0.9, 3, 29, 2, 2)} />
      <path className="iso-k-door" d={wallLeft(0.43, 0.57, 0.9, 0, 14)} />
      <path className="iso-k-roof" d={awningEven} />
      <path className="iso-k-stripe" d={awningOdd} />
      <path className="iso-k-roof-dark" d={shape(at(0.03, 0.03, 30), at(0.97, 0.03, 30), apex) + shape(at(0.03, 0.03, 30), at(0.03, 0.97, 30), apex)} />
      <path className="iso-k-roof-dark" d={shape(at(0.97, 0.03, 30), at(0.97, 0.97, 30), apex)} />
      <path className="iso-k-roof" d={shape(at(0.03, 0.97, 30), at(0.97, 0.97, 30), apex)} />
      <Logo x={0} y={-38} r={6.5} />
    </>
  );
}

/** Киоск на вынос: маленький павильон под широким жёлтым козырьком. */
function kioskArt() {
  const body = box(0.28, 0.28, 0.72, 0.72, 0, 20);
  const canopy = box(0.14, 0.14, 0.86, 0.86, 20, 24.5);
  const [edgeEven, edgeOdd] = stripes(6, (from, to) => wallLeft(0.14 + 0.72 * from, 0.14 + 0.72 * to, 0.86, 20, 24.5));
  return (
    <>
      <path className="iso-k-wall-l" d={body.left} />
      <path className="iso-k-wall-r" d={body.right} />
      <path className="iso-k-glass" d={wallLeft(0.35, 0.65, 0.72, 8.5, 16)} />
      <path className="iso-k-door" d={wallLeft(0.32, 0.68, 0.72, 6.8, 8.6) + wallRight(0.4, 0.6, 0.72, 0, 14)} />
      <path className="iso-k-roof-dark" d={canopy.right} />
      <path className="iso-k-roof" d={edgeEven} />
      <path className="iso-k-stripe" d={edgeOdd} />
      <path className="iso-k-roof" d={canopy.top} />
      <Logo x={0} y={-15} r={7} />
    </>
  );
}

/**
 * Стройплощадка: фундамент, каркас будущего здания, кран и ограждение.
 * Две части: кран и фундамент стоят за растущим зданием, каркас и ограждение — перед ним.
 */
function siteArt(height: number, inset: number) {
  const low = inset;
  const high = 1 - inset;
  const base = box(low, low, high, high, 0, 5);
  const [fenceEven, fenceOdd] = stripes(8, (from, to) => wallLeft(0.06 + 0.88 * from, 0.06 + 0.88 * to, 0.97, 3, 7));
  const [sideEven, sideOdd] = stripes(8, (from, to) => wallRight(0.06 + 0.88 * from, 0.06 + 0.88 * to, 0.97, 3, 7));
  const load = box(0.74, 0.2, 0.86, 0.32, 28, 34);
  const frame = [
    line(at(low, high, 5), at(low, high, height)),
    line(at(high, high, 5), at(high, high, height)),
    line(at(high, low, 5), at(high, low, height)),
    line(at(low, low, 5), at(low, low, height)),
    roofFlat(low, low, high, high, height),
    line(at(low, high, height / 2 + 2), at(high, high, height / 2 + 2)),
    line(at(high, low, height / 2 + 2), at(high, high, height / 2 + 2)),
  ].join("");
  const back = (
    <>
      <path className="iso-site-base-l" d={base.left} />
      <path className="iso-site-base-r" d={base.right} />
      <path className="iso-site-base-t" d={base.top} />
      <path className="iso-site-crane" d={line(at(0.26, 0.26, 0), at(0.26, 0.26, 48)) + line(at(0.04, 0.26, 48), at(0.96, 0.26, 48)) + line(at(0.26, 0.26, 54), at(0.96, 0.26, 48)) + line(at(0.26, 0.26, 54), at(0.04, 0.26, 48)) + line(at(0.26, 0.26, 48), at(0.26, 0.26, 54))} />
      <path className="iso-site-cable" d={line(at(0.8, 0.26, 48), at(0.8, 0.26, 34))} />
      <path className="iso-site-load" d={load.left + load.right + load.top} />
    </>
  );
  const front = (
    <>
      <path className="iso-site-frame" d={frame} />
      <path className="iso-k-roof" d={fenceEven + sideEven} />
      <path className="iso-site-fence" d={fenceOdd + sideOdd} />
    </>
  );
  return { back, front };
}

type KindSpec = {
  title: string;
  art: ReactNode;
  site: { back: ReactNode; front: ReactNode };
  /** Высота здания над углом клетки: до неё тянется область нажатия и от неё отсчитывается стрелка выбора. */
  top: number;
  footprint: [number, number, number];
  coinsFrom: number;
  /** Область нажатия — силуэт здания, чтобы оно не перехватывало нажатия по соседям за ним. */
  hit: string;
  /** Где встают люди смены: вдоль двух фасадов, обращённых к зрителю, не загораживая вход. */
  staff: Spot[];
  /** Вход или окно выдачи: сюда идут гости. */
  door: Spot;
};

type Spot = [number, number];

const silhouette = (low: number, high: number, height: number) =>
  shape(at(low, high), at(high, high), at(high, low), at(high, low, height), at(low, low, height), at(low, high, height));

const kinds: Record<Kind, KindSpec> = {
  works: {
    title: "цех и зал", art: worksArt(), site: siteArt(28, 0.1), top: 44, footprint: [0.04, 0.96, 34], coinsFrom: -46, hit: silhouette(0, 1, 46),
    staff: [[0.14, 1.08], [1.08, 0.5], [0.34, 1.08], [1.08, 0.78], [0.54, 1.08], [1.08, 0.22]], door: [0.77, 1.0],
  },
  hall: {
    title: "точка с залом", art: hallArt(), site: siteArt(30, 0.14), top: 48, footprint: [0.1, 0.9, 36], coinsFrom: -50, hit: silhouette(0.05, 0.95, 50),
    staff: [[0.16, 1.08], [1.08, 0.5], [0.84, 1.08], [1.08, 0.78], [0.3, 1.08], [1.08, 0.22]], door: [0.5, 0.98],
  },
  kiosk: {
    title: "киоск на вынос", art: kioskArt(), site: siteArt(20, 0.26), top: 26, footprint: [0.28, 0.72, 22], coinsFrom: -28, hit: silhouette(0.12, 0.88, 36),
    staff: [[0.2, 1.04], [1.04, 0.5], [0.8, 1.04], [1.04, 0.76], [0.06, 1.04], [1.04, 0.24]], door: [0.5, 0.88],
  },
};
/** Кран стройплощадки одинаков для всех форматов; табличка с месяцем висит над ним. */
const SITE_TOP = 50;
const siteHit = silhouette(0.04, 0.96, 24);

export const kindOf = (point: StoryPoint): Kind => (point.isBase ? "works" : point.format === "with_seating" ? "hall" : "kiosk");

/** Тень открытого здания точки: рисуется на земле, под всеми предметами. */
export function pointShadow(point: StoryPoint, cell: Cell) {
  const [low, high, height] = kinds[kindOf(point)].footprint;
  return shadowOf(cell.i + low, cell.j + low, cell.i + high, cell.j + high, height);
}

const lotPad = roofFlat(0.03, 0.03, 0.97, 0.97, 2);
const lotRing = roofFlat(-0.05, -0.05, 1.05, 1.05, 2);
const coinDrift = [-9, 7, -2, 12, -13, 3];
export const STAFF_SHOWN_MAX = 6;

/** Фигурка человека; ноги стоят в начале координат. Сотрудник — в колпаке, гость с покупкой несёт свёрток. */
function Person({ look, bag }: { look: string; bag?: boolean }) {
  return (
    <g transform="scale(1.12)">
      <rect className="iso-fig-legs" x="-1.7" y="-3.4" width="3.4" height="3.4" />
      <rect className={`iso-fig-body ${look}`} x="-2.9" y="-10.2" width="5.8" height="7.2" rx="2.2" />
      <circle className="iso-fig-head" cy="-12.4" r="2.6" />
      {look === "is-staff" ? <path className="iso-fig-hat" d="M-2.5 -14.2h5v-1.6a2.5 2.2 0 0 0 -5 0z" /> : null}
      {bag ? <circle className="iso-fig-bag" cx="3.5" cy="-5.4" r="1.8" /> : null}
    </g>
  );
}

/** Люди смены: столько фигурок, сколько сотрудников на смене. Стоят на месте — движение на картинке отдано гостям. */
function Staff({ spots, count }: { spots: Spot[]; count: number }) {
  return (
    <g className="iso-staff">
      {spots.slice(0, count).map(([gx, gy], index) => (
        <g key={index} transform={`translate(${screenX(gx, gy)} ${screenY(gx, gy, 2)})`}>
          <Person look="is-staff" />
        </g>
      ))}
    </g>
  );
}

const SIDEWALK = 1.27;
const px = (value: number) => `${Math.round(value * 10) / 10}px`;

/**
 * Поток гостей: фигурки идут по тротуару ко входу и уходят с покупкой.
 * Число фигурок задаёт вызывающий — пропорционально чекам в день; путь целиком описан в стиле, React при ходьбе не участвует.
 */
function Guests({ door, count }: { door: Spot; count: number }) {
  return (
    <g className="iso-guests" transform={`translate(${screenX(door[0], door[1])} ${screenY(door[0], door[1], 2)})`}>
      {Array.from({ length: count }, (_, index) => {
        const drift = ((index * 7) % 5) * 0.025;
        const near = SIDEWALK + drift;
        // Три подхода по очереди: по улице справа, по улице слева и из-за переднего угла.
        const approach = index % 3;
        const start: Spot = approach === 0 ? [1.95 - drift * 2, near] : approach === 1 ? [-0.95 + drift * 2, near] : [near, 1.95];
        const front: Spot = [door[0], near];
        const turn: Spot = approach === 2 ? [near, near] : [(start[0] + front[0]) / 2, near];
        // Место на пути, где гость стоит, когда анимации выключены.
        const share = 0.15 + ((index * 0.37) % 1) * 0.7;
        const [from, to, part] = share < 0.5 ? [start, turn, share * 2] : [turn, front, share * 2 - 1];
        const rest: Spot = [from[0] + (to[0] - from[0]) * part, from[1] + (to[1] - from[1]) * part];
        const offset = (spot: Spot) => [px(screenX(spot[0], spot[1]) - screenX(door[0], door[1])), px(screenY(spot[0], spot[1]) - screenY(door[0], door[1]))];
        const [x0, y0] = offset(start);
        const [x1, y1] = offset(turn);
        const [x2, y2] = offset(front);
        const [xs, ys] = offset(rest);
        const leaving = index % 2 === 1;
        const style = {
          "--x0": x0, "--y0": y0, "--x1": x1, "--y1": y1, "--x2": x2, "--y2": y2, "--xs": xs, "--ys": ys,
          animationDuration: `${6.4 + (index % 3) * 0.9}s`,
          animationDelay: `${-index * 2.3}s`,
          animationDirection: leaving ? "reverse" : "normal",
        } as CSSProperties;
        return (
          <g key={index} className="iso-guest" style={style}>
            <Person look={`is-guest-${index % 3}`} bag={leaving} />
          </g>
        );
      })}
    </g>
  );
}

const sparks: Spot[] = [[-24, -8], [-13, -21], [0, -27], [13, -21], [24, -8], [0, -13]];
const BUILD_MS = 1500;

/** Пыль у основания, пока здание растёт, и искры над крышей, когда оно готово. */
function BuildFx({ top }: { top: number }) {
  return (
    <g className="iso-build-fx">
      {[[-17, 23], [1, 31], [18, 22]].map(([x, y], index) => (
        <circle key={index} className="iso-dust" cx={x} cy={y} r="4.6" style={{ animationDelay: `${index * 0.17}s` }} />
      ))}
      <g transform={`translate(0 ${-top + 8})`}>
        {sparks.map(([dx, dy], index) => (
          <path key={index} className="iso-spark" d="M0 -3.6L1.1 -1.1L3.6 0L1.1 1.1L0 3.6L-1.1 1.1L-3.6 0L-1.1 -1.1Z" style={{ "--dx": px(dx), "--dy": px(dy) } as CSSProperties} />
        ))}
      </g>
    </g>
  );
}

const prefersStillness = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Идёт ли стройка: полторы секунды после того, как точка открылась на глазах у зрителя.
 * При первой отрисовке уже открытая точка стройку не показывает.
 */
function useBuilding(open: boolean) {
  const [wasOpen, setWasOpen] = useState(open);
  const [building, setBuilding] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    setBuilding(open && !prefersStillness());
  }
  useEffect(() => {
    if (!building) return;
    const timer = window.setTimeout(() => setBuilding(false), BUILD_MS);
    return () => window.clearTimeout(timer);
  }, [building]);
  return building;
}

function Coins({ count, from }: { count: number; from: number }) {
  return (
    <g className="iso-coins">
      {Array.from({ length: count }, (_, index) => (
        <ellipse key={`stack-${index}`} className="iso-coin" cx="0" cy={33.5 - index * 2.3} rx="5" ry="2.6" />
      ))}
      {Array.from({ length: count }, (_, index) => (
        <g key={`fly-${index}`} transform={`translate(${coinDrift[index % coinDrift.length]} ${from})`}>
          <g className="iso-coin-fly" style={{ animationDelay: `${(-index * 2.8) / count}s` }}>
            <circle className="iso-coin" r="3.7" />
            <path className="iso-coin-mark" d="M-0.9 -1.9v3.8M-0.9 -1.9h1.4a1.2 1.2 0 0 1 0 2.4h-1.4M-1.8 1h2.6" />
          </g>
        </g>
      ))}
    </g>
  );
}

type PointSpriteProps = {
  point: StoryPoint;
  cell: Cell;
  open: boolean;
  selected: boolean;
  /** Площадка появилась после смены сценария или размера сети: подсвечивается две секунды. */
  isNew: boolean;
  onToggle: (id: string) => void;
};

/**
 * Точка сети на своём участке: до открытия — стройплощадка с номером месяца, после — здание по формату.
 * В момент открытия здание за полторы секунды «вырастает» внутри каркаса. Люди, монеты и дым — в верхнем слое (PointLife).
 */
export const PointSprite = memo(function PointSprite({ point, cell, open, selected, isNew, onToggle }: PointSpriteProps) {
  const kind = kindOf(point);
  const spec = kinds[kind];
  const building = useBuilding(open);
  const label = open ? `${point.title}, ${spec.title}` : `${point.title}, откроется в ${point.openingMonth}-м месяце`;
  const onKeyDown = (event: KeyboardEvent<SVGGElement>) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    onToggle(point.id);
  };
  return (
    <g
      className={`iso-point is-${kind}${open ? " is-open" : " is-site"}${selected ? " is-selected" : ""}${isNew ? " is-new" : ""}`}
      transform={`translate(${screenX(cell.i, cell.j)} ${screenY(cell.i, cell.j)})`}
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      aria-label={label}
      onClick={() => onToggle(point.id)}
      onKeyDown={onKeyDown}
    >
      <path className={open ? "iso-lot" : "iso-lot is-site"} d={lotPad} />
      {selected ? <path className="iso-ring" d={lotRing} /> : null}
      {isNew ? <path className="iso-new-ring" d={lotRing} /> : null}
      {open ? (
        <>
          {building ? <g className="iso-build-scaffold">{spec.site.back}</g> : null}
          <g className={building ? "iso-point-art is-building" : "iso-point-art"}>{spec.art}</g>
          {building ? (
            <>
              <g className="iso-build-scaffold">{spec.site.front}</g>
              <BuildFx top={spec.top} />
            </>
          ) : null}
        </>
      ) : (
        <>
          {spec.site.back}
          {spec.site.front}
        </>
      )}
      <path className="iso-hit" d={open ? spec.hit : siteHit} />
    </g>
  );
});

type PointLifeProps = {
  point: StoryPoint;
  cell: Cell;
  open: boolean;
  /** Сколько монет показывать: задаётся пропорционально выручке точки. */
  coins: number;
  /** Сколько гостей идёт к точке: задаётся пропорционально чекам в день. */
  guests: number;
};

/**
 * Жизнь у открытой точки — смена, гости, монеты и дым. Рисуется в верхнем слое и только когда камера близко:
 * там бесконечные анимации перерисовывают несколько десятков фигур, а не весь город. Во время стройки её нет.
 */
export const PointLife = memo(function PointLife({ point, cell, open, coins, guests }: PointLifeProps) {
  const kind = kindOf(point);
  const spec = kinds[kind];
  const building = useBuilding(open);
  if (!open || building) return null;
  return (
    <g className="iso-life" transform={`translate(${screenX(cell.i, cell.j)} ${screenY(cell.i, cell.j)})`}>
      {kind === "works" ? (
        <g transform="translate(0 -66)">
          {[0, 1, 2].map((index) => <circle key={index} className="iso-smoke" r="4.5" style={{ animationDelay: `${-index * 1.1}s` }} />)}
        </g>
      ) : null}
      <Staff spots={spec.staff} count={Math.min(point.staffOnShift, STAFF_SHOWN_MAX)} />
      <Coins count={coins} from={spec.coinsFrom} />
      <Guests door={spec.door} count={guests} />
    </g>
  );
});

/**
 * Табличка стройплощадки с месяцем открытия. Висит в верхнем слое — над людьми и монетами соседних точек —
 * и нажимается так же, как сама площадка.
 */
export const SiteSign = memo(function SiteSign({ point, cell, onToggle }: { point: StoryPoint; cell: Cell; onToggle: (id: string) => void }) {
  return (
    <g
      className="iso-site-sign"
      transform={`translate(${screenX(cell.i, cell.j)} ${screenY(cell.i, cell.j) - SITE_TOP - 13})`}
      onClick={() => onToggle(point.id)}
    >
      <path className="iso-site-board" d="M-4.5 7h9l-4.5 6.5z" />
      <rect className="iso-site-board" x="-17" y="-8" width="34" height="16" rx="5.5" />
      <text className="iso-site-month" y="4" textAnchor="middle">М{point.openingMonth}</text>
    </g>
  );
});

/**
 * Отметка выбранной точки: подпись со стрелкой над зданием; рисуется поверх всего. Рамка участка лежит под самим зданием.
 * camera — кадр «сеть целиком»: в нём подпись не уходит за край.
 */
export function Selection({ point, cell, open, camera }: { point: StoryPoint; cell: Cell; open: boolean; camera: Camera }) {
  const x = screenX(cell.i, cell.j);
  const kind = kindOf(point);
  // У цеха подпись встаёт над трубой, у стройплощадки — над табличкой с месяцем.
  const top = !open ? SITE_TOP + 24 : kind === "works" ? 70 : kinds[kind].top;
  const width = point.title.length * 6.6 + 20;
  const tagX = Math.max(camera.x + 6 + width / 2, Math.min(camera.x + camera.w - 6 - width / 2, x));
  const y = Math.max(camera.y + 18, screenY(cell.i, cell.j) - top - 24);
  return (
    <g className="iso-selection">
      <g transform={`translate(0 ${y})`}>
        <g className="iso-callout">
          <path className="iso-tag" d={`M${Math.max(tagX - width / 2 + 10, Math.min(tagX + width / 2 - 10, x)) - 6} 9h12l-6 8z`} />
          <rect className="iso-tag" x={tagX - width / 2} y="-10" width={width} height="20" rx="10" />
          <text className="iso-tag-text" x={tagX} y="4.2" textAnchor="middle">{point.title}</text>
        </g>
      </g>
    </g>
  );
}
