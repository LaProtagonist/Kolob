/**
 * План условного центра Петербурга на изометрической сетке: где вода, улицы и кварталы,
 * на какие участки встают точки сети и какую часть города показывает «камера».
 * Здесь только геометрия рисунка; все цифры сети приходят из story.
 */
import type { StoryPoint } from "../../story";

/** Половина ширины и высоты клетки на экране, в единицах рисунка. */
export const HALF_W = 32;
export const HALF_H = 16;
/** Сколько клеток приходится на всю условную карту: place.x и place.y идут от 0 до 1. */
export const GRID = 14;

export type Cell = { i: number; j: number };
export type Camera = { x: number; y: number; w: number; h: number };

export const mod = (value: number, base: number) => ((value % base) + base) % base;
const round = (value: number) => Math.round(value * 10) / 10;

/** Клетка сетки → точка экрана. Ось gx уходит вправо-вниз, gy — влево-вниз, z — высота. */
export const screenX = (gx: number, gy: number) => (gx - gy) * HALF_W;
export const screenY = (gx: number, gy: number, z = 0) => (gx + gy) * HALF_H - z;
export const at = (gx: number, gy: number, z = 0) => `${round(screenX(gx, gy))} ${round(screenY(gx, gy, z))}`;
export const shape = (...corners: string[]) => `M${corners.join("L")}Z`;

/** Прямоугольник на стене, обращённой к зрителю вдоль gy (левая грань). */
export const wallLeft = (x0: number, x1: number, y: number, z0: number, z1: number) =>
  shape(at(x0, y, z1), at(x1, y, z1), at(x1, y, z0), at(x0, y, z0));
/** Прямоугольник на стене, обращённой к зрителю вдоль gx (правая грань). */
export const wallRight = (y0: number, y1: number, x: number, z0: number, z1: number) =>
  shape(at(x, y0, z1), at(x, y1, z1), at(x, y1, z0), at(x, y0, z0));
export const roofFlat = (x0: number, y0: number, x1: number, y1: number, z: number) =>
  shape(at(x0, y0, z), at(x1, y0, z), at(x1, y1, z), at(x0, y1, z));

/** Три видимые грани бруска. */
export function box(x0: number, y0: number, x1: number, y1: number, z0: number, z1: number) {
  return {
    top: roofFlat(x0, y0, x1, y1, z1),
    left: wallLeft(x0, x1, y1, z0, z1),
    right: wallRight(y0, y1, x1, z0, z1),
  };
}

/** Тень бруска на земле: свет идёт слева, тень ложится вправо. */
export function shadowOf(x0: number, y0: number, x1: number, y1: number, height: number) {
  const reach = height / 90;
  return shape(at(x0, y0), at(x0 + reach, y0 - reach), at(x1 + reach, y0 - reach), at(x1 + reach, y1 - reach), at(x1, y1), at(x0, y1));
}

function panes(cols: number, rows: number, z0: number, z1: number, make: (from: number, to: number, low: number, high: number) => string) {
  const parts: string[] = [];
  const rowHeight = (z1 - z0) / rows;
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      parts.push(make((col + 0.26) / cols, (col + 0.74) / cols, z0 + rowHeight * (row + 0.24), z0 + rowHeight * (row + 0.78)));
    }
  }
  return parts.join("");
}

/** Ряды окон на левой и правой стенах. */
export const panesLeft = (x0: number, x1: number, y: number, z0: number, z1: number, cols: number, rows: number) =>
  panes(cols, rows, z0, z1, (from, to, low, high) => wallLeft(x0 + (x1 - x0) * from, x0 + (x1 - x0) * to, y, low, high));
export const panesRight = (y0: number, y1: number, x: number, z0: number, z1: number, cols: number, rows: number) =>
  panes(cols, rows, z0, z1, (from, to, low, high) => wallRight(y0 + (y1 - y0) * from, y0 + (y1 - y0) * to, x, low, high));

/** Устойчивое «случайное» число от 0 до 1 для клетки: город одинаков при каждом открытии страницы. */
export function noise(i: number, j: number, salt = 0) {
  let value = Math.imul(i + 101 * salt, 374761393) + Math.imul(j - 57 * salt, 668265263);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
}

// --- План города ---------------------------------------------------------------------------
// Улицы идут через две клетки на третью, между ними кварталы 2×2. Нева — полоса на севере,
// Фонтанка занимает одну из улиц, Невский и Лиговский — обычные улицы с разметкой и подписью.

/** Нева: клетки с gy от from до to. */
export const NEVA = { from: -3, to: 2 };
export const CANAL_COL = 5;
export const NEVSKY_ROW = 5;
export const LIGOVSKY_COL = 11;
export const NEVA_BRIDGE_COL = 2;

export type BlockKind = "houses" | "park" | "admiralty" | "isaac";

// Летний сад у истока Фонтанки и сквер напротив первой точки: за ним виден Лиговский проспект.
const namedBlocks: Record<string, BlockKind> = { "0,3": "admiralty", "0,6": "isaac", "3,3": "park", "12,6": "park" };

export const isLand = (j: number) => j >= NEVA.to || j < NEVA.from;
export const isStreet = (i: number, j: number) => mod(i, 3) === 2 || mod(j, 3) === 2;
/** Ближний берег Фонтанки: вместо домов — набережная с деревьями, иначе воду не было бы видно. */
export const isQuay = (i: number, j: number) => i === CANAL_COL + 1 && j >= NEVA.to;

/** Квартал по его северному углу (a, b); сады встречаются только в стороне от центра. */
export function blockKind(a: number, b: number): BlockKind {
  const named = namedBlocks[`${a},${b}`];
  if (named) return named;
  const outskirts = a < 0 || a > 12 || b > 12 || b < 0;
  return outskirts && noise(a, b, 3) < 0.16 ? "park" : "houses";
}

/** Участок, куда можно поставить точку сети: дом обычного квартала, кроме дальнего угла — он закрыт соседями. */
function isLot(i: number, j: number) {
  if (j < NEVA.to || isStreet(i, j) || isQuay(i, j)) return false;
  if (mod(i, 3) === 0 && mod(j, 3) === 0) return false;
  return blockKind(i - mod(i, 3), j - mod(j, 3)) === "houses";
}

/** Квартал, которому принадлежит клетка: его северный угол. */
const blockOf = (i: number, j: number) => `${i - mod(i, 3)},${j - mod(j, 3)}`;
/** Насколько вторая и следующие точки района отходят от первой: один квартал. */
const SPREAD = 3;

/**
 * Каждая точка встаёт на ближайший свободный участок к своему месту на условной карте; в одном квартале — не больше одной точки.
 * Точки одного района в данных лежат почти вплотную. На сетке вторая и следующие уходят на квартал от первой —
 * в ту же сторону, куда их сдвигает расчёт, — чтобы сеть из 9 и 13 точек не сливалась в одно пятно.
 * Расстановка идёт по порядку открытия, поэтому уже стоящие точки не сдвигаются, когда сеть растёт.
 */
export function placePoints(points: StoryPoint[]): Map<string, Cell> {
  const takenBlocks = new Set<string>();
  const firstOfDistrict = new Map<string, { gx: number; gy: number }>();
  const lots = new Map<string, Cell>();
  for (const point of points) {
    let gx = point.place.x * GRID;
    let gy = point.place.y * GRID;
    const district = point.districtId ?? point.id;
    const first = firstOfDistrict.get(district);
    if (!first) {
      firstOfDistrict.set(district, { gx, gy });
    } else {
      const length = Math.hypot(gx - first.gx, gy - first.gy) || 1;
      gx = first.gx + ((gx - first.gx) / length) * SPREAD;
      gy = first.gy + ((gy - first.gy) / length) * SPREAD;
    }
    let best: Cell = { i: Math.floor(gx), j: Math.floor(gy) };
    let bestCost = Infinity;
    for (let j = Math.floor(gy) - 8; j <= Math.floor(gy) + 8; j += 1) {
      for (let i = Math.floor(gx) - 8; i <= Math.floor(gx) + 8; i += 1) {
        if (!isLot(i, j) || takenBlocks.has(blockOf(i, j))) continue;
        const cost = (i + 0.5 - gx) ** 2 + (j + 0.5 - gy) ** 2;
        if (cost < bestCost) {
          best = { i, j };
          bestCost = cost;
        }
      }
    }
    takenBlocks.add(blockOf(best.i, best.j));
    lots.set(point.id, best);
  }
  return lots;
}

/**
 * Насколько высоким может быть обычный дом в клетке, чтобы не закрыть точку сети, стоящую за ним.
 * Ноль — на этом месте остаётся сквер.
 */
export function heightLimit(i: number, j: number, lots: Cell[]) {
  let limit = Infinity;
  for (const lot of lots) {
    const ahead = i - lot.i;
    const aside = j - lot.j;
    if (ahead < 0 || aside < 0 || Math.abs(ahead - aside) > 1) continue;
    const steps = ahead + aside;
    if (steps === 1 || (ahead === 1 && aside === 1)) limit = 0;
    else if (steps === 3) limit = Math.min(limit, 22);
    else if (steps === 4 && ahead === aside) limit = Math.min(limit, 30);
  }
  return limit;
}

/** Пропорции кадра: узкий экран получает почти квадратный кадр, широкий — панораму. */
export const frameAspect = (compact: boolean) => (compact ? 1.02 : 1.72);
/** Ширина кадра «одна точка вблизи», в единицах рисунка. */
export const closeWidth = (compact: boolean) => (compact ? 230 : 330);

/** Прямоугольник на экране вокруг клеток с запасом на высоту зданий и подписи. */
function boundsOf(spots: Array<{ gx: number; gy: number }>) {
  const xs = spots.map((spot) => screenX(spot.gx, spot.gy));
  const ys = spots.map((spot) => screenY(spot.gx, spot.gy));
  return { left: Math.min(...xs) - 60, right: Math.max(...xs) + 60, top: Math.min(...ys) - 116, bottom: Math.max(...ys) + 70 };
}

/** Кадр «сеть целиком»: все точки сети; если точки разошлись, кадр отъезжает. */
export function frameCamera(lots: Cell[], compact: boolean): Camera {
  const aspect = frameAspect(compact);
  const { left, right, top, bottom } = boundsOf(lots.map((lot) => ({ gx: lot.i + 0.5, gy: lot.j + 0.5 })));
  const w = Math.max(compact ? 400 : 700, right - left, (bottom - top) * aspect);
  const h = w / aspect;
  return { x: Math.round((left + right) / 2 - w / 2), y: Math.round((top + bottom) / 2 - h / 2), w: Math.round(w), h: Math.round(h) };
}

/**
 * Участок города, который нарисован и по которому можно двигать камеру: кадр сети с запасом по краям.
 * Он только растёт — объединяется с прежним, — поэтому при смене размера сети камера отъезжает
 * по уже нарисованному городу и по краям не бывает пустоты.
 */
export function worldFrame(home: Camera, previous: Camera | null): Camera {
  const pad = Math.round(home.w * 0.14);
  const x0 = Math.min(home.x - pad, previous?.x ?? Infinity);
  const y0 = Math.min(home.y - pad / 2, previous?.y ?? Infinity);
  const x1 = Math.max(home.x + home.w + pad, previous ? previous.x + previous.w : -Infinity);
  const y1 = Math.max(home.y + home.h + pad / 2, previous ? previous.y + previous.h : -Infinity);
  return { x: Math.round(x0), y: Math.round(y0), w: Math.round(x1 - x0), h: Math.round(y1 - y0) };
}

export const sameFrame = (left: Camera | null, right: Camera | null) =>
  Boolean(left && right && left.x === right.x && left.y === right.y && left.w === right.w && left.h === right.h);

/** Клетки, которые попадают в кадр, с запасом на высокие здания у нижнего края. */
export function visibleCells(camera: Camera) {
  const corners = [
    [camera.x - 40, camera.y - 40],
    [camera.x + camera.w + 40, camera.y - 40],
    [camera.x - 40, camera.y + camera.h + 100],
    [camera.x + camera.w + 40, camera.y + camera.h + 100],
  ];
  const gx = corners.map(([x, y]) => (x / HALF_W + y / HALF_H) / 2);
  const gy = corners.map(([x, y]) => (y / HALF_H - x / HALF_W) / 2);
  return {
    i0: Math.floor(Math.min(...gx)) - 1,
    i1: Math.ceil(Math.max(...gx)) + 1,
    j0: Math.floor(Math.min(...gy)) - 1,
    j1: Math.ceil(Math.max(...gy)) + 1,
  };
}

/** Виден ли в кадре предмет с основанием в точке экрана (x, y) и заданной высотой. */
export const inFrame = (camera: Camera, x: number, y: number, height = 60) =>
  x > camera.x - 80 && x < camera.x + camera.w + 80 && y > camera.y - 44 && y < camera.y + camera.h + height + 40;
