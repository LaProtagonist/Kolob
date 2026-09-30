import { useMemo, useState, useSyncExternalStore } from "react";
import { formatMoneyShort, formatMonth, formatRub, yearOf } from "../../format";
import { ControlsBar } from "../../shared/ControlsBar";
import { CashChart, ProfitChart } from "../../shared/Charts";
import { Timeline } from "../../shared/Timeline";
import { usePlayback } from "../../shared/usePlayback";
import type { StoryPoint } from "../../story";
import type { VariantProps } from "../../useNetworkStory";
import { buildBoard, districtStroke, type Board, type TrackCell } from "./board";
import { BanknotesIcon, CardStack, ChestIcon, CoinsIcon, Flag, House, HouseSlot, Meeple, Pawn, type HouseKind } from "./pieces";
import "./toy.css";

const locationTitles: Record<StoryPoint["locationType"], string> = {
  street: "Улица",
  foodhall: "Фудхолл",
  creative_cluster: "Креативный кластер",
  foodtruck: "Фудтрак",
};

/** Вид домика: первая точка с производством, точка с залом или точка на вынос. */
const houseKind = (point: StoryPoint): HouseKind => (point.isBase ? "base" : point.format === "with_seating" ? "seating" : "takeaway");

const narrowQuery = "(max-width: 720px)";

/** На телефоне поле стоит вертикально — клетки и домики получаются крупнее. */
function useNarrowScreen() {
  return useSyncExternalStore(
    (notify) => {
      const list = window.matchMedia(narrowQuery);
      list.addEventListener("change", notify);
      return () => list.removeEventListener("change", notify);
    },
    () => window.matchMedia(narrowQuery).matches,
    () => false,
  );
}

function plural(count: number, one: string, few: string, many: string) {
  const tail = Math.abs(count) % 100;
  if (tail >= 11 && tail <= 14) return many;
  return tail % 10 === 1 ? one : tail % 10 >= 2 && tail % 10 <= 4 ? few : many;
}

/** Подпись в полосе между дорожкой и районами, рядом с клеткой возврата вложений. */
function PaybackLabel({ board, cell }: { board: Board; cell: TrackCell }) {
  const half = 96;
  const along = (value: number, min: number, max: number) => Math.max(min + half, Math.min(max - half, value));
  if (cell.side === 0 || cell.side === 2) {
    return (
      <text className="toy-payback-label" x={along(cell.x, board.inner.left, board.inner.right)} y={cell.side === 0 ? board.ringOffset : board.height - board.ringOffset}>
        возврат вложений
      </text>
    );
  }
  const x = cell.side === 1 ? board.width - board.ringOffset : board.ringOffset;
  return (
    <text className="toy-payback-label" transform={`translate(${x} ${along(cell.y, board.inner.top, board.inner.bottom)}) rotate(${cell.side === 1 ? 90 : -90})`}>
      возврат вложений
    </text>
  );
}

/** Три карточки выбранной точки: формат, команда по ролям, поток гостей. */
function PointCards({ point, busiestChecks }: { point: StoryPoint; busiestChecks: number }) {
  const checks = point.checksPerDay;
  return (
    <div className="toy-cards" key={point.id}>
      <article className="toy-card is-format">
        <h4 className="toy-card-band">Формат</h4>
        <div className="toy-card-body">
          <strong className="toy-card-lead">{point.formatTitle}</strong>
          {point.isBase ? <p>Первая точка сети и заготовочное производство</p> : null}
          <dl>
            <div><dt>Место</dt><dd>{locationTitles[point.locationType]}</dd></div>
            <div><dt>Площадь</dt><dd>{point.areaM2 ? `${point.areaM2} м²` : "по договору"}</dd></div>
            {point.seats !== null ? <div><dt>Мест в зале</dt><dd>{point.seats}</dd></div> : null}
            <div><dt>Бар</dt><dd>{point.barEnabled ? "есть" : "нет"}</dd></div>
          </dl>
        </div>
      </article>

      <article className="toy-card is-team">
        <h4 className="toy-card-band">Команда</h4>
        <div className="toy-card-body">
          <strong className="toy-card-lead">{point.staffTotal} в штате · {point.staffOnShift} на смене</strong>
          <ul className="toy-roles">
            {point.staffRoles.map((role, index) => (
              <li key={role.name}>
                <span>{role.name}</span>
                <span className="toy-meeples" aria-hidden="true">
                  {Array.from({ length: Math.min(role.count, 8) }, (_, copy) => <Meeple key={copy} tone={index} />)}
                </span>
                <b>{role.count}</b>
              </li>
            ))}
          </ul>
        </div>
      </article>

      <article className="toy-card is-guests">
        <h4 className="toy-card-band">Гости</h4>
        <div className="toy-card-body">
          <strong className="toy-card-lead">{checks === null ? "Поток не задан" : `${checks} ${plural(checks, "чек", "чека", "чеков")} в день`}</strong>
          {checks !== null && busiestChecks > 0 ? (
            <>
              <div className="toy-flow" role="img" aria-label="Поток гостей в сравнении с самой людной точкой сети">
                <i style={{ width: `${Math.round((checks / busiestChecks) * 100)}%` }} />
              </div>
              <p>Полоса — поток рядом с самой людной точкой сети</p>
            </>
          ) : null}
          <dl>
            <div><dt>Выручка в месяц</dt><dd>{formatRub(point.monthlyRevenueRub)}</dd></div>
            <div><dt>Вложения в открытие</dt><dd>{formatRub(point.investmentRub)}</dd></div>
          </dl>
        </div>
      </article>
    </div>
  );
}

export default function Variant({ story, controls }: VariantProps) {
  const last = story.months.length - 1;
  const { month, setMonth, playing, toggle } = usePlayback(last, Math.min(story.totals.lastOpeningMonth ?? 12, last));
  const [pickedId, setPickedId] = useState<string | null>(null);
  const portrait = useNarrowScreen();
  const board = useMemo(() => buildBoard(story, portrait), [story, portrait]);

  const facts = useMemo(() => {
    let invested = 0;
    const investedByMonth = story.months.map((item) => (invested += item.investedRub));
    const openings = new Map<number, StoryPoint[]>();
    for (const point of story.points) openings.set(point.openingMonth, [...(openings.get(point.openingMonth) ?? []), point]);
    return {
      investedByMonth,
      openings,
      investedTotal: invested,
      bestRevenue: Math.max(0, ...story.months.map((item) => item.revenueRub)),
      busiestChecks: Math.max(0, ...story.points.map((point) => point.checksPerDay ?? 0)),
    };
  }, [story]);

  const current = Math.min(month, last);
  const now = story.months[current];
  const payback = story.totals.paybackMonth;
  const paybackCell = payback !== null && payback <= last ? board.cells[payback] : null;
  const opened = story.points.filter((point) => point.openingMonth <= current);
  // Пока точку не выбрали, карточки показывают последнюю поставленную на поле.
  const selected: StoryPoint | undefined = story.points.find((point) => point.id === pickedId) ?? opened[opened.length - 1] ?? story.points[0];
  const selectedIndex = selected ? story.points.indexOf(selected) : 0;
  const step = (shift: number) => setPickedId(story.points[(selectedIndex + shift + story.points.length) % story.points.length].id);
  const tokens = useMemo(() => board.districts.flatMap((district) => district.tokens).sort((left, right) => left.y - right.y), [board]);
  const pawn = board.cells[current];

  return (
    <div className="toy-variant">
      <ControlsBar controls={controls} />

      <section className="toy-bank" aria-label="Касса сети">
        <div className="toy-bank-head">
          <span className="toy-bank-title">Касса</span>
          <span className="toy-bank-turn">ход <b>{current}</b> из {last} · {formatMonth(now.month, now.calendarMonth)} · {yearOf(now.month)}-й год</span>
        </div>
        <div className="toy-bank-tray">
          <div className="toy-well">
            <BanknotesIcon level={facts.investedTotal > 0 ? facts.investedByMonth[current] / facts.investedTotal : 0} />
            <span>Вложено</span>
            <strong>{formatMoneyShort(facts.investedByMonth[current])}</strong>
            <small>{now.investedRub > 0 ? `в этом месяце ${formatMoneyShort(now.investedRub)}` : "в этом месяце без вложений"}</small>
          </div>
          <div className="toy-well">
            <CoinsIcon level={facts.bestRevenue > 0 ? now.revenueRub / facts.bestRevenue : 0} />
            <span>Выручка месяца</span>
            <strong>{formatMoneyShort(now.revenueRub)}</strong>
            <small>работает точек: {now.openPoints} из {story.totals.pointCount}</small>
          </div>
          <div className={`toy-well ${now.cumulativeCashRub >= 0 ? "is-plus" : "is-minus"}`}>
            <ChestIcon open={now.cumulativeCashRub >= 0} />
            <span>Накоплено</span>
            <strong>{formatMoneyShort(now.cumulativeCashRub)}</strong>
            <small>
              {payback === null
                ? "возврат вложений за горизонтом расчёта"
                : current < payback ? `вложения вернутся на ${payback}-м месяце` : `вложения вернулись на ${payback}-м месяце`}
            </small>
          </div>
        </div>
        {story.isPartial ? <p className="toy-note">Часть статей в расчёте ещё без оценки — касса показывает известную часть.</p> : null}
      </section>

      <div className="toy-stage">
        <div className="toy-table">
          <svg
            className={`toy-board ${portrait ? "is-portrait" : "is-landscape"}`}
            viewBox={`0 0 ${board.width} ${board.height}`}
            role="group"
            aria-label="Игровое поле: дорожка месяцев по краю, районы и точки сети в центре"
          >
            <defs>
              <pattern id="toy-dots" width="18" height="18" patternUnits="userSpaceOnUse">
                <circle className="toy-dot" cx="4" cy="4" r="1.6" />
                <circle className="toy-dot" cx="13" cy="13" r="1.6" />
              </pattern>
            </defs>
            <rect className="toy-board-edge" width={board.width} height={board.height} rx="30" />
            <rect className="toy-board-paper" x="5" y="5" width={board.width - 10} height={board.height - 10} rx="26" />

            <g aria-hidden="true">
              {board.districts.map((district) => (
                <g key={district.id} className={`toy-district is-tone-${district.tone}`}>
                  <path className="toy-district-land" d={district.path} strokeWidth={districtStroke} />
                  <path className="toy-district-dots" d={district.path} fill="url(#toy-dots)" />
                  <text className="toy-district-label" x={district.labelX} y={district.labelY}>
                    {district.lines.map((line, index) => <tspan key={line} x={district.labelX} dy={index ? 26 : 0}>{line}</tspan>)}
                  </text>
                </g>
              ))}
            </g>

            <g aria-hidden="true">
              {board.cells.map((cell) => {
                const item = story.months[cell.index];
                const tilt = (((cell.index * 37) % 5) - 2) * 0.8;
                if (!item) {
                  return (
                    <g key={cell.index} className="toy-cell-spare" transform={`translate(${cell.x} ${cell.y})`}>
                      <rect x="-21" y="-21" width="42" height="42" rx="11" />
                      <path d="M0 -11 L3.2 -3.6 L11 -3.2 L5 1.8 L7 9.6 L0 5.4 L-7 9.6 L-5 1.8 L-11 -3.2 L-3.2 -3.6 Z" />
                    </g>
                  );
                }
                const opening = facts.openings.get(cell.index)?.[0];
                const kind = opening ? houseKind(opening) : null;
                const classes = `${cell.index <= current ? "toy-cell-past" : "toy-cell"}${item.cumulativeCashRub >= 0 ? " is-plus" : ""}${yearOf(cell.index) % 2 === 0 ? " is-alt" : ""}`;
                return (
                  <g key={cell.index} className={classes} transform={`translate(${cell.x} ${cell.y})`} onClick={() => setMonth(cell.index)}>
                    <rect className="toy-cell-tile" x="-21" y="-21" width="42" height="42" rx="11" transform={`rotate(${tilt})`} />
                    {cell.index === payback ? <Flag /> : kind ? (
                      <g transform={kind === "base" ? "translate(0 15) scale(0.5)" : "translate(0 15) scale(0.62)"}><House kind={kind} /></g>
                    ) : <text className="toy-cell-number" y="1">{cell.index}</text>}
                  </g>
                );
              })}
              {paybackCell ? <PaybackLabel board={board} cell={paybackCell} /> : null}
            </g>

            {tokens.map(({ point, x, y, scale }) => {
              const open = point.openingMonth <= current;
              const pick = () => setPickedId(point.id === pickedId ? null : point.id);
              return (
                <g
                  key={point.id}
                  className={`toy-token${point.id === selected?.id ? " is-selected" : ""}`}
                  transform={`translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${scale})`}
                  role="button"
                  tabIndex={0}
                  aria-pressed={point.id === selected?.id}
                  aria-label={`${point.title}: ${open ? "точка открыта" : `откроется на ${point.openingMonth}-м месяце`}. Показать карточки`}
                  onClick={pick}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" && event.key !== " ") return;
                    event.preventDefault();
                    pick();
                  }}
                >
                  <rect className="toy-token-hit" x="-33" y="-60" width="74" height="70" rx="14" />
                  <ellipse className="toy-token-ring" cx="0" cy="1" rx="35" ry="11" />
                  {open ? (
                    <g className={`toy-token-drop${point.openingMonth === current && !point.isBase ? " is-fresh" : ""}`}>
                      <g transform="translate(18 -3)"><CardStack /></g>
                      <House kind={houseKind(point)} />
                    </g>
                  ) : <HouseSlot month={point.openingMonth} />}
                </g>
              );
            })}

            <g className="toy-pawn-place" style={{ transform: `translate(${pawn.x}px, ${pawn.y}px)` }} aria-hidden="true">
              <Pawn />
            </g>
          </svg>

          <ul className="toy-legend">
            <li><svg viewBox="-24 -24 48 48" aria-hidden="true"><Pawn /></svg>текущий месяц</li>
            <li><i className="toy-legend-cell" />вложения ещё не вернулись</li>
            <li><i className="toy-legend-cell is-plus" />сеть в плюсе</li>
            <li><svg viewBox="-24 -24 48 48" aria-hidden="true"><Flag /></svg>{payback === null ? "возврат вложений — за горизонтом расчёта" : `возврат вложений: ${payback}-й месяц`}</li>
            <li><svg viewBox="-28 -52 56 56" aria-hidden="true"><House kind="seating" /></svg>точка с залом</li>
            <li><svg viewBox="-28 -52 56 56" aria-hidden="true"><House kind="takeaway" /></svg>точка на вынос</li>
            <li><svg viewBox="-28 -52 56 56" aria-hidden="true"><HouseSlot /></svg>место под точку и месяц открытия</li>
          </ul>
          <p className="toy-hint">Нажмите на домик — раскроется его стопка карточек. Клетка дорожки переносит на свой месяц.</p>
        </div>

        <div className="toy-time">
          <Timeline
            story={story}
            month={month}
            onMonth={setMonth}
            playing={playing}
            onToggle={() => {
              // На «пуск» карточки снова следуют за новой точкой.
              if (!playing) setPickedId(null);
              toggle();
            }}
          />
        </div>

        {selected ? (
          <aside className="toy-hand" aria-live="polite">
            <div className="toy-hand-head">
              <button type="button" onClick={() => step(-1)} aria-label="Предыдущая точка">‹</button>
              <div>
                <h3>{selected.title}</h3>
                <p>
                  точка {selectedIndex + 1} из {story.points.length} ·{" "}
                  {selected.openingMonth > current
                    ? `встанет на поле на ${selected.openingMonth}-м месяце`
                    : selected.isBase ? "на поле со старта" : `на поле с ${selected.openingMonth}-го месяца`}
                </p>
              </div>
              <button type="button" onClick={() => step(1)} aria-label="Следующая точка">›</button>
            </div>
            <PointCards point={selected} busiestChecks={facts.busiestChecks} />
            <p className="toy-hand-total">В командах открытых точек: {now.staffTotal}</p>
          </aside>
        ) : null}
      </div>

      <div className="toy-charts">
        <CashChart story={story} month={month} onMonth={setMonth} />
        <ProfitChart story={story} month={month} onMonth={setMonth} />
      </div>
    </div>
  );
}
