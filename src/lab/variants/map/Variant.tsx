import { useState } from "react";
import { formatMoneyShort, formatRub } from "../../format";
import { ControlsBar } from "../../shared/ControlsBar";
import { CashChart, ProfitChart } from "../../shared/Charts";
import { Timeline } from "../../shared/Timeline";
import { usePlayback } from "../../shared/usePlayback";
import type { StoryPoint } from "../../story";
import type { VariantProps } from "../../useNetworkStory";
import "./map.css";

const W = 1000;
const H = 620;

/** Значок точки: цех с трубой, зал с навесом или киоск «на вынос». */
function PointMark({ point, open, selected, fresh }: { point: StoryPoint; open: boolean; selected: boolean; fresh: boolean }) {
  const size = point.isBase ? 1.35 : point.format === "with_seating" ? 1.1 : 0.9;
  return (
    <g
      className={`map-point${open ? " is-open" : " is-planned"}${selected ? " is-selected" : ""}${fresh ? " is-fresh" : ""}`}
      transform={`translate(${point.place.x * W} ${point.place.y * H}) scale(${size})`}
    >
      {open ? <circle className="map-point-pulse" r="34" /> : null}
      <ellipse className="map-point-shadow" cx="0" cy="20" rx="26" ry="7" />
      {point.isBase ? <rect className="map-point-chimney" x="12" y="-44" width="9" height="20" rx="2" /> : null}
      <rect className="map-point-body" x="-24" y="-24" width="48" height="42" rx="7" />
      <path className="map-point-roof" d={point.format === "with_seating" || point.isBase ? "M-30 -22 L0 -44 L30 -22 Z" : "M-28 -24 H28 L22 -36 H-22 Z"} />
      <rect className="map-point-door" x="-7" y="-2" width="14" height="20" rx="3" />
      <circle className="map-point-logo" cx="0" cy="-12" r="6" />
      {open ? (
        <g className="map-point-staff">
          {Array.from({ length: Math.min(point.staffOnShift, 6) }, (_, index) => (
            <circle key={index} cx={-15 + index * 6} cy="30" r="2.6" />
          ))}
        </g>
      ) : (
        <text className="map-point-when" y="-54" textAnchor="middle">М{point.openingMonth}</text>
      )}
    </g>
  );
}

export default function Variant({ story, controls }: VariantProps) {
  const last = story.months.length - 1;
  const { month, setMonth, playing, toggle } = usePlayback(last, Math.min(story.totals.lastOpeningMonth ?? 12, last));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const now = story.months[Math.min(month, last)];
  const selected = story.points.find((point) => point.id === selectedId) ?? null;
  const investedToDate = story.months.slice(0, month + 1).reduce((total, item) => total + item.investedRub, 0);

  return (
    <div className="map-variant">
      <ControlsBar controls={controls} />

      <div className="map-kpis">
        <div><span>Открыто точек</span><strong>{now.openPoints} из {story.totals.pointCount}</strong></div>
        <div><span>Сотрудников</span><strong>{now.staffTotal}</strong></div>
        <div><span>Выручка за месяц</span><strong>{formatMoneyShort(now.revenueRub)}</strong></div>
        <div><span>Вложено к этому месяцу</span><strong>{formatMoneyShort(investedToDate)}</strong></div>
        <div className={now.cumulativeCashRub >= 0 ? "is-positive" : "is-negative"}><span>Накопленные деньги</span><strong>{formatMoneyShort(now.cumulativeCashRub)}</strong></div>
      </div>

      <div className="map-stage">
        <svg className="map-canvas" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Схема центра Петербурга с точками сети">
          <rect className="map-land" x="0" y="0" width={W} height={H} rx="24" />
          <path className="map-water" d="M-20 150 C160 90 300 190 470 150 C640 110 760 40 1020 90 L1020 -20 L-20 -20 Z" />
          <path className="map-water" d="M60 640 C120 520 90 430 170 380 C230 340 250 250 330 190 L300 170 C210 230 190 330 120 370 C40 420 60 520 -20 600 L-20 640 Z" />
          <path className="map-street is-main" d="M250 250 L880 330" />
          <path className="map-street" d="M740 120 L740 600" />
          <path className="map-street" d="M300 380 C420 470 560 520 700 470" />
          <path className="map-street" d="M120 520 C260 560 420 600 620 580" />
          <text className="map-label" x="560" y="284" transform="rotate(7 560 284)">Невский проспект</text>
          <text className="map-label" x="756" y="200" transform="rotate(90 756 200)">Лиговский проспект</text>
          <text className="map-label is-water" x="560" y="80">Нева</text>
          <text className="map-label" x="380" y="468" transform="rotate(20 380 468)">Садовая</text>

          {story.points.map((point) => (
            <g key={point.id} onClick={() => setSelectedId(point.id === selectedId ? null : point.id)} style={{ cursor: "pointer" }}>
              <PointMark point={point} open={point.openingMonth <= month} selected={point.id === selectedId} fresh={point.openingMonth === month && !point.isBase} />
              <text className="map-point-title" x={point.place.x * W} y={point.place.y * H + 56} textAnchor="middle">{point.title}</text>
            </g>
          ))}
        </svg>

        <aside className="map-card" aria-live="polite">
          {selected ? (
            <>
              <h3>{selected.title}</h3>
              <p>{selected.isBase ? "Первая точка с залом и заготовочное производство" : selected.formatTitle}</p>
              <dl>
                <div><dt>Открытие</dt><dd>{selected.isBase ? "со старта" : `${selected.openingMonth}-й месяц`}</dd></div>
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
              <p>Двигайте время или нажмите «пуск». Нажмите на точку, чтобы увидеть её площадь, поток, штат и вложения.</p>
              <dl>
                <div><dt>Все точки открыты</dt><dd>{story.totals.lastOpeningMonth !== null ? `${story.totals.lastOpeningMonth}-й месяц` : "—"}</dd></div>
                <div><dt>Возврат вложений</dt><dd>{story.totals.paybackMonth !== null ? `${story.totals.paybackMonth}-й месяц` : "за горизонтом расчёта"}</dd></div>
                <div><dt>Нужно профинансировать</dt><dd>{formatMoneyShort(story.totals.peakFundingRub)}</dd></div>
              </dl>
              {story.isPartial ? <p className="map-note">Часть статей в расчёте ещё без оценки — итог показывает известную часть.</p> : null}
            </>
          )}
        </aside>
      </div>

      <Timeline story={story} month={month} onMonth={setMonth} playing={playing} onToggle={toggle} />

      <div className="map-charts">
        <CashChart story={story} month={month} onMonth={setMonth} />
        <ProfitChart story={story} month={month} onMonth={setMonth} />
      </div>
    </div>
  );
}
