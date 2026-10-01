import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { formatMoneyShort, formatRub, scenarioTitles } from "../format";
import type { NetworkStory } from "../story";
import type { VariantProps } from "../useNetworkStory";
import { CashChart, ProfitChart } from "./Charts";
import { ControlsBar } from "./ControlsBar";
import type { Camera } from "./camera";
import { levelOf, MapShell, type ZoomLevel } from "./MapShell";
import { Timeline } from "./Timeline";
import { usePlayback } from "./usePlayback";
import { containBox, placeOnMap, type Box, type MapPoint } from "./geo/geo";
import "./map-page.css";

/** Состояние точки на месяц: работает, строится (вложения уже идут) или пока только место. */
export type PointState = "open" | "site" | "lot";
export type ScenePoint = MapPoint & { state: PointState; fresh: boolean; selected: boolean; sx: number; sy: number };
export type SceneState = {
  story: NetworkStory;
  month: number;
  points: ScenePoint[];
  select: (id: string | null) => void;
  compact: boolean;
  /** Кадр камеры, когда она остановилась, и насколько он близко. */
  view: Camera;
  zoom: ZoomLevel;
};

/**
 * Что вариант рисует на общей странице карты. Координаты карты — метры (x на восток, y на юг);
 * toScene переводит их в единицы рисунка варианта (для плоской карты — те же метры).
 */
export type MapScene = {
  className: string;
  label: string;
  /** Нарисованный участок в единицах рисунка. */
  bounds: Box;
  /** Поля вокруг города в кадре «город целиком», в единицах рисунка. */
  pad: number;
  /** Ширина самого ближнего кадра. */
  closeW: number;
  toScene: (x: number, y: number) => [number, number];
  defs?: ReactNode;
  /** Неподвижный город и всё, что не анимируется. */
  render: (state: SceneState) => ReactNode;
  /** Верхний слой: точки сети, лодки, облака, живая обводка. */
  overlay?: (state: SceneState) => ReactNode;
  legend?: ReactNode;
};

const COMPACT = "(max-width: 720px)";

function useCompact() {
  const [compact, setCompact] = useState(() => typeof window !== "undefined" && window.matchMedia(COMPACT).matches);
  useEffect(() => {
    const query = window.matchMedia(COMPACT);
    const update = () => setCompact(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return compact;
}

const ordinal = (month: number) => `${month}-й месяц`;

/** Одна строка о том, что происходит в выбранный месяц, — простыми словами. */
function headline(story: NetworkStory, month: number, building: number) {
  const now = story.months[month];
  const parts = [`${month === 0 ? "Старт программы" : ordinal(month)}. Работают ${now.openPoints} из ${story.totals.pointCount} точек${building ? `, строятся ${building}` : ""}.`];
  const cash = now.cumulativeCashRub;
  const payback = story.totals.paybackMonth;
  const money = cash < 0 ? `Сеть в минусе на ${formatMoneyShort(-cash)}` : `Сеть в плюсе на ${formatMoneyShort(cash)}`;
  if (payback === null) parts.push(`${money}, вложения за горизонтом расчёта не возвращаются.`);
  else if (month < payback) parts.push(`${money}, вложения вернутся на ${payback}-м месяце.`);
  else parts.push(`${money}, вложения вернулись на ${payback}-м месяце.`);
  return parts.join(" ");
}

type Change = { title: string; points: [number, number]; investment: [number | null, number | null]; payback: [number | null, number | null] };

/** Что поменялось после смены сценария или размера сети: показывается несколько секунд. */
function useChange(story: NetworkStory, key: string, title: string) {
  const previous = useRef({ key, story });
  const [change, setChange] = useState<Change | null>(null);
  useEffect(() => {
    const before = previous.current;
    previous.current = { key, story };
    if (before.key === key) return;
    setChange({
      title,
      points: [before.story.totals.pointCount, story.totals.pointCount],
      investment: [before.story.totals.investmentRub, story.totals.investmentRub],
      payback: [before.story.totals.paybackMonth, story.totals.paybackMonth],
    });
    const timer = window.setTimeout(() => setChange(null), 9000);
    return () => window.clearTimeout(timer);
  }, [key, story, title]);
  return change;
}

const monthText = (value: number | null) => (value === null ? "нет" : `${value}-й мес.`);

/**
 * Общая страница карты: переключатели, строка «что происходит», цифры месяца, карта варианта
 * с карточкой точки, шкала времени и графики. Вариант рисует только саму карту.
 */
export function MapPage({ story, controls, scene }: VariantProps & { scene: MapScene }) {
  const last = story.months.length - 1;
  const { month, setMonth, playing, toggle } = usePlayback(last, Math.min(story.totals.lastOpeningMonth ?? 12, last));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const compact = useCompact();
  const aspect = compact ? 1 : 1.6;
  const home = useMemo(() => containBox(scene.bounds, aspect, scene.pad), [aspect, scene.bounds, scene.pad]);
  const [view, setView] = useState<Camera>(home);
  useEffect(() => setView(home), [home]);
  const zoom = levelOf(view, home);
  const placed = useMemo(() => placeOnMap(story.points), [story.points]);
  const lead = story.rules.openingLeadMonths;
  const now = story.months[Math.min(month, last)];

  const points = useMemo<ScenePoint[]>(() => placed.map((item) => {
    const opening = item.point.isBase ? 0 : item.point.openingMonth;
    const state: PointState = opening <= month ? "open" : opening - lead <= month ? "site" : "lot";
    const [sx, sy] = scene.toScene(item.x, item.y);
    return { ...item, state, fresh: opening === month && !item.point.isBase, selected: item.point.id === selectedId, sx, sy };
  }), [lead, month, placed, scene, selectedId]);

  const selected = points.find((item) => item.selected) ?? null;
  const building = points.filter((item) => item.state === "site").length;
  const investedToDate = useMemo(() => story.months.slice(0, month + 1).reduce((total, item) => total + item.investedRub, 0), [month, story.months]);
  const changeKey = `${controls.scenarioId}|${controls.rolloutSize}`;
  const changeTitle = controls.rolloutSize === "custom" ? "Свой план сети" : `${scenarioTitles[controls.scenarioId]} сценарий, сеть +${controls.rolloutSize} точек`;
  const change = useChange(story, changeKey, changeTitle);

  const select = (id: string | null) => setSelectedId((current) => (id === current ? null : id));
  const sceneState: SceneState = { story, month: Math.min(month, last), points, select, compact, view, zoom };

  return (
    <div className="lab-mappage">
      <ControlsBar controls={controls} />

      <p className="lab-headline" aria-live="polite">{headline(story, Math.min(month, last), building)}</p>
      {change ? (
        <p className="lab-change" role="status">
          <strong>{change.title}</strong>
          <span>Точек {change.points[0]} → <b>{change.points[1]}</b></span>
          <span>Вложения {formatMoneyShort(change.investment[0])} → <b>{formatMoneyShort(change.investment[1])}</b></span>
          <span>Возврат {monthText(change.payback[0])} → <b>{monthText(change.payback[1])}</b></span>
        </p>
      ) : null}

      <div className="lab-kpis">
        <div><span>Работает точек</span><strong>{now.openPoints} из {story.totals.pointCount}</strong></div>
        <div><span>Сотрудников</span><strong>{now.staffTotal}</strong></div>
        <div><span>Выручка за месяц</span><strong>{formatMoneyShort(now.revenueRub)}</strong></div>
        <div><span>Вложено к этому месяцу</span><strong>{formatMoneyShort(investedToDate)}</strong></div>
        <div className={now.cumulativeCashRub >= 0 ? "is-positive" : "is-negative"}><span>Накопленные деньги</span><strong>{formatMoneyShort(now.cumulativeCashRub)}</strong></div>
      </div>

      <div className="lab-mapgrid">
        <div className="lab-mapcol">
          <MapShell
            className={scene.className}
            label={scene.label}
            world={scene.bounds}
            home={home}
            closeW={scene.closeW}
            aspect={aspect}
            focus={selected ? { x: selected.sx, y: selected.sy } : null}
            month={now.month}
            calendarMonth={now.calendarMonth}
            playing={playing}
            onToggle={toggle}
            onBackground={() => setSelectedId(null)}
            onView={setView}
            defs={scene.defs}
            overlay={scene.overlay?.(sceneState)}
          >
            {scene.render(sceneState)}
          </MapShell>
          {scene.legend ? <div className="lab-legend">{scene.legend}</div> : null}
        </div>

        <aside className="lab-card" aria-live="polite">
          {selected ? (
            <>
              <h3>{selected.point.title}</h3>
              <p>{selected.point.isBase ? "Первая точка с залом и заготовочное производство для всей сети" : selected.point.formatTitle}</p>
              <dl>
                <div><dt>Открытие</dt><dd>{selected.point.isBase ? "со старта" : ordinal(selected.point.openingMonth)}</dd></div>
                <div><dt>Площадь</dt><dd>{selected.point.areaM2 ? `${selected.point.areaM2} м²` : "по договору"}</dd></div>
                <div><dt>Чеков в день</dt><dd>{selected.point.checksPerDay ?? "—"}</dd></div>
                <div><dt>Выручка в месяц</dt><dd>{formatRub(selected.point.monthlyRevenueRub)}</dd></div>
                <div><dt>Вложения в открытие</dt><dd>{formatRub(selected.point.investmentRub)}</dd></div>
                <div><dt>На смене и в штате</dt><dd>{selected.point.staffOnShift} и {selected.point.staffTotal}</dd></div>
              </dl>
              <ul>
                {selected.point.staffRoles.map((role) => <li key={role.name}>{role.name}: {role.count}</li>)}
              </ul>
              <button className="lab-card-close" type="button" onClick={() => setSelectedId(null)}>Вся сеть</button>
            </>
          ) : (
            <>
              <h3>Сеть по месяцам</h3>
              <p>Нажмите «пуск» или двигайте время. Точки открываются в своих районах; нажмите на точку, чтобы увидеть её цифры. Карту можно приближать.</p>
              <dl>
                <div><dt>Все точки открыты</dt><dd>{story.totals.lastOpeningMonth !== null ? ordinal(story.totals.lastOpeningMonth) : "—"}</dd></div>
                <div><dt>Возврат вложений</dt><dd>{story.totals.paybackMonth !== null ? ordinal(story.totals.paybackMonth) : "за горизонтом расчёта"}</dd></div>
                <div><dt>Нужно профинансировать</dt><dd>{formatMoneyShort(story.totals.peakFundingRub)}</dd></div>
              </dl>
              {story.isPartial ? <p className="lab-card-note">Часть статей в расчёте ещё без оценки: итог показывает известную часть.</p> : null}
            </>
          )}
        </aside>
      </div>

      <Timeline story={story} month={month} onMonth={setMonth} playing={playing} onToggle={toggle} />

      <div className="lab-charts">
        <CashChart story={story} month={month} onMonth={setMonth} />
        <ProfitChart story={story} month={month} onMonth={setMonth} />
      </div>
    </div>
  );
}
