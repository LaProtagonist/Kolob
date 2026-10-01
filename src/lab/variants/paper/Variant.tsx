/**
 * «Картон»: центр Петербурга из вырезанной бумаги. Вода — голубой лист под берегами, сады — фетр со
 * стёжкой, проспекты — бумажная лента, здания и точки сети — вырезанные фигурки с тенью.
 * Цифры приходят из общей страницы карты; здесь только рисунок.
 */
import { memo, useMemo } from "react";
import { MapPage, type MapScene, type SceneLot, type ScenePoint, type SceneState } from "../../shared/MapPage";
import { boatRoutePaths, city, cityHouses, housesClearOf, linePath, polygonPath, simplify, smooth, type Polygon } from "../../shared/geo/geo";
import { houseParts, LandmarkShape, PointHouse, PointLot, PointSite } from "../../shared/geo/pieces";
import type { VariantProps } from "../../useNetworkStory";
import "./paper.css";

const stillness = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Рисунок листа считается один раз на страницу: оба слоя берут одно и то же. */
let cachedArt: ReturnType<typeof buildArt> | null = null;
const getArt = () => (cachedArt ??= buildArt());

function buildArt() {
  // Ножницы режут плавно: контуры упрощены сильнее и скруглены.
  const cut = (polygon: Polygon, tolerance: number, rounds: number) => polygon.map((ring) => smooth(simplify(ring, tolerance), rounds));
  const water = city.water.map((polygon) => polygonPath(cut(polygon, 14, 3)));
  const parks = city.parks.map((park) => polygonPath(cut(park.rings, 10, 2)));
  const main = city.roads.filter((road) => road.kind === "p" && !road.bridge).flatMap((road) => road.lines.map((line) => linePath(line))).join("");
  const minor = city.roads.filter((road) => road.kind === "s" && !road.bridge).flatMap((road) => road.lines.map((line) => linePath(line))).join("");
  const bridges = city.roads.filter((road) => road.bridge).flatMap((road) => road.lines.map((line) => linePath(line))).join("");
  return { water, parks, main, minor, bridges, boats: boatRoutePaths() };
}

/** Неподвижная часть: строится один раз и не перерисовывается при смене месяца. */
const PaperCity = memo(function PaperCity() {
  const art = getArt();
  const frame = city.frame;

  return (
    <g className="is-static">
      <rect className="pp-table" x={frame.x - 4000} y={frame.y - 4000} width={frame.w + 8000} height={frame.h + 8000} />
      <rect className="pp-sheet-shadow" x={frame.x + 60} y={frame.y + 90} width={frame.w} height={frame.h} />
      <clipPath id="pp-sheet-clip">
        <rect x={frame.x} y={frame.y} width={frame.w} height={frame.h} />
      </clipPath>
      <clipPath id="pp-water-clip">
        {art.water.map((d, index) => (
          <path key={index} d={d} clipRule="evenodd" />
        ))}
      </clipPath>
      <rect className="pp-sheet" x={frame.x} y={frame.y} width={frame.w} height={frame.h} />
      <g clipPath="url(#pp-sheet-clip)">
        {art.parks.map((d, index) => (
          <path key={`shadow-${index}`} className="pp-park-shadow" d={d} transform="translate(14 20)" fillRule="evenodd" />
        ))}
        {art.parks.map((d, index) => (
          <path key={index} className="pp-park" d={d} fillRule="evenodd" />
        ))}
        {art.parks.map((d, index) => (
          <path key={`stitch-${index}`} className="pp-stitch" d={d} fillRule="evenodd" />
        ))}
        {art.water.map((d, index) => (
          <path key={index} className="pp-water" d={d} fillRule="evenodd" />
        ))}
        {/* Тень берега на воде: лист с городом лежит выше листа с водой. */}
        <g clipPath="url(#pp-water-clip)">
          {art.water.map((d, index) => (
            <path key={index} className="pp-bank-shadow" d={d} transform="translate(16 24)" />
          ))}
        </g>
        <g className="pp-ripples">
          {art.water.map((d, index) => (
            <path key={index} className="pp-ripple" d={d} />
          ))}
        </g>
        <path className="pp-tape-shadow is-minor" d={art.minor} transform="translate(6 9)" />
        <path className="pp-tape is-minor" d={art.minor} />
        <path className="pp-tape-shadow" d={art.main} transform="translate(8 12)" />
        <path className="pp-tape" d={art.main} />
        <path className="pp-bridge-shadow" d={art.bridges} transform="translate(8 12)" />
        <path className="pp-bridge" d={art.bridges} />
      </g>
    </g>
  );
});

/** Участки точек и мест под новые точки — там домов нет. Ключ меняется только при новом плане сети. */
const clearKey = (points: ScenePoint[], lots: SceneLot[]) =>
  [...points.map((item) => `${Math.round(item.x)}:${Math.round(item.y)}`), ...lots.map((lot) => `${Math.round(lot.x)}:${Math.round(lot.y)}`)].sort().join(";");

/** Бумажные фасады в кварталах: реже, без обводки, с лёгкой тенью. Видны только при приближении. */
const PaperHouses = memo(function PaperHouses({ clear }: { clear: string }) {
  const parts = useMemo(() => {
    const spots = housesClearOf(cityHouses(), clear ? clear.split(";").map((pair) => pair.split(":").map(Number) as [number, number]) : []);
    const body = ["", "", "", ""];
    const roof = ["", "", "", ""];
    let shadow = "";
    let windows = "";
    for (const spot of spots) {
      const size = spot.kind === 0 ? 1.25 : spot.kind === 1 ? 1.2 : 1.1;
      const part = houseParts(spot.kind, spot.x, spot.y, size);
      const back = houseParts(spot.kind, spot.x + 10, spot.y + 8, size);
      body[spot.tone] += part.body;
      roof[spot.tone] += part.roof;
      shadow += back.body + back.roof;
      windows += part.windows;
    }
    return { body, roof, shadow, windows };
  }, [clear]);
  return (
    <g className="is-static pp-houses is-detail">
      <path className="pp-house-shadow" d={parts.shadow} />
      {parts.body.map((d, tone) => (d ? <path key={`b${tone}`} className={`pp-house is-${tone}`} d={d} /> : null))}
      {parts.roof.map((d, tone) => (d ? <path key={`r${tone}`} className={`pp-house-roof is-${tone}`} d={d} /> : null))}
      <path className="pp-house-window" d={parts.windows} />
    </g>
  );
});

/** Подписи и вырезанные силуэты поверх домов. */
const PaperSights = memo(function PaperSights() {
  return (
    <g className="is-static">
      {city.labels.map((label) => (
        <text key={label.text} className={`pp-label is-${label.kind}${label.kind === "district" ? " is-far-only" : ""}`} x={label.x} y={label.y} textAnchor="middle">
          {label.text}
        </text>
      ))}
      {city.landmarks.map((landmark) => (
        <g key={landmark.id} className="pp-landmark" transform={`translate(${landmark.x} ${landmark.y})`}>
          <g className="pp-lm-scale">
            <g className="pp-cutout-shadow" transform="translate(7 5)">
              <LandmarkShape kind={landmark.kind} />
            </g>
            <LandmarkShape kind={landmark.kind} />
          </g>
          <text className="pp-lm-title is-detail" textAnchor="middle">{landmark.title}</text>
        </g>
      ))}
    </g>
  );
});

/** Верхний слой: бумажные кораблики и облака. Их движение не перерисовывает лист с городом. */
const PaperLife = memo(function PaperLife() {
  const art = getArt();
  const frame = city.frame;
  const moving = !stillness();
  return (
    <g className="pp-life">
      <clipPath id="pp-life-clip">
        <rect x={frame.x} y={frame.y} width={frame.w} height={frame.h} />
      </clipPath>
      <g clipPath="url(#pp-life-clip)">
        {art.boats.map((route, index) => (
          <g key={index} className="pp-boat">
            <g className="pp-boat-scale">
              <g className="pp-boat-rock" style={{ animationDelay: `${-index * 0.7}s` }}>
                <path className="pp-boat-shadow" d="M-26 4L26 4L14 14H-14Z" transform="translate(3 3)" />
                <path className="pp-boat-hull" d="M-26 0L26 0L14 12H-14Z" />
                <path className="pp-boat-sail" d="M-2 0V-30L18 0Z" />
                <path className="pp-boat-sail-2" d="M-4 0V-24L-20 0Z" />
              </g>
            </g>
            {moving ? <animateMotion dur={`${80 + index * 25}s`} repeatCount="indefinite" path={route} keyPoints="0;1;0" keyTimes="0;0.5;1" calcMode="linear" /> : null}
            {!moving ? <animateMotion dur="1s" fill="freeze" path={route} keyPoints="0.3;0.3" keyTimes="0;1" calcMode="linear" /> : null}
          </g>
        ))}
      </g>
      <g className="pp-clouds is-far-only" aria-hidden="true">
        {[
          { x: -2200, y: -2300, delay: 0 },
          { x: 1600, y: 600, delay: -80 },
        ].map((cloud, index) => (
          <g key={index} transform={`translate(${cloud.x} ${cloud.y})`}>
            <g className="pp-cloud" style={{ animationDelay: `${cloud.delay}s` }}>
              <path className="pp-cloud-shadow" d="M60 200a140 140 0 0 1 240 -80a170 170 0 0 1 320 40a120 120 0 0 1 40 230h-560a120 120 0 0 1 -40 -190Z" transform="translate(70 90)" />
              <path className="pp-cloud-body" d="M60 200a140 140 0 0 1 240 -80a170 170 0 0 1 320 40a120 120 0 0 1 40 230h-560a120 120 0 0 1 -40 -190Z" />
            </g>
          </g>
        ))}
      </g>
    </g>
  );
});

function PaperPoint({ item, select }: { item: ScenePoint; select: SceneState["select"] }) {
  const look = item.point.isBase ? "base" : item.point.format === "with_seating" ? "hall" : "kiosk";
  const body = item.state === "open" ? <PointHouse look={look} /> : item.state === "site" ? <PointSite /> : <PointLot />;
  return (
    <g
      className={`is-point pp-point is-${item.state}${item.selected ? " is-selected" : ""}${item.fresh ? " is-fresh" : ""}`}
      transform={`translate(${Math.round(item.sx)} ${Math.round(item.sy)})`}
      onClick={() => select(item.point.id)}
    >
      <g className="pp-pt-scale">
        <ellipse className="pp-pt-plaza" cx="0" cy="-8" rx="48" ry="26" />
        {item.selected ? <ellipse className="pp-pt-ring" cx="0" cy="-2" rx="52" ry="18" /> : null}
        <g className="pp-pt-pop">
          <g className="pp-cutout-shadow" transform="translate(6 4)">{body}</g>
          {body}
          {item.point.isBase && item.state === "open" ? (
            <g className="pp-smoke">
              <circle cx="23" cy="-76" r="6" />
              <circle cx="23" cy="-76" r="7" />
            </g>
          ) : null}
          {item.state !== "open" ? (
            <g className="pp-pt-tag" transform="translate(0 -74) rotate(-4)">
              <rect x="-19" y="-12" width="38" height="20" rx="3" />
              <text y="3" textAnchor="middle">М{item.point.openingMonth}</text>
            </g>
          ) : null}
        </g>
      </g>
      <text className="pp-pt-title" textAnchor="middle">{item.point.isBase ? "Лиговский 21 · цех" : item.point.title}</text>
    </g>
  );
}

const scene: MapScene = {
  className: "is-paper",
  label: "Карта центра Петербурга из вырезанной бумаги: вода, сады, проспекты, достопримечательности и точки сети",
  bounds: city.frame,
  pad: 300,
  closeW: 900,
  toScene: (x, y) => [x, y],
  render: ({ points, lots }) => (
    <>
      <PaperCity />
      <PaperHouses clear={clearKey(points, lots)} />
      <PaperSights />
    </>
  ),
  overlay: ({ points, select, life, topLayer }) => (
    <>
      <PaperLife />
      {life}
      <g className="pp-points">
        {[...points].sort((left, right) => left.sy - right.sy).map((item) => (
          <PaperPoint key={item.point.id} item={item} select={select} />
        ))}
      </g>
      {topLayer}
    </>
  ),
  legend: (
    <>
      <span><i className="pp-key is-base" />цех с трубой — первая точка и производство</span>
      <span><i className="pp-key is-hall" />дом с шатром — точка с залом</span>
      <span><i className="pp-key is-kiosk" />киоск — на вынос</span>
      <span><i className="pp-key is-site" />кран — стройка, вложения уже идут</span>
      <span><i className="pp-key is-lot" />пунктир — место и месяц открытия</span>
    </>
  ),
};

export default function Variant(props: VariantProps) {
  return <MapPage {...props} scene={scene} />;
}
