/**
 * Карта центра Петербурга для вариантов лаборатории.
 *
 * Общая разметка из OpenStreetMap: вода с островами, сады, главные проспекты, мосты,
 * достопримечательности и подписи. Координаты в метрах: x на восток, y на юг, начало у Дворцовой площади.
 * Файл карты пересобирает scripts/lab-map-data.mjs. Данные © участники OpenStreetMap, лицензия ODbL;
 * подпись об этом обязательна в углу каждой карты (её ставит MapShell).
 */
import data from "./spb-centre.json";
import type { StoryPoint } from "../../story";

/** Кольцо или ломаная: x0, y0, x1, y1, … в метрах. */
export type Ring = number[];
/** Многоугольник: первое кольцо внешнее, остальные — дыры (острова в воде, пруды в саду). */
export type Polygon = Ring[];
export type Road = { name: string; kind: "p" | "s"; bridge: boolean; lines: Ring[] };
export type LandmarkKind =
  | "palace" | "column" | "spire" | "dome" | "colonnade" | "fortress" | "rostral"
  | "onion" | "castle" | "station" | "theatre" | "baroque" | "ship";
export type Landmark = { id: string; title: string; kind: LandmarkKind; x: number; y: number };
export type MapLabel = { text: string; kind: "water" | "canal" | "district"; x: number; y: number };
export type Box = { x: number; y: number; w: number; h: number };

type CityMap = {
  source: string;
  origin: { lat: number; lon: number };
  metersPerDegree: { lat: number; lon: number };
  frame: Box;
  water: Polygon[];
  parks: Array<{ name: string | null; rings: Polygon }>;
  roads: Road[];
  landmarks: Landmark[];
  labels: MapLabel[];
};

export const city = data as unknown as CityMap;
export const mapCredit = "© участники OpenStreetMap";
export const mapCreditUrl = "https://www.openstreetmap.org/copyright";

/** Широта и долгота → метры карты. */
export function project(lat: number, lon: number): [number, number] {
  return [(lon - city.origin.lon) * city.metersPerDegree.lon, (city.origin.lat - lat) * city.metersPerDegree.lat];
}

export type Transform = (x: number, y: number) => [number, number];
const round = (value: number) => Math.round(value * 10) / 10;

export function ringPath(ring: Ring, transform?: Transform, closed = true): string {
  let path = "";
  for (let index = 0; index < ring.length; index += 2) {
    const [x, y] = transform ? transform(ring[index], ring[index + 1]) : [ring[index], ring[index + 1]];
    path += `${index ? "L" : "M"}${round(x)} ${round(y)}`;
  }
  return closed ? `${path}Z` : path;
}
export const polygonPath = (polygon: Polygon, transform?: Transform) => polygon.map((ring) => ringPath(ring, transform)).join("");
export const linePath = (line: Ring, transform?: Transform) => ringPath(line, transform, false);

/** Сглаживание Чайкина: углы срезаются, контур становится мягким, как нарисованный. */
export function smooth(ring: Ring, rounds = 2, closed = true): Ring {
  let points = ring;
  for (let round = 0; round < rounds; round += 1) {
    const next: number[] = [];
    const count = points.length / 2;
    const last = closed ? count : count - 1;
    if (!closed) next.push(points[0], points[1]);
    for (let index = 0; index < last; index += 1) {
      const ax = points[index * 2];
      const ay = points[index * 2 + 1];
      const bx = points[((index + 1) % count) * 2];
      const by = points[((index + 1) % count) * 2 + 1];
      next.push(ax * 0.75 + bx * 0.25, ay * 0.75 + by * 0.25, ax * 0.25 + bx * 0.75, ay * 0.25 + by * 0.75);
    }
    if (!closed) next.push(points[points.length - 2], points[points.length - 1]);
    points = next;
  }
  return points;
}

/** Упрощение Дугласа — Пекера для крупного рисунка: точки ближе tolerance метров к линии убираются. */
export function simplify(line: Ring, tolerance: number, closed = true): Ring {
  const count = line.length / 2;
  if (count < 4) return line;
  const at = (index: number) => [line[index * 2], line[index * 2 + 1]] as const;
  const keep = new Uint8Array(count + 1);
  const run = (first: number, last: number, pointAt: (index: number) => readonly [number, number]) => {
    keep[first] = keep[last] = 1;
    const stack: Array<[number, number]> = [[first, last]];
    while (stack.length) {
      const [from, to] = stack.pop()!;
      const [ax, ay] = pointAt(from);
      const [bx, by] = pointAt(to);
      const length = Math.hypot(bx - ax, by - ay) || 1;
      let worst = 0;
      let worstIndex = -1;
      for (let index = from + 1; index < to; index += 1) {
        const [px, py] = pointAt(index);
        const distance = Math.abs((bx - ax) * (ay - py) - (ax - px) * (by - ay)) / length;
        if (distance > worst) {
          worst = distance;
          worstIndex = index;
        }
      }
      if (worst > tolerance && worstIndex > 0) {
        keep[worstIndex] = 1;
        stack.push([from, worstIndex], [worstIndex, to]);
      }
    }
  };
  if (!closed) {
    run(0, count - 1, at);
  } else {
    // Кольцо делится пополам у самой дальней от начала точки: иначе начало и конец совпадают.
    let far = 0;
    let best = -1;
    for (let index = 1; index < count; index += 1) {
      const [x, y] = at(index);
      const distance = Math.hypot(x - line[0], y - line[1]);
      if (distance > best) {
        best = distance;
        far = index;
      }
    }
    run(0, far, at);
    run(far, count, (index) => at(index % count));
  }
  const result: number[] = [];
  for (let index = 0; index < count; index += 1) if (keep[index]) result.push(line[index * 2], line[index * 2 + 1]);
  return result.length >= 6 ? result : line;
}

/** Повторяемый случайный ряд: один и тот же рисунок при каждой загрузке. */
export function random(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Дрожание линии, как у рисунка от руки: точки расставляются через step метров
 * и сдвигаются поперёк на случайную величину до amount метров.
 */
export function wobble(ring: Ring, amount: number, seed: number, step = 70, closed = true): Ring {
  const next = random(seed);
  const out: number[] = [];
  const count = ring.length / 2;
  const segments = closed ? count : count - 1;
  for (let index = 0; index < segments; index += 1) {
    const ax = ring[index * 2];
    const ay = ring[index * 2 + 1];
    const bx = ring[((index + 1) % count) * 2];
    const by = ring[((index + 1) % count) * 2 + 1];
    const length = Math.hypot(bx - ax, by - ay);
    const parts = Math.max(1, Math.round(length / step));
    const nx = -(by - ay) / (length || 1);
    const ny = (bx - ax) / (length || 1);
    for (let part = 0; part < parts; part += 1) {
      const t = part / parts;
      const shift = (next() - 0.5) * 2 * amount;
      out.push(ax + (bx - ax) * t + nx * shift, ay + (by - ay) * t + ny * shift);
    }
  }
  if (!closed) out.push(ring[ring.length - 2], ring[ring.length - 1]);
  return out;
}

export function ringArea(ring: Ring) {
  let sum = 0;
  const count = ring.length / 2;
  for (let index = 0; index < count; index += 1) {
    const next = (index + 1) % count;
    sum += ring[index * 2] * ring[next * 2 + 1] - ring[next * 2] * ring[index * 2 + 1];
  }
  return Math.abs(sum) / 2;
}

export function insideRing(x: number, y: number, ring: Ring) {
  let inside = false;
  const count = ring.length / 2;
  for (let index = 0, previous = count - 1; index < count; previous = index, index += 1) {
    const ax = ring[index * 2];
    const ay = ring[index * 2 + 1];
    const bx = ring[previous * 2];
    const by = ring[previous * 2 + 1];
    if (ay > y !== by > y && x < ((bx - ax) * (y - ay)) / (by - ay) + ax) inside = !inside;
  }
  return inside;
}

export const insidePolygon = (x: number, y: number, polygon: Polygon) =>
  insideRing(x, y, polygon[0]) && !polygon.slice(1).some((hole) => insideRing(x, y, hole));

/** Многоугольники с рамками: точка вне рамки отсеивается без точной проверки. */
function withBounds(polygons: Polygon[]) {
  return polygons.map((polygon) => {
    const outer = polygon[0];
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let index = 0; index < outer.length; index += 2) {
      minX = Math.min(minX, outer[index]);
      maxX = Math.max(maxX, outer[index]);
      minY = Math.min(minY, outer[index + 1]);
      maxY = Math.max(maxY, outer[index + 1]);
    }
    return { polygon, minX, minY, maxX, maxY };
  });
}
const waterIndex = withBounds(city.water);
const parkIndex = withBounds(city.parks.map((park) => park.rings));
const hit = (index: ReturnType<typeof withBounds>, x: number, y: number) =>
  index.some((item) => x >= item.minX && x <= item.maxX && y >= item.minY && y <= item.maxY && insidePolygon(x, y, item.polygon));

export const onWater = (x: number, y: number) => hit(waterIndex, x, y);
export const inPark = (x: number, y: number) => hit(parkIndex, x, y);

/** Повторяемые случайные точки внутри многоугольника — для деревьев, волн, лодок. */
export function scatter(polygon: Polygon, count: number, seed: number): Array<[number, number]> {
  const next = random(seed);
  const outer = polygon[0];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let index = 0; index < outer.length; index += 2) {
    minX = Math.min(minX, outer[index]);
    maxX = Math.max(maxX, outer[index]);
    minY = Math.min(minY, outer[index + 1]);
    maxY = Math.max(maxY, outer[index + 1]);
  }
  const points: Array<[number, number]> = [];
  for (let attempt = 0; attempt < count * 30 && points.length < count; attempt += 1) {
    const x = minX + next() * (maxX - minX);
    const y = minY + next() * (maxY - minY);
    if (insidePolygon(x, y, polygon)) points.push([x, y]);
  }
  return points;
}

/** Кадр, в который весь прямоугольник box входит целиком при пропорциях окна aspect (ширина к высоте). */
export function containBox(box: Box, aspect: number, pad = 0): Box {
  const w0 = box.w + pad * 2;
  const h0 = box.h + pad * 2;
  const w = Math.max(w0, h0 * aspect);
  const h = w / aspect;
  return { x: box.x + box.w / 2 - w / 2, y: box.y + box.h / 2 - h / 2, w, h };
}

export type MapPoint = { point: StoryPoint; x: number; y: number };

/**
 * Где стоят точки сети: первая точка района — на месте района, следующие — вокруг него
 * по спирали через 260 м, мимо воды. Цифры точек не меняются, это только место на рисунке.
 */
export function placeOnMap(points: readonly StoryPoint[]): MapPoint[] {
  const seen = new Map<string, number>();
  const taken: Array<[number, number]> = [];
  return points.map((point) => {
    const [cx, cy] = project(point.place.lat, point.place.lon);
    const order = seen.get(point.place.id) ?? 0;
    seen.set(point.place.id, order + 1);
    const spot = findSpot(cx, cy, order, taken);
    taken.push(spot);
    return { point, x: spot[0], y: spot[1] };
  });
}

/**
 * Свободное место у района: по спирали от его центра через 260 м, начиная с витка order,
 * не в воде и не ближе 180 м к занятым местам.
 */
export function findSpot(cx: number, cy: number, order: number, taken: ReadonlyArray<readonly [number, number]>): [number, number] {
  for (let attempt = 0; attempt < 48; attempt += 1) {
    const ring = order + attempt;
    const radius = ring === 0 ? 0 : 260 * Math.sqrt(ring);
    const angle = ring * 2.39996;
    const candidate: [number, number] = [cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius];
    const crowded = taken.some(([x, y]) => Math.hypot(x - candidate[0], y - candidate[1]) < 180);
    if (!onWater(candidate[0], candidate[1]) && !crowded) return candidate;
  }
  return [cx, cy];
}

/** Ближайшая вода к точке (поиск по спирали с шагом 20 м); null, если воды нет в пределах reach метров. */
export function snapToWater(x: number, y: number, reach = 600): [number, number] | null {
  if (onWater(x, y)) return [x, y];
  for (let radius = 20; radius <= reach; radius += 20) {
    for (let step = 0; step < 24; step += 1) {
      const angle = (step / 24) * Math.PI * 2;
      const probe: [number, number] = [x + Math.cos(angle) * radius, y + Math.sin(angle) * radius];
      if (onWater(probe[0], probe[1])) return probe;
    }
  }
  return null;
}

// Маршруты прогулочных лодок: по Неве от Смольного к Стрелке и по Большой Неве к заливу,
// по Малой Неве и по Большой Невке мимо «Авроры». Точки притягиваются к воде при сборке.
const boatRoutes: Array<Array<[number, number]>> = [
  [[4712, 1718], [4762, 216], [4462, -1535], [3511, -2336], [2260, -1786], [1009, -1185], [58, -1035], [-493, -584], [-1143, -84], [-2094, 517], [-2995, 1468]],
  [[-493, -900], [-1050, -1250], [-1594, -1535], [-2245, -1886], [-2845, -2286]],
  [[1209, -2987], [1259, -2386], [1350, -1950], [1700, -1700], [2260, -1786]],
];

/** Маршруты лодок как пути рисунка: сглаженные, по воде. */
export function boatRoutePaths(transform?: Transform): string[] {
  return boatRoutes.map((route) => {
    const snapped = route.map(([x, y]) => snapToWater(x, y)).filter((point): point is [number, number] => point !== null);
    return linePath(smooth(snapped.flat(), 3, false), transform);
  });
}

// --- Дома в кварталах -------------------------------------------------------------------------

/** Направление Невского (от Адмиралтейства к площади Восстания) — по нему выстраиваются ряды домов. */
export const nevskyAngle = (() => {
  const [ax, ay] = project(59.938, 30.30777);
  const [bx, by] = project(59.9316, 30.3604);
  return Math.atan2(by - ay, bx - ax);
})();

const roadSegments = (() => {
  const segments: number[] = [];
  for (const road of city.roads) {
    for (const line of road.lines) {
      for (let index = 0; index + 3 < line.length; index += 2) segments.push(line[index], line[index + 1], line[index + 2], line[index + 3]);
    }
  }
  return Float64Array.from(segments);
})();

/** Расстояние от точки до ближайшего проспекта или моста, в метрах; дальше limit не уточняется. */
export function distanceToRoad(x: number, y: number, limit = Infinity) {
  let best = limit;
  for (let index = 0; index < roadSegments.length; index += 4) {
    const ax = roadSegments[index];
    const ay = roadSegments[index + 1];
    const bx = roadSegments[index + 2];
    const by = roadSegments[index + 3];
    // Отрезок, чья рамка дальше лучшего найденного, точку не приблизит.
    if (x < Math.min(ax, bx) - best || x > Math.max(ax, bx) + best || y < Math.min(ay, by) - best || y > Math.max(ay, by) + best) continue;
    const dx = bx - ax;
    const dy = by - ay;
    const length = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / length));
    best = Math.min(best, Math.hypot(x - (ax + dx * t), y - (ay + dy * t)));
  }
  return best;
}

/** Дом в квартале: где стоит, какой формы (0 — длинный доходный дом, 1 — дом со скатной крышей, 2 — дом с башенкой) и какого цвета. */
export type HouseSpot = { x: number; y: number; kind: 0 | 1 | 2; tone: number };

let houseCache: HouseSpot[] | null = null;

/**
 * Дома в кварталах: ряды вдоль Невского через 150 × 190 м с небольшим сдвигом, только на суше, вне садов,
 * не ближе 45 м к проспекту и не на площадях у достопримечательностей. Их меньше, чем кварталов в городе:
 * дома показывают, что здесь город, а не считают его.
 */
export function cityHouses(): HouseSpot[] {
  if (houseCache) return houseCache;
  const next = random(2026);
  const ux = Math.cos(nevskyAngle);
  const uy = Math.sin(nevskyAngle);
  const vx = -uy;
  const vy = ux;
  const frame = city.frame;
  const reach = Math.hypot(frame.w, frame.h);
  const spots: HouseSpot[] = [];
  const along = 150;
  const across = 190;
  for (let row = -Math.ceil(reach / across); row <= Math.ceil(reach / across); row += 1) {
    for (let column = -Math.ceil(reach / along); column <= Math.ceil(reach / along); column += 1) {
      const shift = row % 2 ? along / 2 : 0;
      const a = column * along + shift + (next() - 0.5) * 50;
      const b = row * across + (next() - 0.5) * 40;
      const x = a * ux + b * vx;
      const y = a * uy + b * vy;
      const kindRoll = next();
      const tone = Math.floor(next() * 4);
      if (x < frame.x + 60 || x > frame.x + frame.w - 60 || y < frame.y + 60 || y > frame.y + frame.h - 60) continue;
      if (onWater(x, y) || onWater(x - 40, y) || onWater(x + 40, y) || onWater(x, y - 30) || inPark(x, y)) continue;
      if (city.landmarks.some((landmark) => Math.hypot(landmark.x - x, landmark.y - y) < 260)) continue;
      if (distanceToRoad(x, y, 45) < 45) continue;
      spots.push({ x, y, kind: kindRoll < 0.62 ? 0 : kindRoll < 0.9 ? 1 : 2, tone });
    }
  }
  houseCache = spots.sort((left, right) => left.y - right.y);
  return houseCache;
}

/** Дома, кроме тех, что стоят на участках точек сети и мест под новые точки. */
export const housesClearOf = (spots: readonly HouseSpot[], clear: ReadonlyArray<readonly [number, number]>, radius = 170) =>
  spots.filter((spot) => !clear.some(([x, y]) => Math.hypot(spot.x - x, spot.y - y) < radius));
