/**
 * План условного центра Петербурга для объёмной сцены: та же вода и те же улицы,
 * что на плоской карте. Здесь только геометрия в единицах сцены — без three и без данных сети.
 */
export type P = { x: number; z: number };

/** Размер плиты города; доли 0…1 из `place` точки растягиваются на эти стороны. */
export const WORLD = { width: 100, depth: 72 };

// Контуры заданы в координатах плоской карты (1000 × 620), чтобы оба варианта показывали одно место.
const MAP_W = 1000;
const MAP_H = 620;
type Pair = [number, number];

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Доли 0…1 условной карты → место на плите. */
export function place(x: number, y: number): P {
  return { x: (clamp(x, 0, 1) - 0.5) * WORLD.width, z: (clamp(y, 0, 1) - 0.5) * WORLD.depth };
}

const at = ([x, y]: Pair) => place(x / MAP_W, y / MAP_H);

function dedupe(line: P[]) {
  return line.filter((point, index) => index === 0 || Math.hypot(point.x - line[index - 1].x, point.z - line[index - 1].z) > 0.05);
}

function cubic(a: Pair, c1: Pair, c2: Pair, b: Pair, steps = 14): P[] {
  return Array.from({ length: steps + 1 }, (_, index) => {
    const t = index / steps;
    const u = 1 - t;
    const mix = (k: 0 | 1) => u * u * u * a[k] + 3 * u * u * t * c1[k] + 3 * u * t * t * c2[k] + t * t * t * b[k];
    return at([mix(0), mix(1)]);
  });
}

const nevaShore = dedupe([
  ...cubic([-20, 150], [160, 90], [300, 190], [470, 150]),
  ...cubic([470, 150], [640, 110], [760, 40], [1020, 90]).slice(1),
]);
const canalEast = dedupe([
  ...cubic([60, 640], [120, 520], [90, 430], [170, 380]),
  ...cubic([170, 380], [230, 340], [250, 250], [330, 190]).slice(1),
]);
const canalWest = dedupe([
  ...cubic([300, 170], [210, 230], [190, 330], [120, 370]),
  ...cubic([120, 370], [40, 420], [60, 520], [-20, 600]).slice(1),
]);

/** Вода: Нева вдоль северного края и канал от неё на юго-запад. */
export const waterAreas: P[][] = [
  [...nevaShore, at([MAP_W, 0]), at([0, 0])],
  dedupe([...canalEast, ...canalWest, at([0, MAP_H])]),
];

/** Набережные — светлая кромка вдоль берега. */
export const banks: P[][] = [nevaShore, dedupe([...canalEast, ...canalWest])];

export type Road = { id: string; line: P[]; width: number };

export const roads: Road[] = [
  { id: "nevsky", line: [at([250, 250]), at([880, 330])], width: 2.4 },
  { id: "ligovsky", line: [at([740, 120]), at([740, 600])], width: 1.8 },
  { id: "sadovaya", line: cubic([300, 380], [420, 470], [560, 520], [700, 470]), width: 1.6 },
  { id: "south", line: cubic([120, 520], [260, 560], [420, 600], [620, 580]), width: 1.6 },
];

/** Подписи на плане: место на плите и текст. */
export const planLabels: { id: string; title: string; at: P }[] = [
  { id: "plan:neva", title: "Нева", at: at([610, 48]) },
  { id: "plan:nevsky", title: "Невский проспект", at: at([440, 274]) },
  { id: "plan:ligovsky", title: "Лиговский проспект", at: at([740, 470]) },
];

type Nearest = { point: P; distance: number; along: P };

function nearest(target: P, line: P[], closed: boolean): Nearest {
  let best: Nearest = { point: line[0], distance: Infinity, along: { x: 1, z: 0 } };
  const count = closed ? line.length : line.length - 1;
  for (let index = 0; index < count; index += 1) {
    const a = line[index];
    const b = line[(index + 1) % line.length];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const length = dx * dx + dz * dz || 1;
    const t = clamp(((target.x - a.x) * dx + (target.z - a.z) * dz) / length, 0, 1);
    const point = { x: a.x + dx * t, z: a.z + dz * t };
    const distance = Math.hypot(target.x - point.x, target.z - point.z);
    if (distance < best.distance) best = { point, distance, along: { x: dx / Math.sqrt(length), z: dz / Math.sqrt(length) } };
  }
  return best;
}

function inside(target: P, polygon: P[]) {
  let hit = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const a = polygon[index];
    const b = polygon[previous];
    if (a.z > target.z !== b.z > target.z && target.x < ((b.x - a.x) * (target.z - a.z)) / (b.z - a.z) + a.x) hit = !hit;
  }
  return hit;
}

/** Отодвигает круг радиуса `radius` от воды и с проезжей части. */
function clearOfPlan(target: P, radius: number): P {
  let point = target;
  for (const area of waterAreas) {
    const edge = nearest(point, area, true);
    const wet = inside(point, area);
    const clear = radius + 0.6;
    if (!wet && edge.distance >= clear) continue;
    let dx = (point.x - edge.point.x) * (wet ? -1 : 1);
    let dz = (point.z - edge.point.z) * (wet ? -1 : 1);
    if (Math.hypot(dx, dz) < 1e-6) [dx, dz] = [-edge.along.z, edge.along.x];
    const length = Math.hypot(dx, dz);
    point = { x: edge.point.x + (dx / length) * clear, z: edge.point.z + (dz / length) * clear };
  }
  for (const road of roads) {
    const edge = nearest(point, road.line, false);
    const clear = road.width / 2 + radius + 0.3;
    if (edge.distance >= clear) continue;
    let dx = point.x - edge.point.x;
    let dz = point.z - edge.point.z;
    if (Math.hypot(dx, dz) < 1e-6) [dx, dz] = [-edge.along.z, edge.along.x];
    const length = Math.hypot(dx, dz);
    point = { x: edge.point.x + (dx / length) * clear, z: edge.point.z + (dz / length) * clear };
  }
  return point;
}

/**
 * Расставляет здания точек: соседние точки одного района раздвигаются, чтобы не стоять друг в друге,
 * и ни одна не остаётся в воде или на дороге. Порядок и результат всегда одинаковы для одних данных.
 */
export function settle(spots: (P & { radius: number })[]): P[] {
  const result = spots.map((spot) => ({ x: spot.x, z: spot.z }));
  const edgeX = WORLD.width / 2;
  const edgeZ = WORLD.depth / 2;
  for (let round = 0; round < 6; round += 1) {
    for (let a = 0; a < result.length; a += 1) {
      for (let b = a + 1; b < result.length; b += 1) {
        const gap = spots[a].radius + spots[b].radius + 0.9;
        let dx = result[b].x - result[a].x;
        let dz = result[b].z - result[a].z;
        let distance = Math.hypot(dx, dz);
        if (distance >= gap) continue;
        if (distance < 1e-6) {
          // Две точки в одном месте расходятся в сторону, заданную их номерами.
          [dx, dz, distance] = [Math.cos(b * 2.4), Math.sin(b * 2.4), 1];
        }
        const push = (gap - distance) / 2;
        result[a] = { x: result[a].x - (dx / distance) * push, z: result[a].z - (dz / distance) * push };
        result[b] = { x: result[b].x + (dx / distance) * push, z: result[b].z + (dz / distance) * push };
      }
    }
    result.forEach((point, index) => {
      const radius = spots[index].radius;
      const clear = clearOfPlan(point, radius);
      result[index] = {
        x: clamp(clear.x, -edgeX + radius + 1, edgeX - radius - 1),
        z: clamp(clear.z, -edgeZ + radius + 1, edgeZ - radius - 1),
      };
    });
  }
  return result;
}

export type Block = { x: number; z: number; width: number; depth: number; height: number; tone: 0 | 1 | 2; radius: number };
export type Tree = { x: number; z: number; size: number };

/** Повторяемая «случайность»: город выглядит одинаково при каждом открытии страницы. */
function seeded(seed: number) {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function blocked(point: P, radius: number) {
  for (const area of waterAreas) {
    if (inside(point, area) || nearest(point, area, true).distance < radius + 0.7) return true;
  }
  return roads.some((road) => nearest(point, road.line, false).distance < road.width / 2 + radius + 0.35);
}

/** Фоновая застройка и деревья: невысокие кварталы, которые не спорят со зданиями сети. */
export function cityFiller(): { blocks: Block[]; trees: Tree[] } {
  const random = seeded(20260930);
  const blocks: Block[] = [];
  const trees: Tree[] = [];
  const cell = 4.7;
  const columns = Math.floor((WORLD.width - 4) / cell);
  const rows = Math.floor((WORLD.depth - 4) / cell);
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const center = {
        x: (column - (columns - 1) / 2) * cell + (random() - 0.5) * 0.7,
        z: (row - (rows - 1) / 2) * cell + (random() - 0.5) * 0.7,
      };
      const width = 2.5 + random() * 1.4;
      const depth = 2.5 + random() * 1.4;
      const tall = random();
      const kind = random();
      const tone = Math.floor(random() * 3) as 0 | 1 | 2;
      const radius = Math.max(width, depth) * 0.6;
      if (blocked(center, radius)) continue;
      if (kind < 0.13) {
        // Сквер вместо дома: два-три дерева.
        const count = 2 + Math.floor(random() * 2);
        for (let index = 0; index < count; index += 1) {
          trees.push({ x: center.x + (random() - 0.5) * 2.6, z: center.z + (random() - 0.5) * 2.6, size: 0.8 + random() * 0.5 });
        }
        continue;
      }
      blocks.push({ ...center, width, depth, height: 0.9 + tall * tall * 2.3, tone, radius });
    }
  }
  return { blocks, trees };
}
