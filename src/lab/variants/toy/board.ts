/**
 * Геометрия игрового поля: дорожка месяцев по краю и районы в центре.
 * Здесь только раскладка на плоскости — ни одного числа о сети: всё, что показывается, приходит из story.
 */
import type { NetworkStory, StoryPoint } from "../../story";

type Vec = readonly [number, number];

/** Шаг клетки дорожки в единицах поля. */
export const CELL = 48;
/** Картонный край поля. */
const EDGE = 10;
/** Полоса между дорожкой и районами: в ней лежит подпись «возврат вложений». */
const RING = 30;
/** Просвет между районами и скругление их углов. */
const GAP = 10;
const ROUND = 14;
const LABEL_LINE = 26;
const tokenScales = [2, 1.85, 1.7, 1.55, 1.4, 1.25, 1.1, 1, 0.9];

/** Сторона поля, на которой лежит клетка: 0 — верх, 1 — право, 2 — низ, 3 — лево. */
export type TrackSide = 0 | 1 | 2 | 3;
export type TrackCell = { index: number; x: number; y: number; side: TrackSide };
/** Фишка на поле; point === null — свободное место, куда в игре можно поставить точку района. */
export type BoardToken = { point: StoryPoint | null; districtId: string | null; x: number; y: number; scale: number };
export type BoardDistrict = {
  id: string;
  /** Название района, разбитое на строки. */
  lines: string[];
  tone: number;
  path: string;
  labelX: number;
  labelY: number;
  tokens: BoardToken[];
};
export type Board = {
  width: number;
  height: number;
  /** Клетки по ходу времени; их может быть чуть больше, чем месяцев, — лишние остаются пустыми. */
  cells: TrackCell[];
  districts: BoardDistrict[];
  /** Середина полосы между дорожкой и районами — расстояние от края поля. */
  ringOffset: number;
  /** Границы, в которых подпись в полосе не заходит на соседнюю сторону. */
  inner: { left: number; top: number; right: number; bottom: number };
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

/** Дорожка идёт по часовой стрелке от левого верхнего угла. */
function trackCells(count: number, portrait: boolean) {
  const half = Math.max(Math.ceil((count + 4) / 2), 8);
  const long = Math.round((half * 20) / 33);
  const short = half - long;
  const cols = portrait ? short : long;
  const rows = portrait ? long : short;
  const grid: Array<[number, number, TrackSide]> = [];
  for (let col = 0; col < cols; col += 1) grid.push([col, 0, 0]);
  for (let row = 1; row < rows; row += 1) grid.push([cols - 1, row, 1]);
  for (let col = cols - 2; col >= 0; col -= 1) grid.push([col, rows - 1, 2]);
  for (let row = rows - 2; row >= 1; row -= 1) grid.push([0, row, 3]);
  const cells = grid.map(([col, row, side], index): TrackCell => ({
    index,
    side,
    x: EDGE + col * CELL + CELL / 2,
    y: EDGE + row * CELL + CELL / 2,
  }));
  return { cells, width: cols * CELL + EDGE * 2, height: rows * CELL + EDGE * 2 };
}

/** Оставляет часть выпуклого многоугольника, где проекция на normal не больше limit. */
function clipHalfPlane(polygon: Vec[], normal: Vec, limit: number) {
  const result: Vec[] = [];
  for (let index = 0; index < polygon.length; index += 1) {
    const a = polygon[index];
    const b = polygon[(index + 1) % polygon.length];
    const da = a[0] * normal[0] + a[1] * normal[1] - limit;
    const db = b[0] * normal[0] + b[1] * normal[1] - limit;
    if (da <= 0) result.push(a);
    if ((da < 0 && db > 0) || (da > 0 && db < 0)) {
      const t = da / (da - db);
      result.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return result;
}

/** Участок поля, который ближе к своему центру, чем к соседним; shift отодвигает границы внутрь. */
function regionOf(sites: Vec[], index: number, box: { x: number; y: number; w: number; h: number }, shift: number) {
  const site = sites[index];
  let polygon: Vec[] = [
    [box.x, box.y],
    [box.x + box.w, box.y],
    [box.x + box.w, box.y + box.h],
    [box.x, box.y + box.h],
  ];
  sites.forEach((other, otherIndex) => {
    if (otherIndex === index || polygon.length === 0) return;
    const dx = other[0] - site[0];
    const dy = other[1] - site[1];
    const length = Math.hypot(dx, dy);
    if (length < 1e-6) return;
    const normal: Vec = [dx / length, dy / length];
    const middle = ((site[0] + other[0]) / 2) * normal[0] + ((site[1] + other[1]) / 2) * normal[1];
    polygon = clipHalfPlane(polygon, normal, middle - shift);
  });
  return polygon;
}

function centroid(polygon: Vec[], fallback: Vec): Vec {
  let area = 0;
  let x = 0;
  let y = 0;
  for (let index = 0; index < polygon.length; index += 1) {
    const a = polygon[index];
    const b = polygon[(index + 1) % polygon.length];
    const cross = a[0] * b[1] - b[0] * a[1];
    area += cross;
    x += (a[0] + b[0]) * cross;
    y += (a[1] + b[1]) * cross;
  }
  if (Math.abs(area) < 1e-6) return fallback;
  return [x / (3 * area), y / (3 * area)];
}

/** Ширина многоугольника на высоте y. */
function chord(polygon: Vec[], y: number): [number, number] | null {
  const xs: number[] = [];
  for (let index = 0; index < polygon.length; index += 1) {
    const a = polygon[index];
    const b = polygon[(index + 1) % polygon.length];
    if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) xs.push(a[0] + ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]));
  }
  return xs.length < 2 ? null : [Math.min(...xs), Math.max(...xs)];
}

/** Длинное название района делится на две строки по пробелу, ближайшему к середине. */
function titleLines(title: string) {
  if (title.length <= 11 || !title.includes(" ")) return [title];
  const middle = title.length / 2;
  let best = -1;
  for (let index = 0; index < title.length; index += 1) {
    if (title[index] === " " && (best < 0 || Math.abs(index - middle) < Math.abs(best - middle))) best = index;
  }
  return [title.slice(0, best), title.slice(best + 1)];
}

/** Название района и фишки под ним: в один ряд, если район широкий, иначе в несколько. */
function arrange(polygon: Vec[], districtId: string | null, points: Array<StoryPoint | null>, lines: string[], tokenScale: number) {
  const ys = polygon.map((vertex) => vertex[1]);
  const top = Math.min(...ys) - ROUND + 8;
  const bottom = Math.max(...ys) + ROUND - 8;
  const centre = centroid(polygon, polygon[0] ?? [0, 0]);
  const scales = points.map((point) => tokenScale * (point?.isBase ? 1.2 : 1));
  const labelHeight = lines.length * LABEL_LINE + 6;
  const spanAt = (y: number) => chord(polygon, clamp(y, top + ROUND, bottom - ROUND)) ?? [centre[0], centre[0]];
  // Общая ширина района на нескольких высотах: у скошенного района она уже, чем в середине.
  const spanOver = (...heights: number[]) => {
    const spans = heights.map(spanAt);
    const left = Math.max(...spans.map((span) => span[0]));
    const right = Math.min(...spans.map((span) => span[1]));
    return left <= right ? [left, right] : [(left + right) / 2, (left + right) / 2];
  };

  for (let rows = 1; rows <= points.length; rows += 1) {
    const perRow = Math.ceil(points.length / rows);
    // Первой точке нужен запас сверху под трубу с дымом.
    const rowHeights = Array.from({ length: rows }, (_, row) => Math.max(...points.slice(row * perRow, (row + 1) * perRow).map((point, index) => (point?.isBase ? 84 : 60) * scales[row * perRow + index])));
    const blockHeight = labelHeight + rowHeights.reduce((total, value) => total + value, 0);
    const blockTop = clamp(centre[1] - blockHeight / 2, top, Math.max(top, bottom - blockHeight));
    const tokens: BoardToken[] = [];
    let fits = blockHeight <= bottom - top;
    let rowTop = blockTop + labelHeight;
    for (let row = 0; row < rows; row += 1) {
      const rowPoints = points.slice(row * perRow, (row + 1) * perRow);
      const rowScales = scales.slice(row * perRow, (row + 1) * perRow);
      const baseY = rowTop + rowHeights[row] - 8;
      const [left, right] = spanOver(baseY + 4, baseY - rowHeights[row] * 0.4, baseY - rowHeights[row] * 0.8);
      const room = right - left + ROUND;
      const wanted = rowScales.reduce((total, scale) => total + 70 * scale, 0);
      if (wanted * 0.92 > room) fits = false;
      const squeeze = Math.min(1, room / wanted);
      let cursor = (left + right) / 2 - (wanted * squeeze) / 2;
      rowPoints.forEach((point, index) => {
        const slot = 70 * rowScales[index] * squeeze;
        // Стопка карточек выглядывает справа от домика, поэтому сам домик чуть левее середины места.
        tokens.push({ point, districtId, x: cursor + slot / 2 - 7 * rowScales[index], y: baseY, scale: rowScales[index] });
        cursor += slot;
      });
      rowTop += rowHeights[row];
    }
    if (fits || rows === points.length) {
      const [left, right] = spanOver(blockTop + 4, blockTop + labelHeight - 4);
      return { fits, tokens, labelX: (left + right) / 2, labelY: blockTop + LABEL_LINE * 0.78 };
    }
  }
  return { fits: true, tokens: [], labelX: centre[0], labelY: centre[1] };
}

/** addSlots — в каждом районе, где ещё есть место, оставить свободное место под новую точку. */
export function buildBoard(story: NetworkStory, portrait: boolean, addSlots: boolean): Board {
  const track = trackCells(story.months.length, portrait);
  const fieldOffset = EDGE + CELL + RING;
  const field = { x: fieldOffset, y: fieldOffset, w: track.width - fieldOffset * 2, h: track.height - fieldOffset * 2 };

  // Участки поля: первая точка сети и районы из расчёта, включая пустые, — так поле не перестраивается от хода к ходу.
  const first = story.points.filter((point) => point.districtId === null);
  const districts: Array<{ id: string; districtId: string | null; title: string; anchor: { x: number; y: number }; points: Array<StoryPoint | null> }> = [];
  if (first.length) districts.push({ id: first[0].place.id, districtId: null, title: first[0].title, anchor: first[0].place, points: first });
  for (const district of story.districts) {
    const points: Array<StoryPoint | null> = story.points.filter((point) => point.districtId === district.id);
    if (addSlots && points.length < story.rules.maxPointsPerDistrict) points.push(null);
    // Районы с одним и тем же местом на карте чуть раздвигаются, иначе их участки совпадут.
    const twins = districts.filter((other) => Math.abs(other.anchor.x - district.place.x) < 1e-6 && Math.abs(other.anchor.y - district.place.y) < 1e-6).length;
    districts.push({ id: district.id, districtId: district.id, title: district.title, anchor: { x: district.place.x + 0.04 * twins, y: district.place.y + 0.03 * twins }, points });
  }

  // Взаимное расположение районов берётся с карты и растягивается на всё поле.
  const xs = districts.map((district) => district.anchor.x);
  const ys = districts.map((district) => district.anchor.y);
  const spread = (value: number, values: number[]) => {
    const min = Math.min(...values);
    const span = Math.max(...values) - min;
    return span > 1e-6 ? 0.16 + 0.68 * ((value - min) / span) : 0.5;
  };
  let sites: Vec[] = districts.map((district) => [
    field.x + field.w * spread(district.anchor.x, xs),
    field.y + field.h * spread(district.anchor.y, ys),
  ]);
  // Несколько проходов выравнивают районы по размеру, сохраняя соседство.
  for (let pass = 0; pass < 4; pass += 1) {
    sites = sites.map((site, index): Vec => {
      const centre = centroid(regionOf(sites, index, field, 0), site);
      return [site[0] + (centre[0] - site[0]) * 0.8, site[1] + (centre[1] - site[1]) * 0.8];
    });
  }

  const inset = { x: field.x + ROUND, y: field.y + ROUND, w: field.w - ROUND * 2, h: field.h - ROUND * 2 };
  const regions = districts.map((district, index) => ({
    ...district,
    polygon: regionOf(sites, index, inset, GAP / 2 + ROUND),
    lines: titleLines(district.title),
  }));
  // Домики одного размера на всём поле — самого крупного, при котором они помещаются в каждом районе.
  const tokenScale = tokenScales.find((scale) => regions.every((region) => arrange(region.polygon, region.districtId, region.points, region.lines, scale).fits)) ?? tokenScales[tokenScales.length - 1];
  return {
    width: track.width,
    height: track.height,
    cells: track.cells,
    ringOffset: EDGE + CELL + RING / 2,
    inner: { left: fieldOffset, top: fieldOffset, right: track.width - fieldOffset, bottom: track.height - fieldOffset },
    districts: regions.map(({ id, districtId, polygon, points, lines }, index) => {
      const { tokens, labelX, labelY } = arrange(polygon, districtId, points, lines, tokenScale);
      return {
        id,
        lines,
        tone: index % 6,
        path: polygon.length ? `M${polygon.map((vertex) => `${vertex[0].toFixed(1)} ${vertex[1].toFixed(1)}`).join(" L")} Z` : "",
        tokens,
        labelX,
        labelY,
      };
    }),
  };
}

/** Скругление районов: обводка такой толщины доводит их до границ поля. */
export const districtStroke = ROUND * 2;
