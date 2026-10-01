/**
 * «Мультик»: карта центра как плакат. Общая разметка из OpenStreetMap сглажена и обведена живой
 * линией, сверху — сочные силуэты достопримечательностей, лодки на Неве, облака и колобки на точках.
 * Цифры приходят из общей страницы карты; здесь только рисунок.
 */
import { memo } from "react";
import { MapPage, type MapScene, type ScenePoint, type SceneState } from "../../shared/MapPage";
import {
  boatRoutePaths,
  city,
  linePath,
  polygonPath,
  ringArea,
  scatter,
  simplify,
  smooth,
  wobble,
  type Polygon,
} from "../../shared/geo/geo";
import { LandmarkShape, PointHouse, PointLot, PointSite } from "../../shared/geo/pieces";
import type { VariantProps } from "../../useNetworkStory";
import "./cartoon.css";

const stillness = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Рисунок плаката считается один раз на страницу: оба слоя берут одно и то же. */
function buildArt() {
  const frame = city.frame;
  const soft = (polygon: Polygon, tolerance: number, rounds: number) => polygon.map((ring) => smooth(simplify(ring, tolerance), rounds));
  const water = city.water.map((polygon) => soft(polygon, 9, 2));
  // Три чуть разных обводки воды сменяют друг друга: линия «дышит», как в рисованном мультфильме.
  const outlines = [11, 23, 37].map((seed) =>
    water.map((polygon, index) => polygon.map((ring) => linePath(wobble(ring, 5, seed + index, 55)) + "Z").join("")).join(""),
  );
  const parks = city.parks.map((park) => soft(park.rings, 6, 1));
  const trees = city.parks.flatMap((park, index) => {
    const area = ringArea(park.rings[0]);
    if (area < 45000) return [];
    return scatter(park.rings, Math.min(18, Math.round(area / 20000)), 101 + index);
  });
  const waves = city.water.flatMap((polygon, index) => {
    const area = ringArea(polygon[0]);
    if (area < 300000) return [];
    return scatter(polygon, Math.min(16, Math.round(area / 140000)), 7 + index);
  });
  const roads = city.roads.filter((road) => !road.bridge);
  const bridges = city.roads.filter((road) => road.bridge);
  return { frame, water, outlines, parks, trees, waves, roads, bridges, boats: boatRoutePaths() };
}

let cachedArt: ReturnType<typeof buildArt> | null = null;
const getArt = () => (cachedArt ??= buildArt());

/** Неподвижная часть плаката: строится один раз и не перерисовывается при смене месяца. */
const CartoonCity = memo(function CartoonCity() {
  const art = getArt();
  const { frame } = art;
  const roadPath = (kind: "p" | "s") => art.roads.filter((road) => road.kind === kind).flatMap((road) => road.lines.map((line) => linePath(line))).join("");
  const bridgePath = art.bridges.flatMap((road) => road.lines.map((line) => linePath(line))).join("");

  return (
    <g className="is-static">
      <rect className="ct-table" x={frame.x - 4000} y={frame.y - 4000} width={frame.w + 8000} height={frame.h + 8000} />
      <clipPath id="ct-poster-clip">
        <rect x={frame.x} y={frame.y} width={frame.w} height={frame.h} />
      </clipPath>
      <rect className="ct-poster" x={frame.x} y={frame.y} width={frame.w} height={frame.h} />
      <g clipPath="url(#ct-poster-clip)">
        {/* Кварталы, полные домиков: узор лежит под садами, водой и улицами и виден только вблизи. */}
        <rect className="ct-houses is-detail" x={frame.x} y={frame.y} width={frame.w} height={frame.h} fill="url(#ct-houses)" />
        {city.landmarks.map((landmark) => (
          <ellipse key={landmark.id} className="ct-plaza" cx={landmark.x} cy={landmark.y - 40} rx="210" ry="130" />
        ))}
        {art.parks.map((polygon, index) => (
          <path key={index} className="ct-park" d={polygonPath(polygon)} fillRule="evenodd" />
        ))}
        {art.water.map((polygon, index) => (
          <path key={index} className="ct-water" d={polygonPath(polygon)} fillRule="evenodd" />
        ))}
        <g className="ct-waves">
          {art.waves.map(([x, y], index) => (
            <path key={index} className="ct-wave" d={`M${x - 46} ${y}q23 -20 46 0q23 -20 46 0`} />
          ))}
        </g>
        <path className="ct-road-case is-minor" d={roadPath("s")} />
        <path className="ct-road-case" d={roadPath("p")} />
        <path className="ct-road is-minor" d={roadPath("s")} />
        <path className="ct-road" d={roadPath("p")} />
        <path className="ct-bridge-case" d={bridgePath} />
        <path className="ct-bridge" d={bridgePath} />
        <g className="ct-trees">
          {art.trees.map(([x, y], index) => (
            <g key={index} transform={`translate(${Math.round(x)} ${Math.round(y)})`}>
              <circle className="ct-tree-crown" r="34" />
              <circle className="ct-tree-light" cx="-10" cy="-10" r="12" />
            </g>
          ))}
        </g>
      </g>
      {city.labels.map((label) => (
        <text key={label.text} className={`ct-label is-${label.kind}${label.kind === "district" ? " is-far-only" : ""}`} x={label.x} y={label.y} textAnchor="middle">
          {label.text}
        </text>
      ))}
      {city.landmarks.map((landmark) => (
        <g key={landmark.id} className="ct-landmark" transform={`translate(${landmark.x} ${landmark.y})`}>
          <g className="ct-lm-scale">
            <ellipse className="ct-lm-shadow" cx="0" cy="2" rx="70" ry="12" />
            <LandmarkShape kind={landmark.kind} />
          </g>
          <text className="ct-lm-title is-detail" textAnchor="middle">{landmark.title}</text>
        </g>
      ))}
    </g>
  );
});

/** Верхний слой: волны, живая обводка воды, лодки и облака. Их движение не перерисовывает город. */
const CartoonLife = memo(function CartoonLife() {
  const art = getArt();
  const { frame } = art;
  const moving = !stillness();
  return (
    <g className="ct-life">
      <clipPath id="ct-life-clip">
        <rect x={frame.x} y={frame.y} width={frame.w} height={frame.h} />
      </clipPath>
      <g clipPath="url(#ct-life-clip)">
        <g className="ct-boil">
          {art.outlines.map((d, index) => (
            <path key={index} className="ct-water-line" d={d} />
          ))}
        </g>
        {art.boats.map((route, index) => (
          <g key={index} className="ct-boat">
            <g className="ct-boat-scale">
              <path className="ct-boat-hull" d="M-30 -6H30L22 6H-22Z" />
              <path className="ct-boat-cabin" d="M-14 -6V-16H10V-6Z" />
              <path className="ct-boat-flag" d="M-2 -16V-30H0V-16Z M0 -30L12 -26L0 -22Z" />
            </g>
            {moving ? <animateMotion dur={`${70 + index * 25}s`} repeatCount="indefinite" path={route} keyPoints="0;1;0" keyTimes="0;0.5;1" calcMode="linear" /> : null}
            {!moving ? <animateMotion dur="1s" fill="freeze" path={route} keyPoints="0.3;0.3" keyTimes="0;1" calcMode="linear" /> : null}
          </g>
        ))}
      </g>
      <g className="ct-clouds is-far-only" aria-hidden="true">
        {[
          { x: -1800, y: -2500, delay: 0 },
          { x: 1400, y: 300, delay: -60 },
          { x: -600, y: 2200, delay: -120 },
        ].map((cloud, index) => (
          <g key={index} transform={`translate(${cloud.x} ${cloud.y})`}>
            <g className="ct-cloud" style={{ animationDelay: `${cloud.delay}s` }}>
              <path className="ct-cloud-shadow" d="M80 220a150 150 0 0 1 260 -90a190 190 0 0 1 360 40a140 140 0 0 1 60 270h-620a130 130 0 0 1 -60 -220Z" />
              <path className="ct-cloud-body" d="M0 120a150 150 0 0 1 260 -90a190 190 0 0 1 360 40a140 140 0 0 1 60 270h-620a130 130 0 0 1 -60 -220Z" />
            </g>
          </g>
        ))}
      </g>
    </g>
  );
});

function CartoonPoint({ item, select }: { item: ScenePoint; select: SceneState["select"] }) {
  const look = item.point.isBase ? "base" : item.point.format === "with_seating" ? "hall" : "kiosk";
  return (
    <g
      className={`is-point ct-point is-${item.state}${item.selected ? " is-selected" : ""}${item.fresh ? " is-fresh" : ""}`}
      transform={`translate(${Math.round(item.sx)} ${Math.round(item.sy)})`}
      onClick={() => select(item.point.id)}
    >
      <g className="ct-pt-scale">
        <g className="ct-pt-pop">
          <ellipse className="ct-pt-plaza" cx="0" cy="-8" rx="48" ry="26" />
          {item.state === "open" ? <ellipse className="ct-pt-halo" cx="0" cy="-2" rx="44" ry="18" /> : null}
          <ellipse className="ct-pt-shadow" cx="0" cy="1" rx="36" ry="9" />
          {item.selected ? <ellipse className="ct-pt-ring" cx="0" cy="1" rx="50" ry="15" /> : null}
          {item.state === "open" ? <PointHouse look={look} /> : item.state === "site" ? <PointSite /> : <PointLot />}
          {item.point.isBase && item.state === "open" ? (
            <g className="ct-smoke">
              <circle cx="23" cy="-76" r="5" />
              <circle cx="23" cy="-76" r="6" />
              <circle cx="23" cy="-76" r="7" />
            </g>
          ) : null}
          {item.state !== "open" ? (
            <g className="ct-pt-tag" transform="translate(0 -74)">
              <rect x="-19" y="-12" width="38" height="20" rx="7" />
              <text y="3" textAnchor="middle">М{item.point.openingMonth}</text>
            </g>
          ) : null}
        </g>
      </g>
      <text className="ct-pt-title" textAnchor="middle">{item.point.isBase ? "Лиговский 21 · цех" : item.point.title}</text>
    </g>
  );
}

/** Узор кварталов: пять домиков разного цвета на плитке 240 × 240 м, повёрнутой вдоль Невского. */
const housesPattern = (
  <pattern id="ct-houses" width="240" height="240" patternUnits="userSpaceOnUse" patternTransform="rotate(-13)">
    {[
      { x: 18, y: 58, w: 46, h: 30, body: "ct-h-a", roof: "ct-r-a" },
      { x: 112, y: 46, w: 58, h: 36, body: "ct-h-b", roof: "ct-r-b" },
      { x: 40, y: 168, w: 50, h: 32, body: "ct-h-c", roof: "ct-r-c" },
      { x: 138, y: 160, w: 42, h: 44, body: "ct-h-d", roof: "ct-r-d" },
      { x: 186, y: 104, w: 30, h: 26, body: "ct-h-b", roof: "ct-r-a" },
    ].map((house, index) => (
      <g key={index} transform={`translate(${house.x} ${house.y})`}>
        <path className={`ct-house ${house.body}`} d={`M0 0V${-house.h}H${house.w}V0Z`} />
        <path className={`ct-house ${house.roof}`} d={`M-4 ${-house.h}L${house.w / 2} ${-house.h - 22}L${house.w + 4} ${-house.h}Z`} />
        <path className="ct-house-window" d={`M8 ${-house.h + 9}h9v9h-9Z M${house.w - 17} ${-house.h + 9}h9v9h-9Z`} />
      </g>
    ))}
  </pattern>
);

const scene: MapScene = {
  className: "is-cartoon",
  label: "Карта центра Петербурга в виде плаката: вода, сады, проспекты, достопримечательности и точки сети",
  bounds: city.frame,
  pad: 260,
  closeW: 900,
  toScene: (x, y) => [x, y],
  defs: housesPattern,
  render: () => <CartoonCity />,
  overlay: ({ points, select }) => (
    <>
      <CartoonLife />
      <g className="ct-points">
        {[...points].sort((left, right) => left.sy - right.sy).map((item) => (
          <CartoonPoint key={item.point.id} item={item} select={select} />
        ))}
      </g>
    </>
  ),
  legend: (
    <>
      <span><i className="ct-key is-base" />цех с трубой — первая точка и производство</span>
      <span><i className="ct-key is-hall" />дом с шатром — точка с залом</span>
      <span><i className="ct-key is-kiosk" />киоск — на вынос</span>
      <span><i className="ct-key is-site" />кран — стройка, вложения уже идут</span>
      <span><i className="ct-key is-lot" />пунктир — место и месяц открытия</span>
    </>
  ),
};

export default function Variant(props: VariantProps) {
  return <MapPage {...props} scene={scene} />;
}
