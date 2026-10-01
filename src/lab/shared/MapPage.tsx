import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { formatMoneyShort, formatRub, scenarioTitles } from "../format";
import type { NetworkStory, StoryPlanEntry } from "../story";
import type { VariantProps } from "../useNetworkStory";
import type { Camera } from "./camera";
import { CashChart, ProfitChart } from "./Charts";
import { ControlsBar } from "./ControlsBar";
import { MapCrew, MapLife } from "./MapLife";
import { levelOf, MapShell, type ZoomLevel } from "./MapShell";
import { Timeline } from "./Timeline";
import { usePlayback } from "./usePlayback";
import { containBox, findSpot, placeOnMap, project, type Box, type MapPoint } from "./geo/geo";
import { LotMarker } from "./geo/pieces";
import "./map-page.css";

/** Состояние точки на месяц: работает, строится (вложения уже идут) или пока только место. */
export type PointState = "open" | "site" | "lot";
export type ScenePoint = MapPoint & { state: PointState; fresh: boolean; selected: boolean; sx: number; sy: number };
/** Место под новую точку в своей игре: район, где ещё можно открыть точку. */
export type SceneLot = { districtId: string; title: string; x: number; y: number; sx: number; sy: number; month: number; price: number | null };
export type SceneState = {
  story: NetworkStory;
  month: number;
  points: ScenePoint[];
  select: (id: string | null) => void;
  compact: boolean;
  /** Кадр камеры, когда она остановилась, и насколько он близко. */
  view: Camera;
  zoom: ZoomLevel;
  /** Своя игра: идёт ли она и где можно поставить точку. */
  game: boolean;
  lots: SceneLot[];
  /** Готовые общие слои верхней картинки: жизнь сети — под точками; повара и места под новые точки — над ними. */
  life: ReactNode;
  topLayer: ReactNode;
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
  /** Средний слой: медленная анимация над городом (живая обводка, волны). */
  middle?: (state: SceneState) => ReactNode;
  /** Верхний слой: точки сети, лодки, облака; сюда же вариант ставит state.life (под точками) и state.topLayer (над ними). */
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
  const parts = [`${month === 0 ? "Старт программы" : ordinal(month)}. Точек работает: ${now.openPoints} из ${story.totals.pointCount}${building ? `, строится: ${building}` : ""}.`];
  const cash = now.cumulativeCashRub;
  const payback = story.totals.paybackMonth;
  const money = cash < 0 ? `Сеть в минусе на ${formatMoneyShort(-cash)}` : `Сеть в плюсе на ${formatMoneyShort(cash)}`;
  if (payback === null) parts.push(`${money}, вложения за горизонтом расчёта не возвращаются.`);
  else if (month < payback) parts.push(`${money}, вложения вернутся на ${payback}-м месяце.`);
  else parts.push(`${money}, вложения вернулись на ${payback}-м месяце.`);
  return parts.join(" ");
}

type Change = { title: string; points: [number, number]; investment: [number | null, number | null]; payback: [number | null, number | null] };

/** Что поменялось после смены сценария, размера сети или хода в игре: показывается несколько секунд. */
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
const round = (value: number) => Math.round(value * 10) / 10;

/** Места под новые точки: круг с плюсом и ярлык с районом, месяцем открытия и ценой. */
function Lots({ lots, onPlace }: { lots: SceneLot[]; onPlace: (districtId: string) => void }) {
  return (
    <g className="lf-lots">
      {lots.map((lot) => {
        const title = `${lot.title} · М${lot.month}`;
        const price = lot.price === null ? "" : formatMoneyShort(lot.price);
        const width = Math.max(title.length, price.length) * 6.4 + 18;
        return (
          <g
            key={lot.districtId}
            className="is-point lf-lot-pin"
            transform={`translate(${round(lot.sx)} ${round(lot.sy)})`}
            onClick={() => onPlace(lot.districtId)}
            role="button"
            aria-label={`Поставить точку: ${lot.title}, откроется на ${lot.month}-м месяце`}
          >
            <g className="lf-scale is-lot">
              {/* Прозрачная подложка на весь знак: нажатие засчитывается и в зазоре между кругом и ярлыком. */}
              <rect className="lf-lot-hit" x={-width / 2} y={price ? -56 : -42} width={width} height={price ? 74 : 60} />
              <LotMarker />
              <g className="lf-lot-tag is-detail" transform="translate(0 -22)">
                <rect x={-width / 2} y={price ? -34 : -20} width={width} height={price ? 34 : 20} rx="7" />
                <text y={price ? -20 : -6} textAnchor="middle">{title}</text>
                {price ? <text className="is-price" y="-6" textAnchor="middle">{price}</text> : null}
              </g>
            </g>
          </g>
        );
      })}
    </g>
  );
}

/**
 * Общая страница карты: переключатели, строка «что происходит», цифры месяца, карта варианта
 * с карточкой точки, шкала времени и графики. Режим «Своя игра»: игрок ставит точки по районам
 * прямо на карте, расчёт и касса приходят из калькулятора. Вариант рисует только саму карту.
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
  const current = Math.min(month, last);
  const now = story.months[current];

  // --- Своя игра ------------------------------------------------------------------------------
  const [game, setGame] = useState(false);
  const [history, setHistory] = useState<StoryPlanEntry[][]>([]);
  const [entrySize, setEntrySize] = useState<4 | 8 | 12>(4);
  const [dirty, setDirty] = useState(false);
  const [lastMove, setLastMove] = useState("");
  const plan: StoryPlanEntry[] = story.districts.map((district) => ({ districtId: district.id, openingMonths: district.openingMonths }));
  // Вложения уходят раньше открытия: точка, поставленная сейчас, откроется через срок стройки.
  const earliest = current + lead;
  const canPlace = game && earliest <= last;
  const commit = (next: StoryPlanEntry[], move: string) => {
    setHistory((steps) => [...steps, plan]);
    setDirty(true);
    setLastMove(move);
    controls.setPlan(next);
  };
  const monthsOf = (districtId: string) => plan.find((entry) => entry.districtId === districtId)?.openingMonths ?? [];
  const withMonths = (districtId: string, openingMonths: number[]) => plan.map((entry) => (entry.districtId === districtId ? { districtId, openingMonths } : entry));
  const place = (districtId: string) => {
    if (!canPlace) return;
    const district = story.districts.find((item) => item.id === districtId);
    commit(withMonths(districtId, [...monthsOf(districtId), earliest]), `Ход: ${district?.title ?? "район"}, откроется на ${earliest}-м месяце`);
  };
  const removePoint = (pointId: string) => {
    const point = story.points.find((item) => item.id === pointId);
    if (!point || point.isBase || !point.districtId) return;
    const months = [...monthsOf(point.districtId)];
    const index = months.indexOf(point.openingMonth);
    if (index < 0) return;
    months.splice(index, 1);
    commit(withMonths(point.districtId, months), `Ход: убрана точка «${point.title}»`);
    setSelectedId(null);
  };
  const undo = () => {
    const previous = history[history.length - 1];
    if (!previous) return;
    setHistory((steps) => steps.slice(0, -1));
    setLastMove(`Ход отменён (${history.length})`);
    controls.setPlan(previous);
  };
  const newGame = () => {
    commit(plan.map((entry) => ({ districtId: entry.districtId, openingMonths: [] })), "Новая игра: только первая точка с цехом");
    setMonth(0);
    setSelectedId(null);
  };
  // Готовый размер сети или сброс к таблице заканчивают игру: план снова расчётный.
  // Отмена хода может вернуть ровно расчётный план — это не конец игры, поэтому решает нажатая кнопка.
  const endGame = () => {
    setGame(false);
    setDirty(false);
    setHistory([]);
    setLastMove("");
  };
  const barControls = {
    ...controls,
    setRolloutSize: (size: 4 | 8 | 12) => {
      endGame();
      controls.setRolloutSize(size);
    },
    reset: () => {
      endGame();
      controls.reset();
    },
  };

  const enterGame = () => {
    if (game) return;
    setEntrySize(controls.rolloutSize === "custom" ? 4 : controls.rolloutSize);
    setGame(true);
    setSelectedId(null);
  };
  const leaveGame = () => {
    if (dirty) controls.setRolloutSize(entrySize);
    endGame();
  };
  const points = useMemo<ScenePoint[]>(() => placed.map((item) => {
    const opening = item.point.isBase ? 0 : item.point.openingMonth;
    const state: PointState = opening <= current ? "open" : opening - lead <= current ? "site" : "lot";
    const [sx, sy] = scene.toScene(item.x, item.y);
    return { ...item, state, fresh: opening === current && !item.point.isBase, selected: item.point.id === selectedId, sx, sy };
  }), [current, lead, placed, scene, selectedId]);

  const lots = useMemo<SceneLot[]>(() => {
    if (!canPlace) return [];
    const taken: Array<[number, number]> = placed.map((item) => [item.x, item.y]);
    return story.districts
      .filter((district) => district.openingMonths.length < story.rules.maxPointsPerDistrict)
      .map((district) => {
        const [cx, cy] = project(district.place.lat, district.place.lon);
        const [x, y] = findSpot(cx, cy, district.openingMonths.length, taken);
        taken.push([x, y]);
        const [sx, sy] = scene.toScene(x, y);
        return { districtId: district.id, title: district.title, x, y, sx, sy, month: earliest, price: district.investmentRub };
      });
  }, [canPlace, earliest, placed, scene, story.districts, story.rules.maxPointsPerDistrict]);

  const selected = points.find((item) => item.selected) ?? null;
  // При входе в игру камера один раз подлетает к местам под точки: их видно крупно, ярлыки читаются.
  // Дальше камерой управляет игрок; цель полёта через полторы секунды забывается.
  const [gameFocus, setGameFocus] = useState<{ x: number; y: number } | null>(null);
  const flown = useRef(false);
  const lotsCount = lots.length;
  useEffect(() => {
    if (!game) {
      flown.current = false;
      return;
    }
    if (flown.current || !lotsCount) return;
    flown.current = true;
    setGameFocus({
      x: lots.reduce((sum, lot) => sum + lot.sx, 0) / lotsCount,
      y: lots.reduce((sum, lot) => sum + lot.sy, 0) / lotsCount,
    });
  }, [game, lots, lotsCount]);
  useEffect(() => {
    if (!gameFocus) return;
    const timer = window.setTimeout(() => setGameFocus(null), 1500);
    return () => window.clearTimeout(timer);
  }, [gameFocus]);
  const building = points.filter((item) => item.state === "site").length;
  const investedToDate = useMemo(() => story.months.slice(0, current + 1).reduce((total, item) => total + item.investedRub, 0), [current, story.months]);
  const changeKey = game ? `game|${history.length}|${lastMove}` : `${controls.scenarioId}|${controls.rolloutSize}`;
  const changeTitle = game ? lastMove || "Своя игра" : controls.rolloutSize === "custom" ? "Свой план сети" : `${scenarioTitles[controls.scenarioId]} сценарий, сеть +${controls.rolloutSize} точек`;
  const change = useChange(story, changeKey, changeTitle);

  const select = (id: string | null) => setSelectedId((value) => (id === value ? null : id));
  const life = <MapLife points={points} zoom={zoom} month={current} leadMonths={lead} toScene={scene.toScene} />;
  const topLayer = (
    <>
      <MapCrew points={points} zoom={zoom} />
      {lots.length ? <Lots lots={lots} onPlace={place} /> : null}
    </>
  );
  const sceneState: SceneState = { story, month: current, points, select, compact, view, zoom, game, lots, life, topLayer };

  return (
    <div className="lab-mappage">
      <div className="lab-mappage-bar">
        <ControlsBar controls={barControls} />
        <div className="lab-segment lab-mode" role="group" aria-label="Режим">
          <button type="button" className={game ? "" : "is-selected"} onClick={leaveGame}>Как в расчёте</button>
          <button type="button" className={game ? "is-selected" : ""} onClick={enterGame}>Своя игра</button>
        </div>
      </div>

      <p className="lab-headline" aria-live="polite">
        {headline(story, current, building)}
        {game ? <span className="lab-headline-game">{canPlace ? ` Поставите точку сейчас — откроется на ${earliest}-м месяце.` : " Месяцы программы закончились: верните время назад, чтобы сыграть ещё."}</span> : null}
      </p>
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
            className={`${scene.className}${game ? " is-game" : ""}`}
            label={scene.label}
            world={scene.bounds}
            home={home}
            closeW={scene.closeW}
            aspect={aspect}
            focus={selected ? { x: selected.sx, y: selected.sy } : gameFocus}
            month={now.month}
            calendarMonth={now.calendarMonth}
            playing={playing}
            onToggle={toggle}
            onBackground={() => setSelectedId(null)}
            onView={setView}
            defs={scene.defs}
            middle={scene.middle?.(sceneState)}
            overlay={scene.overlay ? scene.overlay(sceneState) : <>{life}{topLayer}</>}
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
              <div className="lab-card-actions">
                {game && !selected.point.isBase ? <button className="lab-card-close is-danger" type="button" onClick={() => removePoint(selected.point.id)}>Убрать точку</button> : null}
                <button className="lab-card-close" type="button" onClick={() => setSelectedId(null)}>Вся сеть</button>
              </div>
            </>
          ) : game ? (
            <>
              <h3>Ваш ход</h3>
              <p>{canPlace ? `Нажмите плюс на карте или кнопку ниже. Точка начнёт строиться в этом месяце и откроется на ${earliest}-м. Касса и графики пересчитываются сразу.` : "Месяцы программы закончились: верните время назад на шкале, чтобы сыграть ещё."}</p>
              <div className="lab-card-actions">
                <button className="lab-card-close" type="button" onClick={undo} disabled={!history.length}>Отменить ход</button>
                <button className="lab-card-close" type="button" onClick={newGame}>Новая игра</button>
              </div>
              <ul className="lab-game-list">
                {story.districts.map((district) => {
                  const full = district.openingMonths.length >= story.rules.maxPointsPerDistrict;
                  return (
                    <li key={district.id}>
                      <div>
                        <strong>{district.title}</strong>
                        <span>{district.formatTitle}, вложения {formatMoneyShort(district.investmentRub)}, выручка {formatMoneyShort(district.monthlyRevenueRub)} в месяц</span>
                        <span>Точек в районе: {district.openingMonths.length} из {story.rules.maxPointsPerDistrict}</span>
                      </div>
                      <button type="button" onClick={() => place(district.id)} disabled={!canPlace || full}>{full ? "Занято" : "Поставить"}</button>
                    </li>
                  );
                })}
              </ul>
            </>
          ) : (
            <>
              <h3>Сеть по месяцам</h3>
              <p>Нажмите «пуск» или двигайте время. Точки открываются в своих районах; нажмите на точку, чтобы увидеть её цифры. Карту можно приближать. «Своя игра» — расставить точки самому.</p>
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
