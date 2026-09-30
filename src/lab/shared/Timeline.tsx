import type { NetworkStory } from "../story";
import { formatMonth, yearOf } from "../format";

type Props = {
  story: NetworkStory;
  month: number;
  onMonth: (month: number) => void;
  playing: boolean;
  onToggle: () => void;
};

/** Шкала времени: ползунок по месяцам, отметки открытий и окупаемости, кнопка «пуск». */
export function Timeline({ story, month, onMonth, playing, onToggle }: Props) {
  const last = story.months.length - 1;
  const current = story.months[Math.min(month, last)];
  const mark = (value: number) => `${(value / Math.max(last, 1)) * 100}%`;
  return (
    <div className="lab-timeline">
      <button className="lab-play" type="button" onClick={onToggle} aria-label={playing ? "Пауза" : "Запустить время"}>
        {playing ? "❚❚" : "▶"}
      </button>
      <div className="lab-timeline-track">
        <div className="lab-timeline-marks" aria-hidden="true">
          {story.points.filter((point) => !point.isBase).map((point) => (
            <i key={point.id} className="is-opening" style={{ left: mark(point.openingMonth) }} title={`Открытие: ${point.title}`} />
          ))}
          {story.totals.paybackMonth !== null && story.totals.paybackMonth <= last ? (
            <i className="is-payback" style={{ left: mark(story.totals.paybackMonth) }} title="Сеть вернула вложения" />
          ) : null}
        </div>
        <input
          type="range"
          min={0}
          max={last}
          value={Math.min(month, last)}
          onChange={(event) => onMonth(Number(event.target.value))}
          aria-label="Месяц программы"
        />
        <div className="lab-timeline-years" aria-hidden="true">
          {Array.from({ length: Math.ceil(last / 12) }, (_, index) => (
            <span key={index} style={{ left: mark(index * 12) }}>{index + 1}-й год</span>
          ))}
        </div>
      </div>
      <strong className="lab-timeline-now">
        {formatMonth(current.month, current.calendarMonth)}
        <small>{yearOf(current.month)}-й год</small>
      </strong>
    </div>
  );
}
