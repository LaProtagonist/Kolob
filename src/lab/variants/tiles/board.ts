/**
 * Игровое поле «Плитки»: настоящий центр Петербурга, разрезанный на клетки по 110 м.
 * Сетка повёрнута вдоль Невского проспекта, поэтому главные улицы идут по клеткам ровно.
 * Клетка — вода, сад, улица, мост или квартал с домом; в изометрии клетка — ромб.
 * Здесь только геометрия рисунка; цифры сети приходят из story.
 */
import { city, inPark, insidePolygon, project, ringArea, type Box } from "../../shared/geo/geo";

/** Метров в клетке и половина клетки на экране в единицах рисунка. */
export const CELL = 110;
export const HW = 32;
export const HH = 16;
/** Толщина поля по краю: доска, на которой стоит город. */
export const SLAB = 18;

// Направление Невского: от Адмиралтейства к площади Восстания.
const [ax, ay] = project(59.938, 30.30777);
const [bx, by] = project(59.9316, 30.3604);
const angle = Math.atan2(by - ay, bx - ax);
const ux = Math.cos(angle);
const uy = Math.sin(angle);
const vx = -uy;
const vy = ux;

/** Метры карты → координаты сетки (дробные). */
export const toGrid = (x: number, y: number): [number, number] => [(x * ux + y * uy) / CELL, (x * vx + y * vy) / CELL];
/** Координаты сетки → метры карты. */
export const fromGrid = (gi: number, gj: number): [number, number] => [(gi * ux + gj * vx) * CELL, (gi * uy + gj * vy) * CELL];

export const isoX = (gi: number, gj: number) => (gi - gj) * HW;
export const isoY = (gi: number, gj: number, z = 0) => (gi + gj) * HH - z;
/** Метры карты → точка рисунка. */
export const toScene = (x: number, y: number): [number, number] => {
  const [gi, gj] = toGrid(x, y);
  return [isoX(gi, gj), isoY(gi, gj)];
};

const r = (value: number) => Math.round(value * 10) / 10;
/** Угол клетки в рисунке: «x y» для пути. */
export const at = (gi: number, gj: number, z = 0) => `${r(isoX(gi, gj))} ${r(isoY(gi, gj, z))}`;
export const diamond = (gi: number, gj: number, z = 0) => `M${at(gi, gj, z)}L${at(gi + 1, gj, z)}L${at(gi + 1, gj + 1, z)}L${at(gi, gj + 1, z)}Z`;

/** Три видимые грани бруска: верх, левая (смотрит вдоль gj) и правая (вдоль gi). */
export function box(x0: number, y0: number, x1: number, y1: number, h: number) {
  return {
    top: `M${at(x0, y0, h)}L${at(x1, y0, h)}L${at(x1, y1, h)}L${at(x0, y1, h)}Z`,
    left: `M${at(x0, y1, h)}L${at(x1, y1, h)}L${at(x1, y1)}L${at(x0, y1)}Z`,
    right: `M${at(x1, y0, h)}L${at(x1, y1, h)}L${at(x1, y1)}L${at(x1, y0)}Z`,
  };
}

/** Повторяемый шум клетки 0…1. */
export function noise(i: number, j: number, salt = 0) {
  let h = (i * 374761393 + j * 668265263 + salt * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export const Kind = { Outside: 0, Water: 1, Park: 2, Road: 3, Bridge: 4, Block: 5, Plaza: 6, Yard: 7 } as const;
export type Kind = (typeof Kind)[keyof typeof Kind];

/** Клетка дома: высота и цвет одни на весь квартал, поэтому квартал выглядит одним массивом. */
export type Building = { i: number; j: number; h: number; tone: number };
export type Tree = { gi: number; gj: number; size: number };

export type Board = {
  i0: number;
  j0: number;
  cols: number;
  rows: number;
  kinds: Uint8Array;
  kindAt: (i: number, j: number) => Kind;
  bounds: Box;
  buildings: Building[];
  trees: Tree[];
};

/** Узкая вода (каналы, протоки): средняя ширина меньше 90 м. Её клетки отмечаются вдоль берегов. */
function narrowWater() {
  return city.water.filter((polygon) => {
    const outer = polygon[0];
    let perimeter = 0;
    for (let index = 0; index < outer.length; index += 2) {
      const next = (index + 2) % outer.length;
      perimeter += Math.hypot(outer[next] - outer[index], outer[next + 1] - outer[index + 1]);
    }
    return (2 * ringArea(outer)) / Math.max(perimeter, 1) < 90;
  });
}

export function buildBoard(): Board {
  const frame = city.frame;
  const corners = [
    toGrid(frame.x, frame.y),
    toGrid(frame.x + frame.w, frame.y),
    toGrid(frame.x, frame.y + frame.h),
    toGrid(frame.x + frame.w, frame.y + frame.h),
  ];
  const i0 = Math.floor(Math.min(...corners.map(([gi]) => gi)));
  const j0 = Math.floor(Math.min(...corners.map(([, gj]) => gj)));
  const cols = Math.ceil(Math.max(...corners.map(([gi]) => gi))) - i0;
  const rows = Math.ceil(Math.max(...corners.map(([, gj]) => gj))) - j0;
  const kinds = new Uint8Array(cols * rows);
  const index = (i: number, j: number) => (i - i0) + (j - j0) * cols;
  const kindAt = (i: number, j: number): Kind => (i < i0 || j < j0 || i >= i0 + cols || j >= j0 + rows ? Kind.Outside : (kinds[index(i, j)] as Kind));
  const set = (i: number, j: number, kind: Kind) => {
    if (kindAt(i, j) !== Kind.Outside) kinds[index(i, j)] = kind;
  };

  // Рамки многоугольников воды: быстрый отсев перед точной проверкой.
  const waterBoxes = city.water.map((polygon) => {
    const outer = polygon[0];
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let k = 0; k < outer.length; k += 2) {
      minX = Math.min(minX, outer[k]);
      maxX = Math.max(maxX, outer[k]);
      minY = Math.min(minY, outer[k + 1]);
      maxY = Math.max(maxY, outer[k + 1]);
    }
    return { polygon, minX, minY, maxX, maxY };
  });
  const wet = (x: number, y: number) => waterBoxes.some((item) => x >= item.minX && x <= item.maxX && y >= item.minY && y <= item.maxY && insidePolygon(x, y, item.polygon));

  for (let j = j0; j < j0 + rows; j += 1) {
    for (let i = i0; i < i0 + cols; i += 1) {
      const [x, y] = fromGrid(i + 0.5, j + 0.5);
      if (x < frame.x || x > frame.x + frame.w || y < frame.y || y > frame.y + frame.h) continue;
      kinds[index(i, j)] = wet(x, y) ? Kind.Water : inPark(x, y) ? Kind.Park : Kind.Block;
    }
  }

  const walk = (line: number[], closed: boolean, mark: (i: number, j: number) => void) => {
    const count = line.length / 2;
    const segments = closed ? count : count - 1;
    for (let k = 0; k < segments; k += 1) {
      const ax2 = line[k * 2];
      const ay2 = line[k * 2 + 1];
      const bx2 = line[((k + 1) % count) * 2];
      const by2 = line[((k + 1) % count) * 2 + 1];
      const steps = Math.max(1, Math.ceil(Math.hypot(bx2 - ax2, by2 - ay2) / (CELL / 4)));
      for (let step = 0; step <= steps; step += 1) {
        const [gi, gj] = toGrid(ax2 + ((bx2 - ax2) * step) / steps, ay2 + ((by2 - ay2) * step) / steps);
        mark(Math.floor(gi), Math.floor(gj));
      }
    }
  };

  // Каналы уже клетки: их клетки отмечаются вдоль берегов, иначе Мойка и Грибоедова пропали бы.
  for (const polygon of narrowWater()) {
    walk(polygon[0], true, (i, j) => {
      if (kindAt(i, j) !== Kind.Outside) set(i, j, Kind.Water);
    });
  }

  for (const road of city.roads) {
    for (const line of road.lines) {
      walk(line, false, (i, j) => {
        const kind = kindAt(i, j);
        if (kind === Kind.Outside) return;
        if (kind === Kind.Water) {
          if (road.bridge) set(i, j, Kind.Bridge);
          return;
        }
        if (kind !== Kind.Bridge) set(i, j, Kind.Road);
      });
    }
  }

  // Площади вокруг достопримечательностей, шире спереди: силуэт рисуется поверх города,
  // и дом перед ним иначе оказался бы «за» силуэтом.
  for (const landmark of city.landmarks) {
    const [gi, gj] = toGrid(landmark.x, landmark.y);
    for (let dj = -1; dj <= 2; dj += 1) {
      for (let di = -1; di <= 2; di += 1) {
        const i = Math.floor(gi) + di;
        const j = Math.floor(gj) + dj;
        if (kindAt(i, j) === Kind.Block || kindAt(i, j) === Kind.Road) set(i, j, Kind.Plaza);
      }
    }
  }

  // Кварталы — связные куски клеток-домов между улицами, водой и садами. Высота и цвет на квартал одни:
  // петербургская застройка ровная, и город читается массивами, а не россыпью кубиков.
  const region = new Int32Array(cols * rows).fill(-1);
  const regions: Array<{ cells: number; h: number; tone: number }> = [];
  for (let j = j0; j < j0 + rows; j += 1) {
    for (let i = i0; i < i0 + cols; i += 1) {
      if (kindAt(i, j) !== Kind.Block || region[index(i, j)] >= 0) continue;
      const id = regions.length;
      const stack: Array<[number, number]> = [[i, j]];
      region[index(i, j)] = id;
      let cells = 0;
      while (stack.length) {
        const [ci, cj] = stack.pop()!;
        cells += 1;
        for (const [ni, nj] of [[ci + 1, cj], [ci - 1, cj], [ci, cj + 1], [ci, cj - 1]] as const) {
          if (kindAt(ni, nj) === Kind.Block && region[index(ni, nj)] < 0) {
            region[index(ni, nj)] = id;
            stack.push([ni, nj]);
          }
        }
      }
      regions.push({ cells, h: 22 + Math.floor(noise(i, j, 11) * 3) * 6, tone: Math.floor(noise(i, j, 12) * 4) });
    }
  }
  // Дворы-колодцы: клетка внутри большого квартала, окружённая домами со всех сторон, — двор.
  for (let j = j0; j < j0 + rows; j += 1) {
    for (let i = i0; i < i0 + cols; i += 1) {
      if (kindAt(i, j) !== Kind.Block) continue;
      const id = region[index(i, j)];
      if (regions[id].cells < 9) continue;
      const inner = [[i + 1, j], [i - 1, j], [i, j + 1], [i, j - 1]].every(([ni, nj]) => kindAt(ni, nj) === Kind.Block || kindAt(ni, nj) === Kind.Yard);
      if (inner && noise(i, j, 13) < 0.55) set(i, j, Kind.Yard);
    }
  }

  const buildings: Building[] = [];
  const trees: Tree[] = [];
  for (let j = j0; j < j0 + rows; j += 1) {
    for (let i = i0; i < i0 + cols; i += 1) {
      const kind = kindAt(i, j);
      if (kind === Kind.Block) {
        const owner = regions[region[index(i, j)]];
        buildings.push({ i, j, h: owner.h, tone: owner.tone });
      } else if (kind === Kind.Yard) {
        if (noise(i, j, 14) > 0.5) trees.push({ gi: i + 0.5, gj: j + 0.5, size: 0.7 });
      } else if (kind === Kind.Park) {
        trees.push({ gi: i + 0.3 + noise(i, j, 4) * 0.4, gj: j + 0.3 + noise(i, j, 5) * 0.4, size: 0.8 + noise(i, j, 6) * 0.4 });
        if (noise(i, j, 7) > 0.5) trees.push({ gi: i + 0.15 + noise(i, j, 8) * 0.7, gj: j + 0.15 + noise(i, j, 9) * 0.7, size: 0.6 + noise(i, j, 10) * 0.3 });
      }
    }
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let j = j0; j < j0 + rows; j += 1) {
    for (let i = i0; i < i0 + cols; i += 1) {
      if (kindAt(i, j) === Kind.Outside) continue;
      minX = Math.min(minX, isoX(i, j + 1));
      maxX = Math.max(maxX, isoX(i + 1, j));
      minY = Math.min(minY, isoY(i, j) - 60);
      maxY = Math.max(maxY, isoY(i + 1, j + 1) + SLAB);
    }
  }

  return { i0, j0, cols, rows, kinds, kindAt, bounds: { x: minX, y: minY, w: maxX - minX, h: maxY - minY }, buildings, trees };
}
