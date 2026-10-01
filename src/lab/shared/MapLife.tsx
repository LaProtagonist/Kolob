/**
 * Жизнь сети поверх карты — общая для всех видов карты.
 *
 * Издали и на среднем масштабе: из цеха на Лиговском фургоны везут заготовки на открытые точки,
 * монеты выручки едут обратно, над стройками — часы до открытия.
 * Вблизи и на среднем масштабе: прохожие идут к дверям точек, повара смены стоят у входа.
 * Слои проявляются и тают плавно (классы lf-far и lf-near); невидимые слои через полсекунды
 * снимаются со страницы, чтобы не занимать браузер.
 * Числа берутся из расчёта: людей тем больше, чем больше чеков в день; монет — чем больше выручка.
 */
import { memo, useEffect, useState } from "react";
import type { ZoomLevel } from "./MapShell";
import type { ScenePoint } from "./MapPage";
import { onWater, random, type Transform } from "./geo/geo";
import { BuildTimer, Coin, Cook, Van, Walker } from "./geo/pieces";

const stillness = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Показан, пока условие верно, и ещё ms после — чтобы слой успел растаять. */
function useLingering(shown: boolean, ms = 600) {
  const [mounted, setMounted] = useState(shown);
  useEffect(() => {
    if (shown) {
      setMounted(true);
      return;
    }
    const timer = window.setTimeout(() => setMounted(false), ms);
    return () => window.clearTimeout(timer);
  }, [ms, shown]);
  return mounted;
}

type Props = {
  points: ScenePoint[];
  zoom: ZoomLevel;
  month: number;
  leadMonths: number;
  toScene: Transform;
};

/** Дуга от цеха к точке: изгиб вбок на пятую часть расстояния. */
function arc(from: ScenePoint, to: ScenePoint) {
  const dx = to.sx - from.sx;
  const dy = to.sy - from.sy;
  const cx = (from.sx + to.sx) / 2 - dy * 0.22;
  const cy = (from.sy + to.sy) / 2 + dx * 0.22 - Math.hypot(dx, dy) * 0.12;
  const r = (value: number) => Math.round(value * 10) / 10;
  return `M${r(from.sx)} ${r(from.sy)}Q${r(cx)} ${r(cy)} ${r(to.sx)} ${r(to.sy)}`;
}

const Supply = memo(function Supply({ points, moving }: { points: ScenePoint[]; moving: boolean }) {
  const base = points.find((item) => item.point.isBase && item.state === "open");
  if (!base) return null;
  const served = points.filter((item) => !item.point.isBase && item.state === "open");
  return (
    <g className="lf-far">
      {served.map((item, index) => {
        const route = arc(base, item);
        const meters = Math.hypot(item.x - base.x, item.y - base.y);
        const seconds = 5 + meters / 700;
        const coins = Math.max(1, Math.min(3, Math.round((item.point.monthlyRevenueRub ?? 0) / 2_500_000)));
        return (
          <g key={item.point.id}>
            <path className="lf-route" d={route} />
            <g className="lf-mover">
              <g className="lf-scale is-van"><Van /></g>
              {moving ? <animateMotion dur={`${seconds.toFixed(1)}s`} begin={`${-(index * 1.7).toFixed(1)}s`} repeatCount="indefinite" path={route} keyPoints="0;1;0" keyTimes="0;0.5;1" calcMode="linear" /> : <animateMotion dur="1s" fill="freeze" path={route} keyPoints="0.5;0.5" keyTimes="0;1" calcMode="linear" />}
            </g>
            {moving
              ? Array.from({ length: coins }, (_, coin) => (
                  <g key={coin} className="lf-mover">
                    <g className="lf-scale is-coin"><Coin /></g>
                    <animateMotion dur={`${(seconds * 0.8).toFixed(1)}s`} begin={`${-((coin / coins) * seconds * 0.8 + index).toFixed(1)}s`} repeatCount="indefinite" path={route} keyPoints="1;0" keyTimes="0;1" calcMode="linear" />
                  </g>
                ))
              : null}
          </g>
        );
      })}
    </g>
  );
});

const Street = memo(function Street({ points, moving, toScene }: { points: ScenePoint[]; moving: boolean; toScene: Transform }) {
  const open = points.filter((item) => item.state === "open");
  return (
    <g className="lf-near">
      {open.map((item) => {
        const next = random(Math.round(item.x * 7 + item.y * 13));
        const count = Math.max(2, Math.min(7, Math.round((item.point.checksPerDay ?? 60) / 45)));
        const walkers = [];
        for (let index = 0, tries = 0; index < count && tries < 40; tries += 1) {
          const angle = next() * Math.PI * 2;
          const distance = 170 + next() * 170;
          const x = item.x + Math.cos(angle) * distance;
          const y = item.y + Math.sin(angle) * distance;
          if (onWater(x, y)) continue;
          const [sx, sy] = toScene(x, y);
          const r = (value: number) => Math.round(value * 10) / 10;
          walkers.push(
            <g key={index} className="lf-mover">
              <g className="lf-scale is-walker"><Walker tone={index + Math.round(item.x)} /></g>
              {moving ? (
                <animateMotion dur={`${(7 + next() * 6).toFixed(1)}s`} begin={`${(-next() * 10).toFixed(1)}s`} repeatCount="indefinite" path={`M${r(sx)} ${r(sy)}L${r(item.sx)} ${r(item.sy)}`} keyPoints="0;1" keyTimes="0;1" calcMode="linear" />
              ) : (
                <animateMotion dur="1s" fill="freeze" path={`M${r(sx)} ${r(sy)}L${r(item.sx)} ${r(item.sy)}`} keyPoints="0.6;0.6" keyTimes="0;1" calcMode="linear" />
              )}
            </g>,
          );
          index += 1;
        }
        return <g key={item.point.id}>{walkers}</g>;
      })}
    </g>
  );
});

/** Часы над стройками: сколько месяцев осталось до открытия. */
const Timers = memo(function Timers({ points, month, leadMonths }: { points: ScenePoint[]; month: number; leadMonths: number }) {
  return (
    <g className="lf-timers">
      {points.filter((item) => item.state === "site").map((item) => {
        const opening = item.point.openingMonth;
        const left = opening - month;
        const share = leadMonths > 0 ? 1 - left / (leadMonths + 1) : 1;
        return (
          <g key={item.point.id} transform={`translate(${Math.round(item.sx)} ${Math.round(item.sy)})`}>
            <g className="lf-scale is-timer">
              <g transform="translate(34 -66)"><BuildTimer share={share} left={left} /></g>
            </g>
          </g>
        );
      })}
    </g>
  );
});

/**
 * Повара смены у входа в точку. Стоят над домиком точки: площадка под домиком их бы закрыла.
 * Видны вблизи и на среднем масштабе.
 */
export function MapCrew({ points, zoom }: { points: ScenePoint[]; zoom: ZoomLevel }) {
  const shown = useLingering(zoom !== "far");
  if (!shown) return null;
  return (
    <g className="lf-layer">
      <g className="lf-near">
        {points.filter((item) => item.state === "open").map((item) => {
          const cooks = Math.min(4, item.point.staffOnShift);
          return (
            <g key={item.point.id} transform={`translate(${Math.round(item.sx)} ${Math.round(item.sy)})`}>
              <g className="lf-scale is-crew">
                {Array.from({ length: cooks }, (_, index) => (
                  <g key={index} transform={`translate(${-22 - index * 9} ${4 + (index % 2) * 3})`}>
                    <g className="lf-bob" style={{ animationDelay: `${-index * 0.4}s` }}><Cook /></g>
                  </g>
                ))}
              </g>
            </g>
          );
        })}
      </g>
    </g>
  );
}

export function MapLife({ points, zoom, month, leadMonths, toScene }: Props) {
  const moving = !stillness();
  const showSupply = useLingering(zoom !== "near");
  const showStreet = useLingering(zoom !== "far");
  return (
    <g className="lf-layer">
      {showSupply ? <Supply points={points} moving={moving} /> : null}
      {showStreet ? <Street points={points} moving={moving} toScene={toScene} /> : null}
      <Timers points={points} month={month} leadMonths={leadMonths} />
    </g>
  );
}
