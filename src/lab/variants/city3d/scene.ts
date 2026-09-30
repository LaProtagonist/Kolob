/**
 * Объёмная сцена варианта «Город в 3D». Единственный файл, который подключает three:
 * он загружается динамическим import() из CityStage, поэтому библиотека не попадает в остальной сайт.
 *
 * Кадр рисуется только когда что-то меняется — камера, рост здания, тема или размер окна.
 * В покое сцена не тратит ни процессор, ни батарею.
 */
import {
  BoxGeometry,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  Float32BufferAttribute,
  Group,
  HemisphereLight,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Object3D,
  PerspectiveCamera,
  RingGeometry,
  Scene,
  Shape,
  ShapeGeometry,
  SphereGeometry,
  Vector3,
  WebGLRenderer,
  type Material,
} from "three";
import { WORLD, banks, cityFiller, place, planLabels, roads, settle, waterAreas, type P } from "./plan";

export type CityPoint = {
  id: string;
  /** Место на условной карте, доли от 0 до 1. */
  x: number;
  y: number;
  areaM2: number | null;
  /** Выручка точки в месяц — задаёт высоту здания. */
  revenueRub: number | null;
  base: boolean;
  hall: boolean;
  staffOnShift: number;
  openingMonth: number;
};

export type CityOptions = {
  stage: HTMLElement;
  canvas: HTMLCanvasElement;
  onSelect: (id: string | null) => void;
};

export type CityHandle = {
  setPoints: (points: CityPoint[]) => void;
  setMonth: (month: number) => void;
  setSelected: (id: string | null) => void;
  zoomBy: (factor: number) => void;
  /** Следующий из трёх наклонов камеры: сбоку, под углом, сверху. */
  tilt: () => void;
  resetView: () => void;
  /** Подписи изменили текст или размер — измерить заново. */
  refreshLabels: () => void;
  dispose: () => void;
};

// Названия переменных стиля --city-*; значения для обеих тем заданы в city3d.css.
const tones = [
  "land", "soil", "water", "bank", "road", "block-1", "block-2", "block-3", "tree", "trunk", "hall", "takeaway",
  "annex", "roof", "door", "window", "lot", "chimney", "select", "person", "pulse",
] as const;
type Tone = (typeof tones)[number];

type View = { azimuth: number; elevation: number; zoom: number; x: number; y: number; z: number };
const viewKeys = ["azimuth", "elevation", "zoom", "x", "y", "z"] as const;
const homeView = { azimuth: -0.36, elevation: 0.56 };
const tiltSteps = [0.32, 0.56, 1.15];
const zoomRange = { min: 0.3, max: 1.3 };
const elevationRange = { min: 0.2, max: 1.36 };

const growSeconds = 0.65;
const pulseSeconds = 0.9;

type Building = {
  point: CityPoint;
  at: P;
  side: number;
  /** Высота стен и высота вместе с крышей. */
  height: number;
  top: number;
  root: Group;
  grow: Group;
  tower: Group;
  pad: Mesh;
  /** Ширина и глубина цоколя открытой точки; участок до открытия чуть меньше и ниже. */
  padSize: [number, number];
  frame: Mesh;
  pulse: Mesh;
  pulseMaterial: MeshBasicMaterial;
  pulseAt: number;
  instanced: InstancedMesh[];
  open: boolean;
  /** Доля роста от 0 до 1 и момент, раньше которого рост не начинается. */
  progress: number;
  startAt: number;
  /** Растяжение по высоте при смене сценария: плавный переход от прежней высоты к новой. */
  stretch: number;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function easeOutBack(t: number) {
  const overshoot = 1.70158;
  return 1 + (overshoot + 1) * Math.pow(t - 1, 3) + overshoot * Math.pow(t - 1, 2);
}

/** Плоская лента вдоль линии: дорога или набережная. */
function ribbon(line: P[], width: number, y: number) {
  const positions: number[] = [];
  const normals: number[] = [];
  const index: number[] = [];
  line.forEach((point, order) => {
    const before = line[Math.max(order - 1, 0)];
    const after = line[Math.min(order + 1, line.length - 1)];
    const length = Math.hypot(after.x - before.x, after.z - before.z) || 1;
    const dx = ((after.x - before.x) / length) * (width / 2);
    const dz = ((after.z - before.z) / length) * (width / 2);
    positions.push(point.x - dz, y, point.z + dx, point.x + dz, y, point.z - dx);
    normals.push(0, 1, 0, 0, 1, 0);
    if (order > 0) {
      const k = (order - 1) * 2;
      index.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
    }
  });
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new Float32BufferAttribute(normals, 3));
  geometry.setIndex(index);
  return geometry;
}

export function createCity({ stage, canvas, onSelect }: CityOptions): CityHandle {
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.shadowMap.enabled = true;
  // Тени пересчитываются только когда меняются здания: поворот камеры их не трогает.
  renderer.shadowMap.autoUpdate = false;

  const scene = new Scene();
  const camera = new PerspectiveCamera(30, 1, 1, 900);
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const coarsePointer = window.matchMedia("(pointer: coarse)");
  const darkScheme = window.matchMedia("(prefers-color-scheme: dark)");

  // --- Краски: по одному материалу на переменную стиля ---------------------------------------
  const paint = {} as Record<Tone, Material>;
  for (const tone of tones) {
    paint[tone] = tone === "window" || tone === "pulse"
      ? new MeshBasicMaterial({ color: "#888888" })
      : new MeshLambertMaterial({ color: "#888888", flatShading: true });
  }
  paint.lot.transparent = true;
  paint.lot.opacity = 0.6;
  const blockPaint = new MeshLambertMaterial({ color: "#ffffff", flatShading: true });
  const blockColors = [new Color(), new Color(), new Color()];

  const sky = new HemisphereLight("#ffffff", "#ffffff", 1.55);
  const sun = new DirectionalLight("#ffffff", 2.05);
  sun.position.set(-46, 78, 52);
  sun.castShadow = true;
  sun.shadow.camera.left = -66;
  sun.shadow.camera.right = 66;
  sun.shadow.camera.top = 66;
  sun.shadow.camera.bottom = -66;
  sun.shadow.camera.near = 10;
  sun.shadow.camera.far = 240;
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.35;
  scene.add(sky, sun);

  // --- Общие формы: здания собираются из них масштабом, без новых геометрий на каждую точку ---
  const unitBox = new BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const pyramid = new ConeGeometry(Math.SQRT1_2, 1, 4).rotateY(Math.PI / 4).translate(0, 0.5, 0);
  const crown = new SphereGeometry(1, 6, 4).translate(0, 1.55, 0);
  const trunk = new CylinderGeometry(0.12, 0.16, 0.9, 5).translate(0, 0.45, 0);
  const personBody = new CylinderGeometry(0.15, 0.24, 0.74, 6).translate(0, 0.37, 0);
  const personHead = new SphereGeometry(0.2, 6, 5).translate(0, 0.94, 0);
  const ring = new RingGeometry(0.8, 1, 36).rotateX(-Math.PI / 2);
  const ownGeometries: BufferGeometry[] = [unitBox, pyramid, crown, trunk, personBody, personHead, ring];

  // --- Неподвижная часть города: плита, вода, набережные, улицы, кварталы, деревья ------------
  const groundGeometry = new BoxGeometry(WORLD.width, 3, WORLD.depth);
  ownGeometries.push(groundGeometry);
  const ground = new Mesh(groundGeometry, [paint.soil, paint.soil, paint.land, paint.soil, paint.soil, paint.soil]);
  ground.position.y = -1.5;
  ground.receiveShadow = true;
  scene.add(ground);

  for (const area of waterAreas) {
    const outline = new Shape();
    area.forEach((point, order) => (order ? outline.lineTo(point.x, -point.z) : outline.moveTo(point.x, -point.z)));
    const geometry = new ShapeGeometry(outline).rotateX(-Math.PI / 2);
    ownGeometries.push(geometry);
    const water = new Mesh(geometry, paint.water);
    water.position.y = 0.05;
    water.receiveShadow = true;
    scene.add(water);
  }
  for (const line of banks) {
    const geometry = ribbon(line, 0.7, 0.09);
    ownGeometries.push(geometry);
    scene.add(new Mesh(geometry, paint.bank));
  }
  for (const road of roads) {
    const geometry = ribbon(road.line, road.width, 0.13);
    ownGeometries.push(geometry);
    const mesh = new Mesh(geometry, paint.road);
    mesh.receiveShadow = true;
    scene.add(mesh);
  }

  const filler = cityFiller();
  const dummy = new Object3D();
  const blocks = new InstancedMesh(unitBox, blockPaint, filler.blocks.length);
  blocks.castShadow = true;
  blocks.receiveShadow = true;
  const crowns = new InstancedMesh(crown, paint.tree, filler.trees.length);
  crowns.castShadow = true;
  const trunks = new InstancedMesh(trunk, paint.trunk, filler.trees.length);
  scene.add(blocks, crowns, trunks);

  /** Фоновые дома и деревья уступают место зданиям сети: рядом с точкой они прячутся. */
  function placeFiller(taken: (P & { radius: number })[]) {
    const free = (x: number, z: number, radius: number) => taken.every((spot) => Math.hypot(spot.x - x, spot.z - z) > spot.radius + radius + 1.1);
    filler.blocks.forEach((block, order) => {
      const show = free(block.x, block.z, block.radius);
      dummy.position.set(block.x, 0, block.z);
      dummy.scale.set(show ? block.width : 0, show ? block.height : 0, show ? block.depth : 0);
      dummy.updateMatrix();
      blocks.setMatrixAt(order, dummy.matrix);
    });
    filler.trees.forEach((tree, order) => {
      const size = free(tree.x, tree.z, 1) ? tree.size : 0;
      dummy.position.set(tree.x, 0, tree.z);
      dummy.scale.set(size, size, size);
      dummy.updateMatrix();
      crowns.setMatrixAt(order, dummy.matrix);
      trunks.setMatrixAt(order, dummy.matrix);
    });
    blocks.instanceMatrix.needsUpdate = true;
    crowns.instanceMatrix.needsUpdate = true;
    trunks.instanceMatrix.needsUpdate = true;
  }

  // --- Состояние ------------------------------------------------------------------------------
  let buildings: Building[] = [];
  let month = 0;
  let selectedId: string | null = null;
  let hoverId: string | null = null;
  /** Сколько рублей выручки приходится на единицу высоты; фиксируется по первому расчёту. */
  let rubPerUnit = 0;
  let introDone = false;
  let shadowsStale = true;

  const home: View = { ...homeView, zoom: 1, x: 0, y: 2, z: 0 };
  const view: View = { ...home, azimuth: home.azimuth - 0.55 };
  const goal: View = { ...home };
  let fitDistance = 150;
  let easing = 2.4;
  let width = 1;
  let height = 1;

  let raf = 0;
  let lastFrame = 0;
  let frames = 0;
  let onScreen = true;
  let disposed = false;

  function invalidate() {
    if (!raf && !disposed && onScreen) raf = requestAnimationFrame(frame);
  }

  // --- Цвета из стиля: одна и та же сцена в светлой и тёмной теме ------------------------------
  function applyPalette() {
    const style = getComputedStyle(stage);
    const read = (tone: Tone) => style.getPropertyValue(`--city-${tone}`).trim() || "#888888";
    for (const tone of tones) paint[tone].color.set(read(tone));
    blockColors.forEach((color, order) => color.set(read(`block-${order + 1}` as Tone)));
    filler.blocks.forEach((block, order) => blocks.setColorAt(order, blockColors[block.tone]));
    if (blocks.instanceColor) blocks.instanceColor.needsUpdate = true;
    sky.groundColor.set(read("land"));
    for (const building of buildings) building.pulseMaterial.color.set(read("pulse"));
    invalidate();
  }

  // --- Здания точек сети ------------------------------------------------------------------------
  function part(parent: Object3D, material: Material, size: [number, number, number], at: [number, number, number], geometry: BufferGeometry = unitBox) {
    const mesh = new Mesh(geometry, material);
    mesh.scale.set(...size);
    mesh.position.set(...at);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  function windowsFor(side: number, wall: number) {
    const columns = Math.max(1, Math.floor((side - 0.9) / 1.05));
    const rows = Math.floor((wall - 1.45) / 1.4) + 1;
    const span = side - 1.1;
    const mesh = new InstancedMesh(unitBox, paint.window, columns * rows * 4);
    let count = 0;
    for (let face = 0; face < 4; face += 1) {
      for (let row = 0; row < rows; row += 1) {
        for (let column = 0; column < columns; column += 1) {
          const across = columns > 1 ? -span / 2 + (column * span) / (columns - 1) : 0;
          const up = wall - 0.95 - row * 1.4;
          // Над дверью и навесом окон нет.
          if (face === 0 && up < 1.75 && Math.abs(across) < 1.1) continue;
          const out = (face % 2 ? -1 : 1) * (side / 2);
          if (face < 2) {
            dummy.position.set(across, up, out);
            dummy.scale.set(0.52, 0.68, 0.1);
          } else {
            dummy.position.set(out, up, across);
            dummy.scale.set(0.1, 0.68, 0.52);
          }
          dummy.updateMatrix();
          mesh.setMatrixAt(count, dummy.matrix);
          count += 1;
        }
      }
    }
    mesh.count = count;
    return mesh;
  }

  function peopleFor(side: number, count: number) {
    const bodies = new InstancedMesh(personBody, paint.person, count);
    const heads = new InstancedMesh(personHead, paint.person, count);
    for (let order = 0; order < count; order += 1) {
      dummy.position.set((order - (count - 1) / 2) * 0.72, 0, side / 2 + 1.25);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      bodies.setMatrixAt(order, dummy.matrix);
      heads.setMatrixAt(order, dummy.matrix);
    }
    bodies.castShadow = true;
    return [bodies, heads];
  }

  const sideOf = (point: CityPoint) => clamp(2.9 + Math.sqrt(point.areaM2 ?? 30) * 0.2, 3.6, 5.8);
  const heightOf = (point: CityPoint) => clamp(2.4 + (rubPerUnit && point.revenueRub ? point.revenueRub / rubPerUnit : 0), 2.4, 22);

  function build(point: CityPoint, at: P): Building {
    const side = sideOf(point);
    const wall = heightOf(point);
    const roofHeight = point.hall ? side * 0.42 : 0.78;
    const root = new Group();
    root.position.set(at.x, 0, at.z);

    // Участок виден всегда: до открытия — как отведённое место, после — как цоколь здания.
    const annexWidth = point.base ? side * 0.8 : 0;
    const padWidth = side + 1.6 + annexWidth;
    const padShift = -annexWidth / 2;
    const frameMesh = part(root, paint.select, [padWidth + 0.9, 0.2, side + 2.5], [padShift, 0, 0]);
    frameMesh.castShadow = false;
    frameMesh.visible = false;
    const pad = part(root, paint.lot, [padWidth, 0.34, side + 1.6], [padShift, 0, 0]);
    pad.castShadow = false;

    const grow = new Group();
    grow.position.y = 0.34;
    const tower = new Group();
    grow.add(tower);
    root.add(grow);

    part(tower, point.hall ? paint.hall : paint.takeaway, [side, wall, side], [0, 0, 0]);
    const windows = windowsFor(side, wall);
    tower.add(windows);
    if (point.hall) {
      part(tower, paint.roof, [side + 0.6, roofHeight, side + 0.6], [0, wall, 0], pyramid);
    } else {
      part(tower, paint.roof, [side + 0.5, 0.28, side + 0.5], [0, wall, 0]);
      part(tower, paint.roof, [0.9, 0.5, 0.9], [side * 0.18, wall + 0.28, -side * 0.18]);
    }

    part(grow, paint.door, [0.9, 1.25, 0.12], [0, 0, side / 2]);
    part(grow, paint.roof, [point.hall ? 1.9 : side * 0.86, 0.12, 0.8], [0, 1.45, side / 2 + 0.34]);
    if (point.base) {
      // Заготовочное производство при первой точке: пристройка с трубой.
      const annexAt = -side / 2 - annexWidth / 2;
      part(grow, paint.annex, [annexWidth, 1.9, side * 0.9], [annexAt, 0, 0]);
      part(grow, paint.roof, [annexWidth + 0.3, 0.2, side * 0.9 + 0.3], [annexAt, 1.9, 0]);
      part(grow, paint.chimney, [0.62, 3.3, 0.62], [annexAt - annexWidth * 0.18, 2.1, -side * 0.2]);
    }
    const people = peopleFor(side, clamp(point.staffOnShift, 0, 6));
    grow.add(...people);

    const pulseMaterial = new MeshBasicMaterial({ color: "#888888", transparent: true, opacity: 0, depthWrite: false });
    pulseMaterial.color.set(paint.pulse.color);
    const pulse = new Mesh(ring, pulseMaterial);
    pulse.position.y = 0.4;
    pulse.visible = false;
    root.add(pulse);

    return {
      point, at, side, height: wall, top: wall + roofHeight, root, grow, tower, pad, padSize: [padWidth, side + 1.6], frame: frameMesh, pulse, pulseMaterial,
      pulseAt: -1, instanced: [windows, ...people], open: false, progress: 0, startAt: 0, stretch: 1,
    };
  }

  function applyGrowth(building: Building) {
    const eased = building.progress >= 1 ? 1 : easeOutBack(building.progress);
    const spread = 0.55 + 0.45 * Math.min(eased, 1);
    building.grow.visible = building.progress > 0;
    building.grow.scale.set(spread, Math.max(eased, 0.001), spread);
    building.tower.scale.y = building.stretch;
    const started = building.progress > 0;
    const [padWidth, padDepth] = building.padSize;
    building.pad.material = started ? paint.bank : paint.lot;
    building.pad.scale.set(started ? padWidth : padWidth - 1, started ? 0.34 : 0.14, started ? padDepth : padDepth - 1);
    building.frame.visible = building.point.id === selectedId;
  }

  /** Высота, до которой здание видно сейчас: к ней привязаны подпись и выбор нажатием. */
  const shownTop = (building: Building) => 0.34 + building.top * building.stretch * clamp(building.progress, 0, 1);

  function setPoints(points: CityPoint[]) {
    if (!rubPerUnit) {
      const peak = Math.max(0, ...points.map((point) => point.revenueRub ?? 0));
      if (peak > 0) rubPerUnit = peak / 7.6;
    }
    const before = new Map(buildings.map((building) => [building.point.id, building]));
    for (const building of buildings) {
      scene.remove(building.root);
      building.pulseMaterial.dispose();
      building.instanced.forEach((mesh) => mesh.dispose());
    }
    const spots = points.map((point) => ({ ...place(point.x, point.y), radius: sideOf(point) * (point.base ? 0.95 : 0.72) }));
    const settled = settle(spots);
    const now = performance.now();
    buildings = points.map((point, order) => {
      const building = build(point, settled[order]);
      const previous = before.get(point.id);
      building.open = point.openingMonth <= month;
      if (previous) {
        building.progress = previous.progress;
        building.stretch = reducedMotion.matches ? 1 : (previous.height * previous.stretch) / building.height;
      } else if (reducedMotion.matches) {
        building.progress = building.open ? 1 : 0;
      } else if (!introDone) {
        // Первое появление: здания вырастают по очереди, в порядке открытия.
        building.startAt = now + 350 + order * 90;
      }
      applyGrowth(building);
      scene.add(building.root);
      return building;
    });
    introDone = true;
    placeFiller(settled.map((at, order) => ({ ...at, radius: spots[order].radius })));
    if (selectedId && !buildings.some((building) => building.point.id === selectedId)) selectedId = null;
    focusSelected();
    shadowsStale = true;
    labelSizes.clear();
    invalidate();
  }

  function setMonth(next: number) {
    month = next;
    const now = performance.now();
    for (const building of buildings) {
      const open = building.point.openingMonth <= month;
      if (open === building.open) continue;
      building.open = open;
      building.startAt = 0;
      if (reducedMotion.matches) {
        building.progress = open ? 1 : 0;
        applyGrowth(building);
        shadowsStale = true;
      } else if (open) {
        building.pulseAt = now;
      }
    }
    invalidate();
  }

  function stepBuildings(now: number, dt: number) {
    let active = false;
    for (const building of buildings) {
      const target = building.open ? 1 : 0;
      let changed = false;
      if (building.progress !== target) {
        active = true;
        if (now >= building.startAt) {
          const step = dt / growSeconds;
          building.progress = target > building.progress ? Math.min(1, building.progress + step) : Math.max(0, building.progress - step * 1.5);
          changed = true;
        }
      }
      if (building.stretch !== 1) {
        const rest = 1 - building.stretch;
        building.stretch = Math.abs(rest) < 0.004 ? 1 : building.stretch + rest * (1 - Math.exp(-dt * 7));
        active = true;
        changed = true;
      }
      if (changed) {
        applyGrowth(building);
        shadowsStale = true;
      }
      if (building.pulseAt >= 0) {
        const t = (now - building.pulseAt) / (pulseSeconds * 1000);
        if (t >= 1) {
          building.pulseAt = -1;
          building.pulse.visible = false;
        } else {
          const size = building.side * (0.9 + 1.9 * t);
          building.pulse.visible = true;
          building.pulse.scale.set(size, 1, size);
          building.pulseMaterial.opacity = 0.75 * (1 - t);
          active = true;
        }
      }
    }
    return active;
  }

  // --- Камера -----------------------------------------------------------------------------------
  function focusSelected() {
    const building = buildings.find((item) => item.point.id === selectedId);
    goal.x = building ? building.at.x : home.x;
    goal.z = building ? building.at.z : home.z;
    goal.y = building ? Math.min(building.top * 0.45, 5) : home.y;
  }

  function stepCamera(dt: number) {
    const blend = reducedMotion.matches ? 1 : 1 - Math.exp(-dt * easing);
    let active = false;
    for (const key of viewKeys) {
      const rest = goal[key] - view[key];
      if (Math.abs(rest) > 0.0015) {
        view[key] += rest * blend;
        active = blend < 1;
      } else {
        view[key] = goal[key];
      }
    }
    if (!active) easing = 14;
    return active;
  }

  function aim(from: View, distance: number) {
    const flat = Math.cos(from.elevation) * distance;
    camera.position.set(from.x + Math.sin(from.azimuth) * flat, from.y + Math.sin(from.elevation) * distance, from.z + Math.cos(from.azimuth) * flat);
    camera.lookAt(from.x, from.y, from.z);
    camera.updateMatrixWorld();
  }

  const placeCamera = () => aim(view, fitDistance * view.zoom);

  const probe = new Vector3();

  /**
   * Расстояние, с которого плита города целиком помещается в окно при исходном повороте.
   * Заодно кадр сдвигается по вертикали, чтобы город стоял посередине окна: ось поворота при этом
   * остаётся в центре плиты.
   */
  function fitHome() {
    camera.setViewOffset(width, height, 0, 0, width, height);
    const measure = (distance: number) => {
      aim(home, distance);
      let wide = 0;
      let top = -Infinity;
      let bottom = Infinity;
      for (const x of [-WORLD.width / 2, WORLD.width / 2]) {
        for (const z of [-WORLD.depth / 2, WORLD.depth / 2]) {
          for (const y of [-3, 9]) {
            probe.set(x, y, z).project(camera);
            wide = Math.max(wide, Math.abs(probe.x));
            top = Math.max(top, probe.y);
            bottom = Math.min(bottom, probe.y);
          }
        }
      }
      return { wide, tall: (top - bottom) / 2, middle: (top + bottom) / 2 };
    };
    let near = 40;
    let far = 600;
    for (let round = 0; round < 14; round += 1) {
      const middle = (near + far) / 2;
      const fit = measure(middle);
      if (fit.wide <= 0.97 && fit.tall <= 0.8) far = middle;
      else near = middle;
    }
    camera.setViewOffset(width, height, 0, Math.round((-measure(far).middle * height) / 2), width, height);
    return far;
  }

  function toScreen(x: number, y: number, z: number) {
    probe.set(x, y, z).project(camera);
    return { x: (probe.x * 0.5 + 0.5) * width, y: (-probe.y * 0.5 + 0.5) * height, depth: probe.z };
  }

  /** Здание под указателем: ближайшее к нажатию по отрезку «основание — крыша». */
  function pick(clientX: number, clientY: number) {
    const box = stage.getBoundingClientRect();
    const x = clientX - box.left;
    const y = clientY - box.top;
    const reach = coarsePointer.matches ? 16 : 8;
    let found: string | null = null;
    let best = Infinity;
    for (const building of buildings) {
      const foot = toScreen(building.at.x, 0, building.at.z);
      if (foot.depth > 1) continue;
      const head = toScreen(building.at.x, shownTop(building), building.at.z);
      const edge = toScreen(building.at.x + Math.cos(view.azimuth) * building.side * 0.6, 0, building.at.z - Math.sin(view.azimuth) * building.side * 0.6);
      const dx = head.x - foot.x;
      const dy = head.y - foot.y;
      const t = clamp(((x - foot.x) * dx + (y - foot.y) * dy) / (dx * dx + dy * dy || 1), 0, 1);
      const distance = Math.hypot(x - (foot.x + dx * t), y - (foot.y + dy * t));
      const allowed = Math.hypot(edge.x - foot.x, edge.y - foot.y) + reach;
      if (distance <= allowed && distance + foot.depth * 40 < best) {
        best = distance + foot.depth * 40;
        found = building.point.id;
      }
    }
    return found;
  }

  // --- Подписи: обычные элементы страницы поверх сцены, положение задаётся после каждого кадра --
  type Box = { l: number; t: number; r: number; b: number };
  let labels = new Map<string, HTMLElement>();
  const labelSizes = new Map<HTMLElement, { w: number; h: number }>();
  /** Места, занятые кнопками и пояснениями: подписи под них не заходят. */
  let reserved: Box[] = [];

  function refreshLabels() {
    labels = new Map(Array.from(stage.querySelectorAll<HTMLElement>("[data-city-label]"), (element) => [element.dataset.cityLabel ?? "", element]));
    labelSizes.clear();
    const frame = stage.getBoundingClientRect();
    reserved = Array.from(stage.querySelectorAll<HTMLElement>("[data-city-reserved]"), (element) => {
      const box = element.getBoundingClientRect();
      return { l: box.left - frame.left, t: box.top - frame.top, r: box.right - frame.left, b: box.bottom - frame.top };
    });
    invalidate();
  }

  function layoutLabels() {
    const queue: { element: HTMLElement; x: number; y: number; depth: number; rank: number }[] = [];
    const seen = new Set<HTMLElement>();
    const add = (id: string, x: number, y: number, z: number, rank: number) => {
      const element = labels.get(id);
      if (!element) return;
      seen.add(element);
      const spot = toScreen(x, y, z);
      if (spot.depth > 1) element.style.visibility = "hidden";
      else queue.push({ element, ...spot, rank });
    };
    for (const building of buildings) {
      const id = building.point.id;
      add(id, building.at.x, shownTop(building) + 1.2, building.at.z, id === selectedId ? 0 : id === hoverId ? 1 : building.open ? 2 : 3);
    }
    for (const label of planLabels) add(label.id, label.at.x, 0.4, label.at.z, 4);
    for (const element of labels.values()) if (!seen.has(element)) element.style.visibility = "hidden";

    queue.sort((a, b) => a.rank - b.rank || a.depth - b.depth);
    const placed: Box[] = [...reserved];
    for (const item of queue) {
      let size = labelSizes.get(item.element);
      if (!size) {
        size = { w: item.element.offsetWidth, h: item.element.offsetHeight };
        labelSizes.set(item.element, size);
      }
      const left = clamp(item.x - size.w / 2, 4, Math.max(4, width - size.w - 4));
      const top = item.y - size.h;
      const box = { l: left - 3, t: top - 2, r: left + size.w + 3, b: top + size.h + 2 };
      const hidden = top < 2 || box.b > height - 2 || placed.some((other) => box.l < other.r && box.r > other.l && box.t < other.b && box.b > other.t);
      item.element.style.visibility = hidden ? "hidden" : "visible";
      if (hidden) continue;
      item.element.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
      placed.push(box);
    }
  }

  // --- Кадр -------------------------------------------------------------------------------------
  function frame(now: number) {
    raf = 0;
    const dt = lastFrame ? Math.min(0.05, (now - lastFrame) / 1000) : 1 / 60;
    lastFrame = now;
    const moving = stepCamera(dt);
    const growing = stepBuildings(now, dt);
    placeCamera();
    if (shadowsStale) {
      renderer.shadowMap.needsUpdate = true;
      shadowsStale = false;
    }
    renderer.render(scene, camera);
    layoutLabels();
    frames += 1;
    canvas.dataset.frames = String(frames);
    if (moving || growing) invalidate();
    else lastFrame = 0;
  }

  function resize() {
    width = Math.max(1, stage.clientWidth);
    height = Math.max(1, stage.clientHeight);
    const narrow = width < 700;
    // Плотность пикселей ограничена: на экранах телефонов с тройной плотностью холст вдвое легче,
    // а подписи остаются чёткими — это обычный текст поверх сцены.
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height, false);
    sun.shadow.mapSize.set(narrow ? 1024 : 2048, narrow ? 1024 : 2048);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    refreshLabels();
    const homeZoom = camera.aspect < 1.25 ? 0.7 : 1;
    fitDistance = fitHome();
    if (goal.zoom === home.zoom) goal.zoom = view.zoom = homeZoom;
    home.zoom = homeZoom;
    invalidate();
  }

  // --- Управление: поворот, масштаб, выбор --------------------------------------------------------
  const pointers = new Map<number, { x: number; y: number }>();
  let gesture: { x: number; y: number; at: number; moved: boolean; onLabel: boolean } | null = null;
  let pinch = 0;
  let engaged = false;
  const isControl = (target: EventTarget | null) => target instanceof Element && target.closest("[data-city-control]") !== null;
  const pinchDistance = () => {
    const [a, b] = [...pointers.values()];
    return Math.hypot(a.x - b.x, a.y - b.y) || 1;
  };
  const capture = (id: number) => {
    try {
      stage.setPointerCapture(id);
    } catch {
      // Указатель уже отпущен — захватывать нечего.
    }
  };
  const setZoom = (value: number) => {
    goal.zoom = clamp(value, zoomRange.min, zoomRange.max);
    invalidate();
  };

  function onPointerDown(event: PointerEvent) {
    if (isControl(event.target)) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    easing = 14;
    if (event.pointerType === "mouse") engaged = true;
    if (pointers.size === 1) {
      gesture = { x: event.clientX, y: event.clientY, at: event.timeStamp, moved: false, onLabel: event.target instanceof Element && event.target.closest("[data-point-id]") !== null };
    } else if (pointers.size === 2) {
      if (gesture) gesture.moved = true;
      pinch = pinchDistance();
      for (const id of pointers.keys()) capture(id);
    }
  }

  function onPointerMove(event: PointerEvent) {
    const last = pointers.get(event.pointerId);
    if (!last) {
      if (event.pointerType === "mouse" && !isControl(event.target)) {
        const id = pick(event.clientX, event.clientY);
        if (id !== hoverId) {
          hoverId = id;
          stage.style.cursor = id ? "pointer" : "";
          invalidate();
        }
      }
      return;
    }
    const dx = event.clientX - last.x;
    const dy = event.clientY - last.y;
    last.x = event.clientX;
    last.y = event.clientY;
    if (pointers.size === 2) {
      const distance = pinchDistance();
      setZoom(goal.zoom * (pinch / distance));
      pinch = distance;
      return;
    }
    if (!gesture) return;
    if (!gesture.moved && Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) > 5) {
      gesture.moved = true;
      capture(event.pointerId);
    }
    if (!gesture.moved) return;
    goal.azimuth -= dx * 0.0085;
    // Пальцем вверх-вниз прокручивается страница, поэтому наклон — только мышью и кнопкой.
    if (event.pointerType !== "touch") goal.elevation = clamp(goal.elevation + dy * 0.006, elevationRange.min, elevationRange.max);
    invalidate();
  }

  function onPointerUp(event: PointerEvent) {
    if (!pointers.delete(event.pointerId)) return;
    const tap = pointers.size === 0 && gesture && !gesture.moved && !gesture.onLabel && event.timeStamp - gesture.at < 700;
    if (pointers.size === 0) gesture = null;
    if (tap && event.type === "pointerup") {
      const id = pick(event.clientX, event.clientY);
      onSelect(id === selectedId ? null : id);
    }
  }

  function onWheel(event: WheelEvent) {
    // Обычная прокрутка страницы проходит сквозь сцену; масштаб — щипком или после нажатия на сцену.
    if (!(event.ctrlKey || event.metaKey || engaged) || isControl(event.target)) return;
    event.preventDefault();
    setZoom(goal.zoom * Math.exp(event.deltaY * (event.ctrlKey ? 0.012 : 0.0016)));
  }

  function onPointerLeave() {
    engaged = false;
    if (hoverId) {
      hoverId = null;
      stage.style.cursor = "";
      invalidate();
    }
  }

  function onKeyDown(event: KeyboardEvent) {
    if (event.target !== stage) return;
    const lift = (step: number) => clamp(goal.elevation + step, elevationRange.min, elevationRange.max);
    if (event.key === "ArrowLeft") goal.azimuth += 0.2;
    else if (event.key === "ArrowRight") goal.azimuth -= 0.2;
    else if (event.key === "ArrowUp") goal.elevation = lift(0.12);
    else if (event.key === "ArrowDown") goal.elevation = lift(-0.12);
    else if (event.key === "+" || event.key === "=") goal.zoom = clamp(goal.zoom * 0.85, zoomRange.min, zoomRange.max);
    else if (event.key === "-") goal.zoom = clamp(goal.zoom / 0.85, zoomRange.min, zoomRange.max);
    else return;
    event.preventDefault();
    invalidate();
  }

  stage.addEventListener("pointerdown", onPointerDown);
  stage.addEventListener("pointermove", onPointerMove);
  stage.addEventListener("pointerup", onPointerUp);
  stage.addEventListener("pointercancel", onPointerUp);
  stage.addEventListener("pointerleave", onPointerLeave);
  stage.addEventListener("wheel", onWheel, { passive: false });
  stage.addEventListener("keydown", onKeyDown);

  const onContextLost = (event: Event) => event.preventDefault();
  const onContextRestored = () => {
    shadowsStale = true;
    invalidate();
  };
  canvas.addEventListener("webglcontextlost", onContextLost);
  canvas.addEventListener("webglcontextrestored", onContextRestored);

  // Тему меняет переключатель сайта (атрибут на корне страницы) или настройка системы.
  const themeWatcher = new MutationObserver(applyPalette);
  themeWatcher.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  darkScheme.addEventListener("change", applyPalette);

  const sizeWatcher = new ResizeObserver(resize);
  sizeWatcher.observe(stage);
  // Сцена за пределами экрана не рисуется; при возвращении кадр обновляется один раз.
  const screenWatcher = new IntersectionObserver(([entry]) => {
    onScreen = entry.isIntersecting;
    invalidate();
  });
  screenWatcher.observe(stage);

  applyPalette();
  resize();
  refreshLabels();

  return {
    setPoints,
    setMonth,
    setSelected(id) {
      selectedId = id;
      for (const building of buildings) building.frame.visible = building.point.id === id;
      focusSelected();
      if (id && goal.zoom > 0.72 * home.zoom) goal.zoom = Math.max(zoomRange.min, 0.72 * home.zoom);
      invalidate();
    },
    zoomBy: (factor) => setZoom(goal.zoom * factor),
    tilt() {
      const next = tiltSteps.find((step) => step > goal.elevation + 0.05) ?? tiltSteps[0];
      goal.elevation = next;
      invalidate();
    },
    resetView() {
      Object.assign(goal, home);
      focusSelected();
      invalidate();
    },
    refreshLabels,
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      themeWatcher.disconnect();
      sizeWatcher.disconnect();
      screenWatcher.disconnect();
      darkScheme.removeEventListener("change", applyPalette);
      stage.removeEventListener("pointerdown", onPointerDown);
      stage.removeEventListener("pointermove", onPointerMove);
      stage.removeEventListener("pointerup", onPointerUp);
      stage.removeEventListener("pointercancel", onPointerUp);
      stage.removeEventListener("pointerleave", onPointerLeave);
      stage.removeEventListener("wheel", onWheel);
      stage.removeEventListener("keydown", onKeyDown);
      canvas.removeEventListener("webglcontextlost", onContextLost);
      canvas.removeEventListener("webglcontextrestored", onContextRestored);
      for (const building of buildings) {
        building.pulseMaterial.dispose();
        building.instanced.forEach((mesh) => mesh.dispose());
      }
      [blocks, crowns, trunks].forEach((mesh) => mesh.dispose());
      ownGeometries.forEach((geometry) => geometry.dispose());
      Object.values(paint).forEach((material) => material.dispose());
      blockPaint.dispose();
      renderer.dispose();
    },
  };
}
