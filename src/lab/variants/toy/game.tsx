import { formatMoneyShort } from "../../format";
import type { NetworkStory } from "../../story";
import { houseKind, locationTitles } from "./labels";
import { House } from "./pieces";

type Props = {
  story: NetworkStory;
  /** Месяц, в который встанет следующая точка, и самый ранний месяц, доступный с текущего хода. */
  targetMonth: number;
  earliestMonth: number;
  lastMonth: number;
  onShiftTarget: (delta: number) => void;
  onPlace: (districtId: string) => void;
  onUndo: (() => void) | null;
  onNewGame: () => void;
};

/**
 * Ход игрока: в каком месяце и в каком районе открыть следующую точку.
 * Формат точки задаёт район — так устроены группы точек в калькуляторе.
 */
export function GamePanel({ story, targetMonth, earliestMonth, lastMonth, onShiftTarget, onPlace, onUndo, onNewGame }: Props) {
  const canPlace = earliestMonth <= lastMonth;
  const lead = story.rules.openingLeadMonths;
  const finalCash = story.months[lastMonth].cumulativeCashRub;
  return (
    <section className="toy-game" aria-label="Своя игра">
      <div className="toy-game-head">
        <h3>Ваш ход</h3>
        <div className="toy-game-actions">
          <button type="button" onClick={onUndo ?? undefined} disabled={!onUndo}>Отменить ход</button>
          <button type="button" onClick={onNewGame}>Новая игра</button>
        </div>
      </div>

      {canPlace ? (
        <div className="toy-game-when">
          <span>Открыть точку в месяце</span>
          <div className="toy-stepper">
            <button type="button" onClick={() => onShiftTarget(-1)} disabled={targetMonth <= earliestMonth} aria-label="На месяц раньше">−</button>
            <strong>М{targetMonth}</strong>
            <button type="button" onClick={() => onShiftTarget(1)} disabled={targetMonth >= lastMonth} aria-label="На месяц позже">+</button>
          </div>
          <small>{lead > 0 ? `Вложения в точку уходят за ${lead} мес. до открытия, поэтому раньше М${earliestMonth} открыть нельзя.` : "Вложения в точку уходят в месяц открытия."}</small>
        </div>
      ) : <p className="toy-game-note">Расчёт закончился: новые точки уже не успеют открыться. Передвиньте время назад или начните новую игру.</p>}

      {story.districts.length ? (
        <ul className="toy-offers">
          {story.districts.map((district) => {
            const full = district.openingMonths.length >= story.rules.maxPointsPerDistrict;
            return (
              <li key={district.id}>
                <svg viewBox="-28 -52 56 56" aria-hidden="true"><House kind={houseKind(district)} /></svg>
                <div>
                  <strong>{district.title}</strong>
                  <span>{district.formatTitle} · {locationTitles[district.locationType]}</span>
                  <span>вложения {formatMoneyShort(district.investmentRub)} · выручка {formatMoneyShort(district.monthlyRevenueRub)} в месяц</span>
                  <span>на поле {district.openingMonths.length} из {story.rules.maxPointsPerDistrict}</span>
                </div>
                <button type="button" onClick={() => onPlace(district.id)} disabled={!canPlace || full} aria-label={`Поставить точку: ${district.title}, месяц ${targetMonth}`}>
                  {full ? "Занято" : "Поставить"}
                </button>
              </li>
            );
          })}
        </ul>
      ) : <p className="toy-game-note">В калькуляторе не осталось районов для новых точек. Верните расчётный план кнопкой «+4 точек».</p>}

      <dl className="toy-score">
        <div><dt>Возврат вложений</dt><dd>{story.totals.paybackMonth === null ? "за горизонтом расчёта" : `${story.totals.paybackMonth}-й месяц`}</dd></div>
        <div><dt>Самый глубокий минус — столько берётся в долг</dt><dd>{formatMoneyShort(story.totals.peakFundingRub)}</dd></div>
        <div className={finalCash >= 0 ? "is-plus" : "is-minus"}><dt>В кассе к концу расчёта</dt><dd>{formatMoneyShort(finalCash)}</dd></div>
      </dl>
    </section>
  );
}
