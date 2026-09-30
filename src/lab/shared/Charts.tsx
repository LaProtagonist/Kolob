import type { NetworkStory } from "../story";
import { formatMoneyShort } from "../format";

type ChartProps = { story: NetworkStory; month: number; onMonth?: (month: number) => void };

const width = 560;
const height = 190;
const pad = { left: 8, right: 8, top: 14, bottom: 22 };

function scaleX(index: number, count: number) {
  return pad.left + (index / Math.max(count - 1, 1)) * (width - pad.left - pad.right);
}

function pickMonth(event: React.PointerEvent<SVGSVGElement>, count: number) {
  const box = event.currentTarget.getBoundingClientRect();
  const ratio = (event.clientX - box.left) / box.width;
  return Math.max(0, Math.min(count - 1, Math.round(ratio * (count - 1))));
}

/** Накопленные деньги сети: ниже нуля — вложено, выше — возвращено. */
export function CashChart({ story, month, onMonth }: ChartProps) {
  const values = story.months.map((item) => item.cumulativeCashRub);
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const y = (value: number) => pad.top + ((max - value) / Math.max(max - min, 1)) * (height - pad.top - pad.bottom);
  const line = values.map((value, index) => `${index ? "L" : "M"}${scaleX(index, values.length).toFixed(1)} ${y(value).toFixed(1)}`).join(" ");
  const zero = y(0);
  const current = Math.min(month, values.length - 1);
  return (
    <figure className="lab-chart">
      <figcaption>
        Накопленные деньги сети
        <strong>{formatMoneyShort(values[current])}</strong>
      </figcaption>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="График накопленных денег сети по месяцам"
        onPointerDown={onMonth ? (event) => onMonth(pickMonth(event, values.length)) : undefined}>
        <path className="lab-chart-area" d={`${line} L${scaleX(values.length - 1, values.length)} ${zero} L${pad.left} ${zero} Z`} />
        <line className="lab-chart-zero" x1={pad.left} x2={width - pad.right} y1={zero} y2={zero} />
        <path className="lab-chart-line" d={line} />
        {story.totals.paybackMonth !== null && story.totals.paybackMonth < values.length ? (
          <g className="lab-chart-payback">
            <circle cx={scaleX(story.totals.paybackMonth, values.length)} cy={zero} r="5" />
            <text x={scaleX(story.totals.paybackMonth, values.length)} y={zero - 10} textAnchor="middle">возврат вложений</text>
          </g>
        ) : null}
        <line className="lab-chart-cursor" x1={scaleX(current, values.length)} x2={scaleX(current, values.length)} y1={pad.top} y2={height - pad.bottom} />
        <circle className="lab-chart-dot" cx={scaleX(current, values.length)} cy={y(values[current])} r="5" />
        <text className="lab-chart-axis" x={pad.left} y={height - 6}>старт</text>
        <text className="lab-chart-axis" x={width - pad.right} y={height - 6} textAnchor="end">{values.length - 1} мес.</text>
      </svg>
    </figure>
  );
}

/** Операционная прибыль по месяцам: столбик на месяц. */
export function ProfitChart({ story, month, onMonth }: ChartProps) {
  const values = story.months.map((item) => item.ebitdaRub);
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const y = (value: number) => pad.top + ((max - value) / Math.max(max - min, 1)) * (height - pad.top - pad.bottom);
  const zero = y(0);
  const step = (width - pad.left - pad.right) / values.length;
  const current = Math.min(month, values.length - 1);
  return (
    <figure className="lab-chart">
      <figcaption>
        Операционная прибыль за месяц
        <strong>{formatMoneyShort(values[current])}</strong>
      </figcaption>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="График операционной прибыли сети по месяцам"
        onPointerDown={onMonth ? (event) => onMonth(pickMonth(event, values.length)) : undefined}>
        {values.map((value, index) => (
          <rect
            key={index}
            className={`lab-chart-bar${index === current ? " is-current" : ""}${index > current ? " is-future" : ""}`}
            x={pad.left + index * step + 0.6}
            width={Math.max(step - 1.2, 1)}
            y={Math.min(y(value), zero)}
            height={Math.max(Math.abs(y(value) - zero), 1)}
          />
        ))}
        <line className="lab-chart-zero" x1={pad.left} x2={width - pad.right} y1={zero} y2={zero} />
        <text className="lab-chart-axis" x={pad.left} y={height - 6}>старт</text>
        <text className="lab-chart-axis" x={width - pad.right} y={height - 6} textAnchor="end">{values.length - 1} мес.</text>
      </svg>
    </figure>
  );
}
