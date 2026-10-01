#!/usr/bin/env node
/**
 * Карта центра Петербурга для лаборатории визуализаций.
 *
 * Берёт из OpenStreetMap только общую разметку: воду с островами, сады, главные проспекты
 * и мосты. Упрощает её до точности в несколько метров и пишет небольшой файл
 * src/lab/shared/geo/spb-centre.json. Страницы лаборатории к картам в интернете не обращаются.
 *
 * Данные: © участники OpenStreetMap, лицензия ODbL (https://www.openstreetmap.org/copyright).
 * Подпись об этом стоит в углу каждой карты лаборатории.
 *
 *   node scripts/lab-map-data.mjs --fetch   скачать заново и пересобрать
 *   node scripts/lab-map-data.mjs           пересобрать из скачанного в .cache/osm/
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cacheDir = path.join(root, ".cache", "osm");
const rawFile = path.join(cacheDir, "spb-centre-geometry.json");
const outFile = path.join(root, "src", "lab", "shared", "geo", "spb-centre.json");

/** Что скачиваем: чуть шире рисунка, чтобы края воды и улиц не обрывались у рамки. */
const BOX = { south: 59.9, west: 30.225, north: 59.975, east: 30.405 };
/** Что рисуем: от Васильевского до Смольного, от Петроградки до Обводного. */
const FRAME = { south: 59.9105, west: 30.248, north: 59.967, east: 30.402 };
/** Начало координат карты — у Дворцовой площади. Ось x на восток, y на юг, в метрах. */
const ORIGIN = { lat: 59.9375, lon: 30.315 };

// Зеркало Mail.ru отвечает из России быстрее основного сервера; второй — запасной.
const MIRRORS = ["https://maps.mail.ru/osm/tools/overpass/api/interpreter", "https://overpass-api.de/api/interpreter"];

const QUERY = `[out:json][timeout:180];
(
  way["natural"="water"](${BOX.south},${BOX.west},${BOX.north},${BOX.east});
  relation["natural"="water"](${BOX.south},${BOX.west},${BOX.north},${BOX.east});
  way["waterway"="riverbank"](${BOX.south},${BOX.west},${BOX.north},${BOX.east});
  relation["waterway"="riverbank"](${BOX.south},${BOX.west},${BOX.north},${BOX.east});
  way["leisure"~"^(park|garden)$"](${BOX.south},${BOX.west},${BOX.north},${BOX.east});
  relation["leisure"~"^(park|garden)$"](${BOX.south},${BOX.west},${BOX.north},${BOX.east});
  way["highway"~"^(trunk|primary|secondary)$"](${BOX.south},${BOX.west},${BOX.north},${BOX.east});
);
out geom;`;

/**
 * Достопримечательности и подписи. Координаты взяты из OpenStreetMap (центры зданий);
 * kind говорит рисунку, какой силуэт поставить.
 */
const LANDMARKS = [
  { id: "winter-palace", title: "Зимний дворец", lat: 59.94047, lon: 30.31379, kind: "palace" },
  { id: "alexander-column", title: "Дворцовая площадь", lat: 59.93904, lon: 30.31582, kind: "column" },
  { id: "admiralty", title: "Адмиралтейство", lat: 59.938, lon: 30.30777, kind: "spire" },
  { id: "isaac", title: "Исаакиевский собор", lat: 59.93408, lon: 30.30616, kind: "dome" },
  { id: "kazan", title: "Казанский собор", lat: 59.93446, lon: 30.32477, kind: "colonnade" },
  { id: "fortress", title: "Петропавловская крепость", lat: 59.9502, lon: 30.31647, kind: "fortress" },
  { id: "strelka", title: "Стрелка", lat: 59.94389, lon: 30.30597, kind: "rostral" },
  { id: "spas", title: "Спас на Крови", lat: 59.94006, lon: 30.32878, kind: "onion" },
  { id: "mikhailovsky", title: "Михайловский замок", lat: 59.94038, lon: 30.33772, kind: "castle" },
  { id: "moscow-station", title: "Московский вокзал", lat: 59.92961, lon: 30.36214, kind: "station" },
  { id: "mariinsky", title: "Мариинский театр", lat: 59.92543, lon: 30.29591, kind: "theatre" },
  { id: "smolny", title: "Смольный собор", lat: 59.9489, lon: 30.3956, kind: "baroque" },
  { id: "aurora", title: "Крейсер «Аврора»", lat: 59.9553, lon: 30.3375, kind: "ship" },
];

/** Подписи воды и частей города: где их ставить и каким шрифтом. */
const LABELS = [
  { text: "Нева", lat: 59.9466, lon: 30.3165, kind: "water" },
  { text: "Большая Нева", lat: 59.9378, lon: 30.2935, kind: "water" },
  { text: "Малая Нева", lat: 59.9512, lon: 30.2895, kind: "water" },
  { text: "Большая Невка", lat: 59.9615, lon: 30.3365, kind: "water" },
  { text: "Фонтанка", lat: 59.9262, lon: 30.3275, kind: "canal" },
  { text: "Мойка", lat: 59.9362, lon: 30.3215, kind: "canal" },
  { text: "канал Грибоедова", lat: 59.9298, lon: 30.3196, kind: "canal" },
  { text: "Обводный канал", lat: 59.9147, lon: 30.3335, kind: "canal" },
  { text: "Васильевский остров", lat: 59.9418, lon: 30.2705, kind: "district" },
  { text: "Петроградская сторона", lat: 59.9605, lon: 30.3045, kind: "district" },
  { text: "Коломна", lat: 59.9192, lon: 30.2785, kind: "district" },
];

const PHI = (ORIGIN.lat * Math.PI) / 180;
const M_PER_LAT = 111132.954 - 559.822 * Math.cos(2 * PHI) + 1.175 * Math.cos(4 * PHI);
const M_PER_LON = 111412.84 * Math.cos(PHI) - 93.5 * Math.cos(3 * PHI);
const project = ({ lat, lon }) => [(lon - ORIGIN.lon) * M_PER_LON, (ORIGIN.lat - lat) * M_PER_LAT];

const frame = (() => {
  const [x0, y0] = project({ lat: FRAME.north, lon: FRAME.west });
  const [x1, y1] = project({ lat: FRAME.south, lon: FRAME.east });
  return { x0, y0, x1, y1 };
})();
// Воду и сады режем по рамке с запасом: края заливки уходят за рисунок, а не обрываются по нему.
const clipBox = { x0: frame.x0 - 200, y0: frame.y0 - 200, x1: frame.x1 + 200, y1: frame.y1 + 200 };

async function download() {
  fs.mkdirSync(cacheDir, { recursive: true });
  for (const url of MIRRORS) {
    try {
      process.stdout.write(`Скачиваю из ${url} … `);
      const response = await fetch(url, { method: "POST", body: new URLSearchParams({ data: QUERY }), signal: AbortSignal.timeout(240_000) });
      if (!response.ok) throw new Error(`ответ ${response.status}`);
      const text = await response.text();
      JSON.parse(text);
      fs.writeFileSync(rawFile, text);
      console.log(`${Math.round(text.length / 1024)} КБ`);
      return;
    } catch (error) {
      console.log(`не вышло: ${error.message}`);
    }
  }
  throw new Error("Ни одно зеркало OpenStreetMap не ответило.");
}

// --- Геометрия --------------------------------------------------------------------------------

const sameNode = (a, b) => a.lat === b.lat && a.lon === b.lon;

/** Собрать замкнутые кольца из кусков линий отношения: концы кусков совпадают. */
function assembleRings(lines) {
  const pool = lines.filter((line) => line.length > 1).map((line) => line.slice());
  const rings = [];
  while (pool.length) {
    let ring = pool.shift();
    for (let guard = 0; !sameNode(ring[0], ring[ring.length - 1]) && guard < 5000; guard += 1) {
      const end = ring[ring.length - 1];
      const index = pool.findIndex((line) => sameNode(line[0], end) || sameNode(line[line.length - 1], end));
      if (index < 0) break;
      let next = pool.splice(index, 1)[0];
      if (!sameNode(next[0], end)) next = next.reverse();
      ring = ring.concat(next.slice(1));
    }
    if (ring.length > 3 && sameNode(ring[0], ring[ring.length - 1])) rings.push(ring);
  }
  return rings;
}

/** Обрезать кольцо по прямоугольнику (Сазерленд — Ходжмен): для заливки этого достаточно. */
function clipRing(points, box) {
  const edges = [
    [(p) => p[0] >= box.x0, (a, b) => [box.x0, a[1] + ((b[1] - a[1]) * (box.x0 - a[0])) / (b[0] - a[0])]],
    [(p) => p[0] <= box.x1, (a, b) => [box.x1, a[1] + ((b[1] - a[1]) * (box.x1 - a[0])) / (b[0] - a[0])]],
    [(p) => p[1] >= box.y0, (a, b) => [a[0] + ((b[0] - a[0]) * (box.y0 - a[1])) / (b[1] - a[1]), box.y0]],
    [(p) => p[1] <= box.y1, (a, b) => [a[0] + ((b[0] - a[0]) * (box.y1 - a[1])) / (b[1] - a[1]), box.y1]],
  ];
  let output = points;
  for (const [inside, cross] of edges) {
    const input = output;
    output = [];
    for (let index = 0; index < input.length; index += 1) {
      const current = input[index];
      const previous = input[(index + input.length - 1) % input.length];
      if (inside(current)) {
        if (!inside(previous)) output.push(cross(previous, current));
        output.push(current);
      } else if (inside(previous)) {
        output.push(cross(previous, current));
      }
    }
    if (!output.length) break;
  }
  return output;
}

/** Обрезать ломаную по прямоугольнику: куски внутри рамки. */
function clipLine(points, box) {
  const inside = (p) => p[0] >= box.x0 && p[0] <= box.x1 && p[1] >= box.y0 && p[1] <= box.y1;
  const pieces = [];
  let current = [];
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    if (inside(point)) {
      if (!current.length && index > 0) current.push(edgePoint(points[index - 1], point, box));
      current.push(point);
    } else if (current.length) {
      current.push(edgePoint(point, current[current.length - 1], box));
      pieces.push(current);
      current = [];
    }
  }
  if (current.length > 1) pieces.push(current);
  return pieces.filter((piece) => piece.length > 1);
}

/** Где отрезок от точки снаружи к точке внутри пересекает рамку. */
function edgePoint(outside, inner, box) {
  let t = 0;
  const [ox, oy] = outside;
  const [ix, iy] = inner;
  const candidates = [];
  if (ox < box.x0) candidates.push((box.x0 - ix) / (ox - ix));
  if (ox > box.x1) candidates.push((box.x1 - ix) / (ox - ix));
  if (oy < box.y0) candidates.push((box.y0 - iy) / (oy - iy));
  if (oy > box.y1) candidates.push((box.y1 - iy) / (oy - iy));
  t = Math.min(...candidates.filter((value) => value >= 0 && value <= 1), 1);
  return [ix + (ox - ix) * t, iy + (oy - iy) * t];
}

/** Упрощение Дугласа — Пекера: убирает точки, которые отклоняют линию меньше чем на tolerance метров. */
function simplify(points, tolerance) {
  if (points.length < 3) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop();
    const [ax, ay] = points[first];
    const [bx, by] = points[last];
    const length = Math.hypot(bx - ax, by - ay) || 1;
    let worst = 0;
    let worstIndex = -1;
    for (let index = first + 1; index < last; index += 1) {
      const [px, py] = points[index];
      const distance = Math.abs((bx - ax) * (ay - py) - (ax - px) * (by - ay)) / length;
      if (distance > worst) {
        worst = distance;
        worstIndex = index;
      }
    }
    if (worst > tolerance && worstIndex > 0) {
      keep[worstIndex] = 1;
      stack.push([first, worstIndex], [worstIndex, last]);
    }
  }
  return points.filter((_, index) => keep[index]);
}

/** Замкнутое кольцо упрощается двумя половинами: от первой точки до самой дальней и обратно. */
function simplifyRing(ring, tolerance) {
  if (ring.length < 4) return ring;
  let far = 0;
  let best = -1;
  ring.forEach(([x, y], index) => {
    const distance = Math.hypot(x - ring[0][0], y - ring[0][1]);
    if (distance > best) {
      best = distance;
      far = index;
    }
  });
  const there = simplify(ring.slice(0, far + 1), tolerance);
  const back = simplify([...ring.slice(far), ring[0]], tolerance);
  return [...there.slice(0, -1), ...back.slice(0, -1)];
}

const area = (ring) => {
  let sum = 0;
  for (let index = 0; index < ring.length; index += 1) {
    const [ax, ay] = ring[index];
    const [bx, by] = ring[(index + 1) % ring.length];
    sum += ax * by - bx * ay;
  }
  return Math.abs(sum) / 2;
};

function insideRing([x, y], ring) {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
    const [ax, ay] = ring[index];
    const [bx, by] = ring[previous];
    if (ay > y !== by > y && x < ((bx - ax) * (y - ay)) / (by - ay) + ax) inside = !inside;
  }
  return inside;
}

const flat = (points) => points.flatMap(([x, y]) => [Math.round(x), Math.round(y)]);

/** Полигоны элемента: внешние кольца с их дырами, уже в метрах, обрезанные и упрощённые. */
function polygonsOf(element, tolerance) {
  let outers = [];
  let inners = [];
  if (element.type === "way") {
    if (element.geometry?.length > 3 && sameNode(element.geometry[0], element.geometry[element.geometry.length - 1])) outers = [element.geometry];
  } else {
    const members = (element.members ?? []).filter((member) => member.type === "way" && member.geometry);
    outers = assembleRings(members.filter((member) => member.role !== "inner").map((member) => member.geometry));
    inners = assembleRings(members.filter((member) => member.role === "inner").map((member) => member.geometry));
  }
  const prepare = (ring) => {
    const clipped = clipRing(ring.map(project), clipBox);
    return clipped.length > 2 ? simplifyRing(clipped, tolerance) : [];
  };
  const shapes = outers.map(prepare).filter((ring) => ring.length > 2).map((outer) => ({ outer, holes: [] }));
  for (const inner of inners.map(prepare).filter((ring) => ring.length > 2)) {
    const owner = shapes.find((shape) => insideRing(inner[0], shape.outer));
    if (owner) owner.holes.push(inner);
  }
  return shapes;
}

// --- Сборка -----------------------------------------------------------------------------------

function build(raw) {
  const water = [];
  const parks = [];
  const roadPieces = [];
  for (const element of raw.elements) {
    const tags = element.tags ?? {};
    if (tags.natural === "water" || tags.waterway === "riverbank") {
      for (const shape of polygonsOf(element, 6)) {
        if (area(shape.outer) < 2500) continue;
        water.push(shape);
      }
    } else if (tags.leisure === "park" || tags.leisure === "garden") {
      for (const shape of polygonsOf(element, 8)) {
        if (area(shape.outer) < 9000) continue;
        parks.push({ ...shape, name: tags.name ?? null, area: area(shape.outer) });
      }
    } else if (tags.highway && element.type === "way" && element.geometry) {
      const kind = tags.highway === "secondary" ? "s" : "p";
      const bridge = Boolean(tags.bridge && tags.bridge !== "no");
      for (const piece of clipLine(element.geometry.map(project), frame)) {
        roadPieces.push({ name: tags.name ?? "", kind, bridge, points: piece });
      }
    }
  }

  // Куски одной улицы склеиваются по общим концам: меньше линий, ровнее рисунок.
  const roads = [];
  const groups = new Map();
  for (const piece of roadPieces) {
    const key = `${piece.name}|${piece.kind}|${piece.bridge}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(piece.points);
  }
  const close = (a, b) => Math.abs(a[0] - b[0]) < 0.5 && Math.abs(a[1] - b[1]) < 0.5;
  for (const [key, lines] of groups) {
    const [name, kind, bridge] = key.split("|");
    const pool = lines.map((line) => line.slice());
    const merged = [];
    while (pool.length) {
      let line = pool.shift();
      for (let changed = true; changed; ) {
        changed = false;
        for (let index = 0; index < pool.length; index += 1) {
          const other = pool[index];
          if (close(line[line.length - 1], other[0])) line = line.concat(other.slice(1));
          else if (close(line[line.length - 1], other[other.length - 1])) line = line.concat(other.slice().reverse().slice(1));
          else if (close(line[0], other[other.length - 1])) line = other.concat(line.slice(1));
          else if (close(line[0], other[0])) line = other.slice().reverse().concat(line.slice(1));
          else continue;
          pool.splice(index, 1);
          changed = true;
          break;
        }
      }
      merged.push(flat(simplify(line, 4)));
    }
    roads.push({ name, kind, bridge: bridge === "true", lines: merged });
  }
  roads.sort((left, right) => (left.kind === right.kind ? left.name.localeCompare(right.name, "ru") : left.kind === "p" ? -1 : 1));

  const place = (item) => {
    const [x, y] = project(item);
    return { x: Math.round(x), y: Math.round(y) };
  };
  const wet = ([x, y]) => water.some((shape) => insideRing([x, y], shape.outer) && !shape.holes.some((hole) => insideRing([x, y], hole)));
  /** Подпись воды встаёт на ближайшую воду: поиск по расходящейся спирали с шагом 15 м. */
  const onWater = (item) => {
    const start = project(item);
    if (wet(start)) return place(item);
    for (let radius = 15; radius <= 900; radius += 15) {
      for (let step = 0; step < 24; step += 1) {
        const angle = (step / 24) * Math.PI * 2;
        const probe = [start[0] + Math.cos(angle) * radius, start[1] + Math.sin(angle) * radius];
        if (wet(probe)) return { x: Math.round(probe[0]), y: Math.round(probe[1]) };
      }
    }
    return place(item);
  };

  return {
    source: "© участники OpenStreetMap, ODbL — https://www.openstreetmap.org/copyright",
    origin: ORIGIN,
    metersPerDegree: { lat: Math.round(M_PER_LAT * 10) / 10, lon: Math.round(M_PER_LON * 10) / 10 },
    frame: { x: Math.round(frame.x0), y: Math.round(frame.y0), w: Math.round(frame.x1 - frame.x0), h: Math.round(frame.y1 - frame.y0) },
    water: water.map((shape) => [flat(shape.outer), ...shape.holes.map(flat)]),
    parks: parks
      .sort((left, right) => right.area - left.area)
      .map((shape) => ({ name: shape.name, rings: [flat(shape.outer), ...shape.holes.map(flat)] })),
    roads,
    landmarks: LANDMARKS.map((item) => ({ id: item.id, title: item.title, kind: item.kind, ...place(item) })),
    labels: LABELS.map((item) => ({ text: item.text, kind: item.kind, ...(item.kind === "district" ? place(item) : onWater(item)) })),
  };
}

if (process.argv.includes("--fetch") || !fs.existsSync(rawFile)) await download();
const raw = JSON.parse(fs.readFileSync(rawFile, "utf8"));
const map = build(raw);
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, `${JSON.stringify(map)}\n`);
const points = (rings) => rings.reduce((sum, ring) => sum + ring.length / 2, 0);
console.log(
  `Карта: вода ${map.water.length} (${points(map.water.flat())} точек), сады ${map.parks.length}, ` +
    `улицы ${map.roads.length} (${map.roads.reduce((sum, road) => sum + points(road.lines), 0)} точек), ` +
    `файл ${Math.round(fs.statSync(outFile).size / 1024)} КБ → ${path.relative(root, outFile)}`,
);
