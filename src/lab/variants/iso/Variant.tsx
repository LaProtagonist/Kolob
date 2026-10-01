import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { formatMoneyShort, formatMonth, formatRub, scenarioTitles, yearOf } from "../../format";
import { ControlsBar } from "../../shared/ControlsBar";
import { CashChart, ProfitChart } from "../../shared/Charts";
import { Timeline } from "../../shared/Timeline";
import { usePlayback } from "../../shared/usePlayback";
import type { NetworkStory, StoryPoint } from "../../story";
import type { StoryControls, VariantProps } from "../../useNetworkStory";
import { useCamera } from "./camera";
import { closeWidth, frameAspect, frameCamera, placePoints, sameFrame, screenX, screenY, worldFrame, type Camera, type Cell } from "./city";
import { Boat, buildCity, orderOf, pointShadow, PointLife, PointSprite, Selection, SiteSign, type SceneItem } from "./scene";
import "./iso.css";

const compactQuery = "(max-width: 720px)";
/** Самая доходная точка сети показывает столько монет; остальные — пропорционально своей выручке. */
const COINS_AT_BEST = 5;
/** К точке с самым большим потоком идёт столько гостей; к остальным — пропорционально их чекам в день. */
const GUESTS_AT_BEST = 5;

/** Люди и мелкие детали видны, когда кадр уже́ этого числа ширин «одной точки вблизи». */
const DETAIL_ZOOM = 1.7;
/** Сколько подсвечиваются площадки, появившиеся после смены сценария или размера сети. */
const NEW_SITE_MS = 2000;
/** Изменение расчёта приписывается нажатию на переключатель, если пришло не позже этого. */
const CAUSE_MS = 3000;

type Totals = NetworkStory["totals"];
type Change = { id: number; cause: string; before: Totals };
/** Что сейчас видит камера: близко ли она, у каких точек показывать людей, можно ли ещё приблизить или отдалить. */
type Sight = { detail: boolean; ids: string[]; atHome: boolean; atClose: boolean };

const noIds: ReadonlySet<string> = new Set();

const locationTitles: Record<string, string> = {
  street: "улица",
  foodhall: "фудхолл",
  creative_cluster: "креативный кластер",
  foodtruck: "фудтрак",
};

/** Узкий экран получает свой кадр: город крупнее и почти квадратом. */
function useCompact() {
  const [compact, setCompact] = useState(() => typeof window !== "undefined" && window.matchMedia(compactQuery).matches);
  useEffect(() => {
    const media = window.matchMedia(compactQuery);
    const update = () => setCompact(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return compact;
}

/** Сколько значков показать: у лучшей точки — best, у остальных — по доле от неё, но не меньше одного. */
const scaled = (value: number | null, unit: number) => (value && unit > 0 ? Math.max(1, Math.round(value / unit)) : 0);

const totalsFacts: Array<{ label: string; value: (totals: Totals) => string }> = [
  { label: "Точек", value: (totals) => String(totals.pointCount) },
  { label: "Вложения", value: (totals) => formatMoneyShort(totals.investmentRub) },
  { label: "Возврат", value: (totals) => (totals.paybackMonth !== null ? `${totals.paybackMonth}-й мес.` : "за горизонтом") },
];

/** Строка над сценой: точки, вложения и месяц возврата; после смены сценария или размера сети — «было → стало». */
function ChangeLine({ totals, change }: { totals: Totals; change: Change | null }) {
  return (
    <div className={change ? "iso-change is-changed" : "iso-change"} aria-live="polite">
      <strong key={change?.id ?? 0} className="iso-change-cause">{change ? change.cause : "Сеть сейчас"}</strong>
      {totalsFacts.map((fact) => {
        const now = fact.value(totals);
        const was = change ? fact.value(change.before) : now;
        return (
          <span key={fact.label} className={was !== now ? "iso-change-fact is-diff" : "iso-change-fact"}>
            {fact.label}{" "}
            {was !== now ? <><span className="iso-change-was">{was}</span>{" → "}</> : null}
            <b>{now}</b>
          </span>
        );
      })}
    </div>
  );
}

/** Карточка точки: площадь, штат, выручка и вложения — как они приходят из расчёта. */
function PointCard({ point, open }: { point: StoryPoint; open: boolean }) {
  const place = locationTitles[point.locationType];
  return (
    <>
      <div className="iso-card-head">
        <h3>{point.title}</h3>
        <span className={open ? "iso-status is-open" : "iso-status is-site"}>{open ? "работает" : "строится"}</span>
      </div>
      <p>
        {point.isBase ? "Первая точка с залом и заготовочное производство" : point.formatTitle}
        {place ? ` · ${place}` : ""}
        {point.barEnabled ? " · с баром" : ""}
      </p>
      <div className="iso-facts">
        <div>
          <span>Площадь</span>
          <strong>{point.areaM2 ? `${point.areaM2} м²` : "по договору"}</strong>
          <small>{point.seats ? `мест в зале: ${point.seats}` : point.isBase ? "зал и производство" : "без зала"}</small>
        </div>
        <div>
          <span>Штат</span>
          <strong>{point.staffTotal} чел.</strong>
          <small>на смене: {point.staffOnShift}</small>
        </div>
        <div title={formatRub(point.monthlyRevenueRub)}>
          <span>Выручка в месяц</span>
          <strong>{formatMoneyShort(point.monthlyRevenueRub)}</strong>
          <small>чеков в день: {point.checksPerDay ?? "—"}</small>
        </div>
        <div title={formatRub(point.investmentRub)}>
          <span>Вложения</span>
          <strong>{formatMoneyShort(point.investmentRub)}</strong>
          <small>{point.isBase ? "в открытие, со старта" : `в открытие, ${point.openingMonth}-й месяц`}</small>
        </div>
      </div>
      <h4>Штат по ролям</h4>
      <ul>
        {point.staffRoles.map((role) => <li key={role.name}>{role.name} · {role.count}</li>)}
      </ul>
    </>
  );
}

export default function Variant({ story, controls }: VariantProps) {
  const last = story.months.length - 1;
  const { month, setMonth, playing, toggle } = usePlayback(last, Math.min(story.totals.lastOpeningMonth ?? 12, last));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const compact = useCompact();
  const now = story.months[Math.min(month, last)];
  const selected = story.points.find((point) => point.id === selectedId) ?? null;
  const investedToDate = story.months.slice(0, month + 1).reduce((total, item) => total + item.investedRub, 0);
  const aspect = frameAspect(compact);
  const closeW = closeWidth(compact);

  // Расстановка зависит только от точек и их мест: смена сценария её не трогает, рост сети добавляет точки, не сдвигая прежние.
  const placementKey = story.points.map((point) => `${point.id}@${point.place.x},${point.place.y}`).join("|");
  const pointsRef = useRef(story.points);
  pointsRef.current = story.points;
  const layout = useMemo(() => {
    const lots = placePoints(pointsRef.current);
    const cells = [...lots.values()];
    return { lots, cells, home: frameCamera(cells, compact) };
  }, [placementKey, compact]);

  // Нарисованный участок города только растёт, поэтому город перестраивается лишь когда сеть выходит за него.
  const worldRef = useRef<Camera | null>(null);
  const world = useMemo(() => {
    const next = worldFrame(layout.home, worldRef.current);
    return worldRef.current && sameFrame(next, worldRef.current) ? worldRef.current : next;
  }, [layout.home]);
  useEffect(() => {
    worldRef.current = world;
  }, [world]);
  const city = useMemo(() => buildCity(world, layout.cells), [world, layout.cells]);

  const [sight, setSight] = useState<Sight>({ detail: false, ids: [], atHome: true, atClose: false });
  const detailIds = useMemo(() => new Set(sight.ids), [sight.ids]);
  const screenRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const overlayRef = useRef<SVGSVGElement>(null);
  const camera = useCamera({
    surface: screenRef,
    layers: [svgRef, overlayRef],
    world,
    home: layout.home,
    closeW,
    aspect,
    onSettle: (view) => {
      const detail = view.w <= closeW * DETAIL_ZOOM;
      const ids = detail
        ? [...layout.lots.entries()]
          .filter(([, cell]) => {
            const x = screenX(cell.i + 0.5, cell.j + 0.5);
            const y = screenY(cell.i + 0.5, cell.j + 0.5);
            return x > view.x - 50 && x < view.x + view.w + 50 && y > view.y - 30 && y < view.y + view.h + 90;
          })
          .map(([id]) => id)
        : [];
      const next: Sight = { detail, ids, atHome: view.w >= layout.home.w - 1, atClose: view.w <= closeW + 1 };
      setSight((current) =>
        current.detail === next.detail && current.atHome === next.atHome && current.atClose === next.atClose && current.ids.join("|") === next.ids.join("|") ? current : next);
    },
  });
  const { flyTo, flyHome } = camera;

  const lotsRef = useRef(layout.lots);
  lotsRef.current = layout.lots;
  /** «Одна точка вблизи»: камера подлетает к зданию. */
  const focusPoint = useCallback((id: string) => {
    const cell = lotsRef.current.get(id);
    if (cell) flyTo({ cx: screenX(cell.i + 0.5, cell.j + 0.5), cy: screenY(cell.i + 0.5, cell.j + 0.5) - 22, w: closeW });
  }, [closeW, flyTo]);

  const selectedRef = useRef(selectedId);
  selectedRef.current = selectedId;
  const toggleSelected = useCallback((id: string) => {
    if (selectedRef.current === id) {
      setSelectedId(null);
      return;
    }
    setSelectedId(id);
    focusPoint(id);
  }, [focusPoint]);
  const clearSelected = (event: MouseEvent<SVGSVGElement>) => {
    if (event.target === event.currentTarget) setSelectedId(null);
  };

  /** Кнопка «+»: к выбранной точке, а если ничего не выбрано — к ближайшей к центру кадра. */
  const zoomIn = () => {
    const view = camera.view.current;
    const cx = view.x + view.w / 2;
    const cy = view.y + view.h / 2;
    const target = selected ?? story.points.reduce((best, point) => {
      const distance = (cell: Cell) => (screenX(cell.i + 0.5, cell.j + 0.5) - cx) ** 2 + (screenY(cell.i + 0.5, cell.j + 0.5) - cy) ** 2;
      return distance(layout.lots.get(point.id) as Cell) < distance(layout.lots.get(best.id) as Cell) ? point : best;
    }, story.points[0]);
    setSelectedId(target.id);
    focusPoint(target.id);
  };

  // Переключатели над картой помечают, что изменил посетитель, — строка «что изменилось» называет причину.
  const cause = useRef<{ text: string; at: number } | null>(null);
  const trackedControls = useMemo<StoryControls>(() => {
    const mark = (text: string) => {
      cause.current = { text, at: performance.now() };
    };
    return {
      ...controls,
      setScenarioId: (id) => {
        if (id !== controls.scenarioId) mark(`Сценарий «${scenarioTitles[id] ?? id}»`);
        controls.setScenarioId(id);
      },
      setRolloutSize: (size) => {
        if (size !== controls.rolloutSize) mark(`Сеть +${size} точек`);
        controls.setRolloutSize(size);
      },
      reset: () => {
        mark("Сброс к таблице вводных");
        controls.reset();
      },
    };
  }, [controls]);

  // Расчёт изменился: камера отъезжает на всю сеть, новые площадки подсвечиваются, строка показывает «было → стало».
  const previous = useRef<{ ids: Set<string>; totals: Totals } | null>(null);
  const [change, setChange] = useState<Change | null>(null);
  const [newIds, setNewIds] = useState<ReadonlySet<string>>(noIds);
  useEffect(() => {
    const before = previous.current;
    previous.current = { ids: new Set(story.points.map((point) => point.id)), totals: story.totals };
    if (!before) return;
    const pending = cause.current && performance.now() - cause.current.at < CAUSE_MS ? cause.current.text : null;
    cause.current = null;
    // Изменение не от переключателей (например, пришли вводные из таблицы) показывается без сравнения.
    setChange((current) => (pending ? { id: (current?.id ?? 0) + 1, cause: pending, before: before.totals } : null));
    const added = story.points.filter((point) => !before.ids.has(point.id)).map((point) => point.id);
    if (added.length) setNewIds(new Set(added));
    flyHome();
  }, [story, flyHome]);
  useEffect(() => {
    if (!newIds.size) return;
    const timer = window.setTimeout(() => setNewIds(noIds), NEW_SITE_MS);
    return () => window.clearTimeout(timer);
  }, [newIds]);

  const coinRub = Math.max(0, ...story.points.map((point) => point.monthlyRevenueRub ?? 0)) / COINS_AT_BEST;
  const guestChecks = Math.max(0, ...story.points.map((point) => point.checksPerDay ?? 0)) / GUESTS_AT_BEST;

  const sprites: SceneItem[] = story.points.map((point) => {
    const cell = layout.lots.get(point.id) as Cell;
    return {
      order: orderOf(cell),
      key: point.id,
      node: (
        <PointSprite
          key={point.id}
          point={point}
          cell={cell}
          open={point.openingMonth <= month}
          selected={point.id === selectedId}
          isNew={newIds.has(point.id)}
          onToggle={toggleSelected}
        />
      ),
    };
  });
  const items = [...city.items, ...sprites].sort((left, right) => left.order - right.order);
  // Жизнь у точек — только вблизи и только у точек в кадре; дальние ряды рисуются раньше ближних.
  const lives = sight.detail
    ? story.points
      .filter((point) => detailIds.has(point.id))
      .map((point) => ({ point, cell: layout.lots.get(point.id) as Cell }))
      .sort((left, right) => orderOf(left.cell) - orderOf(right.cell))
    : [];
  const shadows = story.points
    .filter((point) => point.openingMonth <= month)
    .map((point) => pointShadow(point, layout.lots.get(point.id) as Cell))
    .join("");

  // Подписи поверх картинки: что сейчас происходит в сети. Берутся из тех же месяцев и точек.
  const justOpened = [...story.points].reverse().find((point) => !point.isBase && point.openingMonth <= month && month - point.openingMonth <= 2);
  const paidBack = story.totals.paybackMonth !== null && month >= story.totals.paybackMonth;

  return (
    <div className="iso-variant">
      <ControlsBar controls={trackedControls} />

      <div className="iso-kpis">
        <div>
          <svg className="iso-kpi-icon" viewBox="0 0 20 20" aria-hidden="true"><path d="M3 9.5 10 3.5l7 6V17H3z" /></svg>
          <span>Открыто точек</span><strong>{now.openPoints} из {story.totals.pointCount}</strong>
        </div>
        <div>
          <svg className="iso-kpi-icon" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="6.5" r="3.2" /><path d="M4 17c0-3.6 2.6-5.6 6-5.6s6 2 6 5.6z" /></svg>
          <span>Сотрудников</span><strong>{now.staffTotal}</strong>
        </div>
        <div>
          <svg className="iso-kpi-icon" viewBox="0 0 20 20" aria-hidden="true"><ellipse cx="10" cy="7" rx="6.5" ry="3.2" /><path d="M3.5 10.2c0 1.8 2.9 3.2 6.5 3.2s6.5-1.4 6.5-3.2v3c0 1.8-2.9 3.2-6.5 3.2s-6.5-1.4-6.5-3.2z" /></svg>
          <span>Выручка за месяц</span><strong>{formatMoneyShort(now.revenueRub)}</strong>
        </div>
        <div>
          <svg className="iso-kpi-icon" viewBox="0 0 20 20" aria-hidden="true"><path d="M3 12h6v4H3zM11 12h6v4h-6zM7 6.5h6v4H7z" /></svg>
          <span>Вложено к этому месяцу</span><strong>{formatMoneyShort(investedToDate)}</strong>
        </div>
        <div className={now.cumulativeCashRub >= 0 ? "is-positive" : "is-negative"}>
          <svg className="iso-kpi-icon" viewBox="0 0 20 20" aria-hidden="true"><path d="M3 6.5h14V16H3zM3 6.5 13 3.5v3" /><circle cx="13.5" cy="11.2" r="1.4" /></svg>
          <span>Накопленные деньги</span><strong>{formatMoneyShort(now.cumulativeCashRub)}</strong>
        </div>
      </div>

      <div className="iso-stage">
        <ChangeLine totals={story.totals} change={change} />

        <div className="iso-screen" ref={screenRef}>
          <svg
            ref={svgRef}
            className="iso-scene"
            style={{ aspectRatio: `${layout.home.w} / ${layout.home.h}` }}
            role="group"
            aria-label="Изометрическая карта центра Петербурга с точками сети"
            onClick={clearSelected}
          >
            <g className="iso-backdrop">
              {city.ground}
              <path className="iso-shadow" d={shadows} />
            </g>
            {items.map((item) => item.node)}
          </svg>
          {/* Верхний слой: всё, что движется без остановки. Он перерисовывается отдельно от города. */}
          <svg ref={overlayRef} className="iso-life-layer" aria-hidden="true">
            <Boat />
            {lives.map(({ point, cell }) => (
              <PointLife
                key={point.id}
                point={point}
                cell={cell}
                open={point.openingMonth <= month}
                coins={scaled(point.monthlyRevenueRub, coinRub)}
                guests={scaled(point.checksPerDay, guestChecks)}
              />
            ))}
            {story.points
              .filter((point) => point.openingMonth > month)
              .map((point) => <SiteSign key={point.id} point={point} cell={layout.lots.get(point.id) as Cell} onToggle={toggleSelected} />)}
            {selected ? (
              <Selection point={selected} cell={layout.lots.get(selected.id) as Cell} open={selected.openingMonth <= month} camera={layout.home} />
            ) : null}
          </svg>
          <div className="iso-hud">
            <div className="iso-hud-chip is-date">
              <strong>{formatMonth(now.month, now.calendarMonth)}</strong>
              <span>{yearOf(now.month)}-й год</span>
            </div>
          </div>
          <div className="iso-hud-events" aria-live="polite">
            {justOpened ? <div className="iso-hud-chip is-event">Открылась «{justOpened.title}»</div> : null}
            {paidBack ? <div className="iso-hud-chip is-payback">Вложения вернулись</div> : null}
          </div>
          <button className="iso-hud-play" type="button" onClick={toggle} aria-label={playing ? "Пауза" : "Запустить время"}>
            <svg viewBox="0 0 20 20" aria-hidden="true">
              {playing ? <path d="M5.5 4h3.2v12H5.5zM11.3 4h3.2v12h-3.2z" /> : <path d="M6.5 3.8 16 10l-9.5 6.2z" />}
            </svg>
          </button>
          {/* Видна только та кнопка, которая сейчас что-то делает: у «сети целиком» — «+», у «одной точки» — «−». */}
          <div className="iso-zoom" role="group" aria-label="Камера">
            {sight.atClose && selected ? null : (
              <button type="button" onClick={zoomIn} aria-label="Приблизить: одна точка вблизи">
                <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M8.6 3.5h2.8v5.1h5.1v2.8h-5.1v5.1H8.6v-5.1H3.5V8.6h5.1z" /></svg>
              </button>
            )}
            {sight.atHome ? null : (
              <button type="button" onClick={flyHome} aria-label="Отдалить: сеть целиком">
                <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3.5 8.6h13v2.8h-13z" /></svg>
              </button>
            )}
          </div>
        </div>

        <aside className="iso-card" aria-live="polite">
          {selected ? (
            <PointCard point={selected} open={selected.openingMonth <= month} />
          ) : (
            <>
              <h3>Сеть по месяцам</h3>
              <p>Двигайте время или нажмите «пуск»: стройплощадки по очереди становятся точками. Нажмите на здание, чтобы увидеть его площадь, штат, выручку и вложения.</p>
              <dl>
                <div><dt>Все точки открыты</dt><dd>{story.totals.lastOpeningMonth !== null ? `${story.totals.lastOpeningMonth}-й месяц` : "—"}</dd></div>
                <div><dt>Возврат вложений</dt><dd>{story.totals.paybackMonth !== null ? `${story.totals.paybackMonth}-й месяц` : "за горизонтом расчёта"}</dd></div>
                <div><dt>Нужно профинансировать</dt><dd>{formatMoneyShort(story.totals.peakFundingRub)}</dd></div>
              </dl>
              <ul className="iso-formats">
                <li><b className="is-works" />цех с трубой — первая точка и производство</li>
                <li><b className="is-hall" />дом с шатровой крышей — точка с залом</li>
                <li><b className="is-kiosk" />киоск под козырьком — точка на вынос</li>
              </ul>
              {story.isPartial ? <p className="iso-note">Часть статей в расчёте ещё без оценки — итог показывает известную часть.</p> : null}
            </>
          )}
        </aside>

        <p className="iso-legend">
          <span className="iso-legend-hint">{sight.detail ? "Сеть целиком — кнопка «−»" : "Ближе — колесо, щипок, «+» или нажатие на здание: появятся смена, гости и монеты"}</span>
          <span><i className="iso-legend-staff" />в колпаке — сотрудник смены</span>
          <span><i className="iso-legend-guest" />прохожий — около {Math.round(guestChecks)} чеков в день</span>
          <span><i className="iso-legend-coin" />монета — около {formatMoneyShort(coinRub)} выручки в месяц</span>
          <span><i className="iso-legend-site" />табличка на стройке — месяц открытия</span>
        </p>
      </div>

      <Timeline story={story} month={month} onMonth={setMonth} playing={playing} onToggle={toggle} />

      <div className="iso-charts">
        <CashChart story={story} month={month} onMonth={setMonth} />
        <ProfitChart story={story} month={month} onMonth={setMonth} />
      </div>
    </div>
  );
}
