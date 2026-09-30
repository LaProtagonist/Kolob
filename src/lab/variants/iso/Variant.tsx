import { useCallback, useEffect, useMemo, useState, type MouseEvent } from "react";
import { formatMoneyShort, formatRub } from "../../format";
import { ControlsBar } from "../../shared/ControlsBar";
import { CashChart, ProfitChart } from "../../shared/Charts";
import { Timeline } from "../../shared/Timeline";
import { usePlayback } from "../../shared/usePlayback";
import type { VariantProps } from "../../useNetworkStory";
import { frameCamera, placePoints, type Cell } from "./city";
import { buildCity, orderOf, pointShadow, PointSprite, Selection, type SceneItem } from "./scene";
import "./iso.css";

const compactQuery = "(max-width: 720px)";
/** Самая доходная точка сети показывает столько монет; остальные — пропорционально своей выручке. */
const COINS_AT_BEST = 5;

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

export default function Variant({ story, controls }: VariantProps) {
  const last = story.months.length - 1;
  const { month, setMonth, playing, toggle } = usePlayback(last, Math.min(story.totals.lastOpeningMonth ?? 12, last));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const compact = useCompact();
  const now = story.months[Math.min(month, last)];
  const selected = story.points.find((point) => point.id === selectedId) ?? null;
  const investedToDate = story.months.slice(0, month + 1).reduce((total, item) => total + item.investedRub, 0);

  // Город зависит только от расклада точек и ширины экрана: при ходе времени он не пересобирается.
  const scene = useMemo(() => {
    const lots = placePoints(story.points);
    const cells = story.points.map((point) => lots.get(point.id) as Cell);
    const camera = frameCamera(cells, compact);
    return { lots, camera, city: buildCity(camera, cells) };
  }, [story.points, compact]);

  const coinRub = Math.max(0, ...story.points.map((point) => point.monthlyRevenueRub ?? 0)) / COINS_AT_BEST;
  const toggleSelected = useCallback((id: string) => setSelectedId((current) => (current === id ? null : id)), []);
  const clearSelected = (event: MouseEvent<SVGSVGElement>) => {
    if (event.target === event.currentTarget) setSelectedId(null);
  };

  const sprites: SceneItem[] = story.points.map((point) => {
    const cell = scene.lots.get(point.id) as Cell;
    const open = point.openingMonth <= month;
    return {
      order: orderOf(cell),
      key: point.id,
      node: (
        <PointSprite
          key={point.id}
          point={point}
          cell={cell}
          open={open}
          // Два шага времени подряд: при «пуске» здание успевает «выскочить» до конца.
          fresh={!point.isBase && open && month - point.openingMonth <= 1}
          selected={point.id === selectedId}
          coins={coinRub > 0 && point.monthlyRevenueRub ? Math.max(1, Math.round(point.monthlyRevenueRub / coinRub)) : 0}
          onToggle={toggleSelected}
        />
      ),
    };
  });
  const items = [...scene.city.items, ...sprites].sort((left, right) => left.order - right.order);
  const shadows = story.points
    .filter((point) => point.openingMonth <= month)
    .map((point) => pointShadow(point, scene.lots.get(point.id) as Cell))
    .join("");
  const { camera } = scene;

  return (
    <div className="iso-variant">
      <ControlsBar controls={controls} />

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
        <div className="iso-board">
          <svg
            className="iso-scene"
            viewBox={`${camera.x} ${camera.y} ${camera.w} ${camera.h}`}
            role="group"
            aria-label="Изометрическая карта центра Петербурга с точками сети"
            onClick={clearSelected}
          >
            <g className="iso-backdrop">
              {scene.city.ground}
              <path className="iso-shadow" d={shadows} />
            </g>
            {items.map((item) => item.node)}
            {selected ? (
              <Selection point={selected} cell={scene.lots.get(selected.id) as Cell} open={selected.openingMonth <= month} camera={camera} />
            ) : null}
          </svg>
          <p className="iso-legend">
            <span><i className="iso-legend-coin" />монета — около {formatMoneyShort(coinRub)} выручки точки в месяц</span>
            <span><i className="iso-legend-site" />табличка на стройплощадке — месяц открытия</span>
          </p>
        </div>

        <aside className="iso-card" aria-live="polite">
          {selected ? (
            <>
              <h3>{selected.title}</h3>
              <p>{selected.isBase ? "Первая точка с залом и заготовочное производство" : selected.formatTitle}</p>
              <dl>
                <div><dt>Открытие</dt><dd>{selected.isBase ? "со старта" : `${selected.openingMonth}-й месяц`}</dd></div>
                <div><dt>Площадь</dt><dd>{selected.areaM2 ? `${selected.areaM2} м²` : "по договору"}</dd></div>
                {selected.seats ? <div><dt>Мест в зале</dt><dd>{selected.seats}</dd></div> : null}
                <div><dt>Чеков в день</dt><dd>{selected.checksPerDay ?? "—"}</dd></div>
                <div><dt>Выручка в месяц</dt><dd>{formatRub(selected.monthlyRevenueRub)}</dd></div>
                <div><dt>Вложения в открытие</dt><dd>{formatRub(selected.investmentRub)}</dd></div>
                <div><dt>На смене / в штате</dt><dd>{selected.staffOnShift} / {selected.staffTotal}</dd></div>
              </dl>
              <ul>
                {selected.staffRoles.map((role) => <li key={role.name}>{role.name} · {role.count}</li>)}
              </ul>
            </>
          ) : (
            <>
              <h3>Сеть по месяцам</h3>
              <p>Двигайте время или нажмите «пуск»: стройплощадки по очереди становятся точками. Нажмите на здание, чтобы увидеть его площадь, поток, штат и вложения.</p>
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
      </div>

      <Timeline story={story} month={month} onMonth={setMonth} playing={playing} onToggle={toggle} />

      <div className="iso-charts">
        <CashChart story={story} month={month} onMonth={setMonth} />
        <ProfitChart story={story} month={month} onMonth={setMonth} />
      </div>
    </div>
  );
}
