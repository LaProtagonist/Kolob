import { useState } from "react";
import { formatMoneyShort, formatRub } from "../../format";
import { ControlsBar } from "../../shared/ControlsBar";
import { CashChart, ProfitChart } from "../../shared/Charts";
import { Timeline } from "../../shared/Timeline";
import { usePlayback } from "../../shared/usePlayback";
import type { VariantProps } from "../../useNetworkStory";
import { CityStage } from "./CityStage";
import "./city3d.css";

/** Вариант «Город в 3D»: объёмный город из простых форм, здания точек вырастают в месяц открытия. */
export default function Variant({ story, controls }: VariantProps) {
  const last = story.months.length - 1;
  const { month, setMonth, playing, toggle } = usePlayback(last, Math.min(story.totals.lastOpeningMonth ?? 12, last));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const now = story.months[Math.min(month, last)];
  const selectedIndex = story.points.findIndex((point) => point.id === selectedId);
  const selected = selectedIndex >= 0 ? story.points[selectedIndex] : null;
  const investedToDate = story.months.slice(0, month + 1).reduce((total, item) => total + item.investedRub, 0);

  const step = (shift: number) => {
    const count = story.points.length;
    if (!count) return;
    const from = selectedIndex >= 0 ? selectedIndex : shift > 0 ? -1 : 0;
    setSelectedId(story.points[(from + shift + count) % count].id);
  };

  return (
    <div className="city3d-variant">
      <ControlsBar controls={controls} />

      <div className="city3d-kpis">
        <div><span>Открыто точек</span><strong>{now.openPoints} из {story.totals.pointCount}</strong></div>
        <div><span>Сотрудников</span><strong>{now.staffTotal}</strong></div>
        <div><span>Выручка за месяц</span><strong>{formatMoneyShort(now.revenueRub)}</strong></div>
        <div><span>Вложено к этому месяцу</span><strong>{formatMoneyShort(investedToDate)}</strong></div>
        <div className={now.cumulativeCashRub >= 0 ? "is-positive" : "is-negative"}><span>Накопленные деньги</span><strong>{formatMoneyShort(now.cumulativeCashRub)}</strong></div>
      </div>

      <div className="city3d-layout">
        <CityStage points={story.points} month={month} selectedId={selected ? selected.id : null} onSelect={setSelectedId} />

        <aside className="city3d-card" aria-live="polite">
          {selected ? (
            <>
              <h3>{selected.title}</h3>
              <p>{selected.isBase ? "Первая точка с залом и заготовочное производство" : selected.formatTitle}</p>
              <dl>
                <div><dt>Открытие</dt><dd>{selected.isBase ? "со старта" : `${selected.openingMonth}-й месяц`}</dd></div>
                <div><dt>Сейчас</dt><dd>{selected.openingMonth <= month ? "работает" : "ещё не открыта"}</dd></div>
                <div><dt>Площадь</dt><dd>{selected.areaM2 ? `${selected.areaM2} м²` : "по договору"}</dd></div>
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
              <p>Двигайте время или нажмите «пуск»: здания точек вырастают в месяц открытия. Нажмите на здание, чтобы увидеть его площадь, поток, штат и вложения.</p>
              <dl>
                <div><dt>Все точки открыты</dt><dd>{story.totals.lastOpeningMonth !== null ? `${story.totals.lastOpeningMonth}-й месяц` : "—"}</dd></div>
                <div><dt>Возврат вложений</dt><dd>{story.totals.paybackMonth !== null ? `${story.totals.paybackMonth}-й месяц` : "за горизонтом расчёта"}</dd></div>
                <div><dt>Нужно профинансировать</dt><dd>{formatMoneyShort(story.totals.peakFundingRub)}</dd></div>
              </dl>
              {story.isPartial ? <p className="city3d-note">Часть статей в расчёте ещё без оценки — итог показывает известную часть.</p> : null}
            </>
          )}
          <div className="city3d-card-nav">
            <button type="button" onClick={() => step(-1)} aria-label="Предыдущая точка">←</button>
            <span>{selected ? `Точка ${selectedIndex + 1} из ${story.points.length}` : "Точки по порядку открытия"}</span>
            <button type="button" onClick={() => step(1)} aria-label="Следующая точка">→</button>
          </div>
        </aside>
      </div>

      <Timeline story={story} month={month} onMonth={setMonth} playing={playing} onToggle={toggle} />

      <div className="city3d-charts">
        <CashChart story={story} month={month} onMonth={setMonth} />
        <ProfitChart story={story} month={month} onMonth={setMonth} />
      </div>
    </div>
  );
}
