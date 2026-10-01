/**
 * «Плитка»: настоящий центр Петербурга как изометрическое игровое поле. Клетки по 110 м
 * по маске воды, садов и проспектов из OpenStreetMap, кварталы — домики в стиле прежней изометрии.
 * Издали — всё поле с силуэтами, вблизи — окна и деревья. Цифры приходят из общей страницы карты.
 */
import { memo, useMemo } from "react";
import { MapPage, type MapScene, type ScenePoint, type SceneState } from "../../shared/MapPage";
import { boatRoutePaths, city } from "../../shared/geo/geo";
import { LandmarkShape, PointHouse, PointLot, PointSite } from "../../shared/geo/pieces";
import type { VariantProps } from "../../useNetworkStory";
import { at, box, buildBoard, diamond, Kind, SLAB, toGrid, toScene, type Board } from "./board";
import "./tiles.css";

let cached: Board | null = null;
const getBoard = () => (cached ??= buildBoard());

const stillness = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const QUAY = 5;
const TONES = 4;

/** Земля поля: доска с торцами, вода ниже набережных, сады, улицы, мосты. */
const TilesGround = memo(function TilesGround() {
  const art = useMemo(() => {
    const board = getBoard();
    const { kindAt, i0, j0, cols, rows } = board;
    const fill: Record<string, string[]> = { water: [], park: [], road: [], bridge: [], block: [], plaza: [], yard: [] };
    const slabLeft: string[] = [];
    const slabRight: string[] = [];
    const quayLeft: string[] = [];
    const quayRight: string[] = [];
    const isLand = (kind: Kind) => kind !== Kind.Outside && kind !== Kind.Water;
    for (let j = j0; j < j0 + rows; j += 1) {
      for (let i = i0; i < i0 + cols; i += 1) {
        const kind = kindAt(i, j);
        if (kind === Kind.Outside) continue;
        const name = kind === Kind.Water ? "water" : kind === Kind.Park ? "park" : kind === Kind.Road ? "road" : kind === Kind.Bridge ? "bridge" : kind === Kind.Plaza ? "plaza" : kind === Kind.Yard ? "yard" : "block";
        fill[name].push(diamond(i, j, kind === Kind.Water ? -QUAY : 0));
        // Торцы доски по переднему краю поля.
        if (kindAt(i, j + 1) === Kind.Outside) slabLeft.push(`M${at(i, j + 1)}L${at(i + 1, j + 1)}L${at(i + 1, j + 1, -SLAB)}L${at(i, j + 1, -SLAB)}Z`);
        if (kindAt(i + 1, j) === Kind.Outside) slabRight.push(`M${at(i + 1, j)}L${at(i + 1, j + 1)}L${at(i + 1, j + 1, -SLAB)}L${at(i + 1, j, -SLAB)}Z`);
        // Набережная: берег, за которым вода ниже.
        if (isLand(kind) && kind !== Kind.Bridge) {
          if (kindAt(i, j + 1) === Kind.Water) quayLeft.push(`M${at(i, j + 1)}L${at(i + 1, j + 1)}L${at(i + 1, j + 1, -QUAY)}L${at(i, j + 1, -QUAY)}Z`);
          if (kindAt(i + 1, j) === Kind.Water) quayRight.push(`M${at(i + 1, j)}L${at(i + 1, j + 1)}L${at(i + 1, j + 1, -QUAY)}L${at(i + 1, j, -QUAY)}Z`);
        }
      }
    }
    const join = (list: string[]) => list.join("");
    return {
      slabLeft: join(slabLeft),
      slabRight: join(slabRight),
      quayLeft: join(quayLeft),
      quayRight: join(quayRight),
      water: join(fill.water),
      park: join(fill.park),
      road: join(fill.road),
      bridge: join(fill.bridge),
      block: join(fill.block),
      plaza: join(fill.plaza),
      yard: join(fill.yard),
    };
  }, []);
  return (
    <g className="is-static">
      <path className="tl-slab-l" d={art.slabLeft} />
      <path className="tl-slab-r" d={art.slabRight} />
      <path className="tl-water" d={art.water} />
      <path className="tl-quay-l" d={art.quayLeft} />
      <path className="tl-quay-r" d={art.quayRight} />
      <path className="tl-block" d={art.block} />
      <path className="tl-plaza" d={art.plaza} />
      <path className="tl-yard" d={art.yard} />
      <path className="tl-park" d={art.park} />
      <path className="tl-road" d={art.road} />
      <path className="tl-bridge" d={art.bridge} />
    </g>
  );
});

type Diagonal = { d: number; left: string[]; right: string[]; top: string[]; windows: string; trunks: string; crowns: string; lights: string };

/** Клетка поля под точкой. */
const cellOf = (x: number, y: number): [number, number] => {
  const [gi, gj] = toGrid(x, y);
  return [Math.floor(gi), Math.floor(gj)];
};

/**
 * Клетки без домов: под точками сети и местами под новые точки, а также перед ними (клетки,
 * которые ближе к зрителю). Точка рисуется поверх поля, и дом перед ней иначе оказался бы «за» точкой.
 */
const reservedKey = (spots: Array<{ x: number; y: number }>) => {
  const keys = new Set<string>();
  for (const spot of spots) {
    const [i, j] = cellOf(spot.x, spot.y);
    for (const [di, dj] of [[0, 0], [1, 0], [0, 1], [1, 1]]) keys.add(`${i + di}:${j + dj}`);
  }
  return [...keys].sort().join(",");
};

/**
 * Дома и деревья по диагоналям поля, от дальней к ближней: ближний дом закрывает дальний.
 * Квартал — один массив: стена рисуется только там, где рядом нет дома такой же высоты.
 */
const TilesCity = memo(function TilesCity({ reserved }: { reserved: string }) {
  const diagonals = useMemo(() => {
    const board = getBoard();
    const free = new Set(reserved.split(","));
    const height = new Map<string, number>();
    for (const building of board.buildings) {
      if (!free.has(`${building.i}:${building.j}`)) height.set(`${building.i}:${building.j}`, building.h);
    }
    const heightAt = (i: number, j: number) => height.get(`${i}:${j}`) ?? 0;
    const byDiagonal = new Map<number, Diagonal>();
    const slot = (d: number) => {
      let item = byDiagonal.get(d);
      if (!item) {
        item = { d, left: Array(TONES).fill(""), right: Array(TONES).fill(""), top: Array(TONES).fill(""), windows: "", trunks: "", crowns: "", lights: "" };
        byDiagonal.set(d, item);
      }
      return item;
    };
    for (const building of board.buildings) {
      const { i, j, h } = building;
      if (free.has(`${i}:${j}`)) continue;
      const tone = building.tone % TONES;
      const faces = box(i, j, i + 1, j + 1, h);
      const item = slot(i + j);
      // Левая стена смотрит на клетку (i, j+1), правая — на (i+1, j): видны, только если там ниже.
      const leftOpen = heightAt(i, j + 1) < h;
      const rightOpen = heightAt(i + 1, j) < h;
      if (leftOpen) item.left[tone] += faces.left;
      if (rightOpen) item.right[tone] += faces.right;
      item.top[tone] += faces.top;
      // Окна: ряд на каждый этаж, по три на видимой стене клетки.
      const floors = Math.max(2, Math.floor(h / 8));
      for (let floor = 0; floor < floors; floor += 1) {
        const z0 = 3 + floor * ((h - 5) / floors);
        const z1 = z0 + Math.min(4.5, (h - 8) / floors);
        for (const t of [0.14, 0.44, 0.74]) {
          if (leftOpen) item.windows += `M${at(i + t, j + 1, z1)}L${at(i + t + 0.12, j + 1, z1)}L${at(i + t + 0.12, j + 1, z0)}L${at(i + t, j + 1, z0)}Z`;
          if (rightOpen) item.windows += `M${at(i + 1, j + t, z1)}L${at(i + 1, j + t + 0.12, z1)}L${at(i + 1, j + t + 0.12, z0)}L${at(i + 1, j + t, z0)}Z`;
        }
      }
    }
    for (const tree of board.trees) {
      const item = slot(Math.floor(tree.gi) + Math.floor(tree.gj));
      const [x, y] = at(tree.gi, tree.gj).split(" ").map(Number);
      const radius = 9 * tree.size;
      item.trunks += `M${x - 1.5} ${y}h3v${-8 * tree.size}h-3Z`;
      item.crowns += `M${x - radius} ${y - 10 * tree.size}a${radius} ${radius} 0 1 0 ${radius * 2} 0a${radius} ${radius} 0 1 0 ${-radius * 2} 0Z`;
      item.lights += `M${x - radius * 0.55} ${y - 13 * tree.size}a${radius * 0.38} ${radius * 0.38} 0 1 0 ${radius * 0.76} 0a${radius * 0.38} ${radius * 0.38} 0 1 0 ${-radius * 0.76} 0Z`;
    }
    return [...byDiagonal.values()].sort((left, right) => left.d - right.d);
  }, [reserved]);

  return (
    <g className="is-static tl-city">
      {diagonals.map((item) => (
        <g key={item.d}>
          {item.left.map((d, tone) => (d ? <path key={`l${tone}`} className={`tl-wall-l is-t${tone}`} d={d} /> : null))}
          {item.right.map((d, tone) => (d ? <path key={`r${tone}`} className={`tl-wall-r is-t${tone}`} d={d} /> : null))}
          {item.top.map((d, tone) => (d ? <path key={`t${tone}`} className={`tl-roof is-t${tone}`} d={d} /> : null))}
          {item.windows ? <path className="tl-win is-near" d={item.windows} /> : null}
          {item.trunks ? <path className="tl-trunk" d={item.trunks} /> : null}
          {item.crowns ? <path className="tl-crown" d={item.crowns} /> : null}
          {item.lights ? <path className="tl-crown-light" d={item.lights} /> : null}
        </g>
      ))}
    </g>
  );
});

/** Верхний слой: лодки на воде. Их движение не перерисовывает поле с домами. */
const TilesLife = memo(function TilesLife() {
  const boats = useMemo(() => boatRoutePaths(toScene), []);
  const moving = !stillness();
  return (
    <g className="tl-life">
      {boats.map((route, index) => (
        <g key={index} className="tl-boat">
          <g className="tl-boat-scale">
            <path className="tl-boat-hull" d="M-26 -4H26L18 6H-18Z" />
            <path className="tl-boat-cabin" d="M-12 -4V-14H10V-4Z" />
          </g>
          {moving ? <animateMotion dur={`${80 + index * 25}s`} repeatCount="indefinite" path={route} keyPoints="0;1;0" keyTimes="0;0.5;1" calcMode="linear" /> : null}
          {!moving ? <animateMotion dur="1s" fill="freeze" path={route} keyPoints="0.3;0.3" keyTimes="0;1" calcMode="linear" /> : null}
        </g>
      ))}
    </g>
  );
});

/** Силуэты и подписи поверх поля. */
const TilesSights = memo(function TilesSights() {
  return (
    <g className="is-static">
      {city.labels.map((label) => {
        const [x, y] = toScene(label.x, label.y);
        return (
          <text key={label.text} className={`tl-label is-${label.kind}${label.kind === "district" ? " is-far-only" : ""}`} x={x} y={y} textAnchor="middle">
            {label.text}
          </text>
        );
      })}
      {city.landmarks
        .map((landmark) => ({ landmark, place: toScene(landmark.x, landmark.y) }))
        .sort((left, right) => left.place[1] - right.place[1])
        .map(({ landmark, place: [x, y] }) => (
          <g key={landmark.id} className="tl-landmark" transform={`translate(${Math.round(x)} ${Math.round(y)})`}>
            <g className="tl-lm-scale">
              <ellipse className="tl-shadow" cx="0" cy="2" rx="62" ry="14" />
              <LandmarkShape kind={landmark.kind} />
            </g>
            <text className="tl-lm-title is-detail" textAnchor="middle">{landmark.title}</text>
          </g>
        ))}
    </g>
  );
});

function TilesPoint({ item, select }: { item: ScenePoint; select: SceneState["select"] }) {
  const look = item.point.isBase ? "base" : item.point.format === "with_seating" ? "hall" : "kiosk";
  return (
    <g
      className={`is-point tl-point is-${item.state}${item.selected ? " is-selected" : ""}${item.fresh ? " is-fresh" : ""}`}
      transform={`translate(${Math.round(item.sx)} ${Math.round(item.sy)})`}
      onClick={() => select(item.point.id)}
    >
      <path className="tl-lot" d="M0 -22L44 0L0 22L-44 0Z" />
      {item.selected ? <path className="tl-lot-ring" d="M0 -30L60 0L0 30L-60 0Z" /> : null}
      <g className="tl-pt-scale">
        <g className="tl-pt-pop">
          {item.state === "open" ? <PointHouse look={look} /> : item.state === "site" ? <PointSite /> : <PointLot />}
          {item.state !== "open" ? (
            <g className="tl-pt-tag" transform="translate(0 -72)">
              <rect x="-19" y="-12" width="38" height="20" rx="7" />
              <text y="3" textAnchor="middle">М{item.point.openingMonth}</text>
            </g>
          ) : null}
        </g>
      </g>
      <text className="tl-pt-title is-detail" textAnchor="middle">{item.point.isBase ? "Лиговский 21 · цех" : item.point.title}</text>
    </g>
  );
}

const scene: MapScene = {
  className: "is-tiles",
  label: "Изометрическое поле центра Петербурга: клетки воды, садов, улиц и кварталов, достопримечательности и точки сети",
  get bounds() {
    return getBoard().bounds;
  },
  pad: 60,
  closeW: 520,
  toScene,
  render: ({ points, lots }) => (
    <>
      <TilesGround />
      <TilesCity reserved={reservedKey([...points, ...lots])} />
      <TilesSights />
    </>
  ),
  overlay: ({ points, select, life, topLayer }) => (
    <>
      <TilesLife />
      {life}
      <g className="tl-points">
        {[...points].sort((left, right) => left.sy - right.sy).map((item) => (
          <TilesPoint key={item.point.id} item={item} select={select} />
        ))}
      </g>
      {topLayer}
    </>
  ),
  legend: (
    <>
      <span><i className="tl-key is-base" />цех с трубой — первая точка и производство</span>
      <span><i className="tl-key is-hall" />дом с шатром — точка с залом</span>
      <span><i className="tl-key is-kiosk" />киоск — на вынос</span>
      <span><i className="tl-key is-site" />кран — стройка, вложения уже идут</span>
      <span><i className="tl-key is-lot" />жёлтая клетка — место точки</span>
    </>
  ),
};

export default function Variant(props: VariantProps) {
  return <MapPage {...props} scene={scene} />;
}
