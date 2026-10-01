import { useMemo, useState, useSyncExternalStore } from "react";
import { formatMoneyShort, formatMonth, yearOf } from "../../format";
import { ControlsBar } from "../../shared/ControlsBar";
import { CashChart, ProfitChart } from "../../shared/Charts";
import { Timeline } from "../../shared/Timeline";
import { usePlayback } from "../../shared/usePlayback";
import type { StoryPlanEntry, StoryPoint } from "../../story";
import type { VariantProps } from "../../useNetworkStory";
import { buildBoard, districtStroke, type Board, type TrackCell } from "./board";
import { PointCards } from "./cards";
import { GamePanel } from "./game";
import { houseKind } from "./labels";
import { BanknotesIcon, CardStack, ChestIcon, CoinsIcon, Flag, House, HouseSlot, Pawn } from "./pieces";
import "./toy.css";

/** Выбранная точка: район и номер точки в нём по порядку открытия; у первой точки сети района нет. */
type Picked = { districtId: string | null; index: number };

/**
 * Пометка «в этом браузере идёт своя игра» и расчётный план, с которого она началась.
 * План игрока хранит калькулятор; пометка нужна, чтобы после перезагрузки страница открылась
 * в игре и кнопка «Как в расчёте» знала, что возвращать.
 */
const gameKey = "kolobochnaya.lab.toy.game";

function storedGameSize(): 4 | 8 | 12 | null {
  try {
    const value = Number(window.localStorage.getItem(gameKey));
    return value === 4 || value === 8 || value === 12 ? value : null;
  } catch {
    return null;
  }
}

function storeGameSize(size: 4 | 8 | 12 | null) {
  try {
    if (size === null) window.localStorage.removeItem(gameKey);
    else window.localStorage.setItem(gameKey, String(size));
  } catch {
    // Хранилище недоступно — игра работает, но после перезагрузки откроется просмотр.
  }
}

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

const onActivate = (action: () => void) => (event: React.KeyboardEvent) => {
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  action();
};

export default function Variant({ story, controls }: VariantProps) {
  const last = story.months.length - 1;
  const { month, setMonth, playing, toggle } = usePlayback(last, Math.min(story.totals.lastOpeningMonth ?? 12, last));
  const [picked, setPicked] = useState<Picked | null>(null);
  /** «Как в расчёте» — просмотр плана калькулятора; «Своя игра» — игрок сам ставит точки. */
  const [mode, setMode] = useState<"view" | "game">(() => (storedGameSize() === null ? "view" : "game"));
  /** На сколько месяцев позже самого раннего открыть следующую точку. */
  const [delay, setDelay] = useState(0);
  /** Планы до каждого хода — для «Отменить ход». */
  const [history, setHistory] = useState<StoryPlanEntry[][]>([]);
  /** Расчётный план, с которого началась игра: к нему возвращает «Как в расчёте». */
  const [entrySize, setEntrySize] = useState<4 | 8 | 12>(() => storedGameSize() ?? 4);
  /** Игрок уже менял план: при выходе из игры расчётный план нужно вернуть. */
  const [dirty, setDirty] = useState(() => storedGameSize() !== null);
  const portrait = useNarrowScreen();
  const game = mode === "game";
  const current = Math.min(month, last);
  // Вложения уходят раньше открытия, поэтому новая точка встаёт не раньше этого месяца.
  const earliestMonth = current + story.rules.openingLeadMonths;
  const canPlace = game && earliestMonth <= last;
  const targetMonth = Math.min(last, earliestMonth + delay);
  const board = useMemo(() => buildBoard(story, portrait, canPlace), [story, portrait, canPlace]);

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

  const now = story.months[current];
  const payback = story.totals.paybackMonth;
  const paybackCell = payback !== null && payback <= last ? board.cells[payback] : null;
  const opened = story.points.filter((point) => point.openingMonth <= current);
  // Пока точку не выбрали, карточки показывают последнюю поставленную на поле.
  const inDistrict = (districtId: string | null) => story.points.filter((point) => point.districtId === districtId);
  const pickOf = (point: StoryPoint): Picked => ({ districtId: point.districtId, index: inDistrict(point.districtId).indexOf(point) });
  const pickedPoint = picked ? inDistrict(picked.districtId)[picked.index] : undefined;
  const selected: StoryPoint | undefined = pickedPoint ?? opened[opened.length - 1] ?? story.points[0];
  const selectedIndex = selected ? story.points.indexOf(selected) : 0;
  const step = (shift: number) => setPicked(pickOf(story.points[(selectedIndex + shift + story.points.length) % story.points.length]));

  // Ход игрока — это новый план открытий. Он уходит в калькулятор, и вся касса приходит оттуда пересчитанной.
  const plan: StoryPlanEntry[] = story.districts.map((district) => ({ districtId: district.id, openingMonths: district.openingMonths }));
  const commit = (next: StoryPlanEntry[]) => {
    setHistory((steps) => [...steps, plan]);
    setDirty(true);
    storeGameSize(entrySize);
    controls.setPlan(next);
  };
  const withMonths = (districtId: string, openingMonths: number[]) => plan.map((entry) => (entry.districtId === districtId ? { districtId, openingMonths } : entry));
  const monthsOf = (districtId: string) => plan.find((entry) => entry.districtId === districtId)?.openingMonths ?? [];
  const place = (districtId: string) => {
    const months = monthsOf(districtId);
    commit(withMonths(districtId, [...months, targetMonth]));
    setPicked({ districtId, index: months.filter((value) => value <= targetMonth).length });
  };
  const selectedPick = selected ? pickOf(selected) : null;
  const moveSelected = (delta: number) => {
    if (!selected || !selectedPick || selectedPick.districtId === null) return;
    const next = Math.max(earliestMonth, Math.min(last, selected.openingMonth + delta));
    if (next === selected.openingMonth) return;
    const others = monthsOf(selectedPick.districtId).filter((_, index) => index !== selectedPick.index);
    commit(withMonths(selectedPick.districtId, [...others, next]));
    setPicked({ districtId: selectedPick.districtId, index: others.filter((value) => value < next).length });
  };
  const removeSelected = () => {
    if (!selectedPick || selectedPick.districtId === null) return;
    commit(withMonths(selectedPick.districtId, monthsOf(selectedPick.districtId).filter((_, index) => index !== selectedPick.index)));
    setPicked(null);
  };
  const newGame = () => {
    commit(plan.map((entry) => ({ districtId: entry.districtId, openingMonths: [] })));
    setMonth(0);
    setDelay(0);
    setPicked(null);
  };
  const undo = () => {
    controls.setPlan(history[history.length - 1]);
    setHistory((steps) => steps.slice(0, -1));
    setPicked(null);
  };
  const enterGame = () => {
    if (game) return;
    // Если состав сети уже изменён в калькуляторе, расчётным считается его стандартный план.
    setEntrySize(controls.rolloutSize === "custom" ? 4 : controls.rolloutSize);
    setMode("game");
  };
  const leaveGame = () => {
    if (dirty) controls.setRolloutSize(entrySize);
    storeGameSize(null);
    setDirty(false);
    setHistory([]);
    setDelay(0);
    setPicked(null);
    setMode("view");
  };
  const tokens = useMemo(() => board.districts.flatMap((district) => district.tokens).sort((left, right) => left.y - right.y), [board]);
  const pawn = board.cells[current];

  return (
    <div className="toy-variant">
      <ControlsBar controls={controls} />

      <div className="toy-mode">
        <div className="lab-segment" role="group" aria-label="Режим">
          <button type="button" className={game ? "" : "is-selected"} onClick={leaveGame}>Как в расчёте</button>
          <button type="button" className={game ? "is-selected" : ""} onClick={enterGame}>Своя игра</button>
        </div>
        <p>
          {game
            ? "Вы сами ставите точки на поле. Ходы меняют план сети и в калькуляторе; «Как в расчёте» возвращает расчётный план."
            : "Точки открываются по плану из калькулятора. В «Своей игре» месяц и район каждой новой точки выбираете вы."}
        </p>
      </div>

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
              {game && now.cumulativeCashRub < 0
                ? payback === null ? "играем в долг до конца расчёта" : `играем в долг: касса выйдет в плюс на ${payback}-м месяце`
                : payback === null
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

            {tokens.map(({ point, districtId, x, y, scale }) => {
              const transform = `translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${scale})`;
              if (!point) {
                // Свободное место в районе: нажатие ставит сюда точку на выбранный месяц.
                if (districtId === null) return null;
                const district = story.districts.find((item) => item.id === districtId);
                return (
                  <g
                    key={`add-${districtId}`}
                    className="toy-token toy-add"
                    transform={transform}
                    role="button"
                    tabIndex={0}
                    aria-label={`Поставить точку: ${district?.title ?? "район"}, месяц ${targetMonth}`}
                    onClick={() => place(districtId)}
                    onKeyDown={onActivate(() => place(districtId))}
                  >
                    <rect className="toy-token-hit" x="-33" y="-60" width="74" height="70" rx="14" />
                    <ellipse className="toy-token-ring" cx="0" cy="1" rx="35" ry="11" />
                    <HouseSlot label="+" />
                  </g>
                );
              }
              const open = point.openingMonth <= current;
              const pick = () => setPicked(pickedPoint === point ? null : pickOf(point));
              return (
                <g
                  key={point.id}
                  className={`toy-token${point === selected ? " is-selected" : ""}`}
                  transform={transform}
                  role="button"
                  tabIndex={0}
                  aria-pressed={point === selected}
                  aria-label={`${point.title}: ${open ? "точка открыта" : `откроется на ${point.openingMonth}-м месяце`}. Показать карточки`}
                  onClick={pick}
                  onKeyDown={onActivate(pick)}
                >
                  <rect className="toy-token-hit" x="-33" y="-60" width="74" height="70" rx="14" />
                  <ellipse className="toy-token-ring" cx="0" cy="1" rx="35" ry="11" />
                  {open ? (
                    <g className={`toy-token-drop${point.openingMonth === current && !point.isBase ? " is-fresh" : ""}`}>
                      <g transform="translate(18 -3)"><CardStack /></g>
                      <House kind={houseKind(point)} />
                    </g>
                  ) : <HouseSlot label={point.openingMonth} />}
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
          <p className="toy-hint">
            {game
              ? "Нажмите «+» в районе — точка встанет на выбранный месяц. Прошлое можно переиграть: передвиньте время назад."
              : "Нажмите на домик — раскроется его стопка карточек. Клетка дорожки переносит на свой месяц."}
          </p>
        </div>

        <div className="toy-time">
          <Timeline
            story={story}
            month={month}
            onMonth={setMonth}
            playing={playing}
            onToggle={() => {
              // На «пуск» карточки снова следуют за новой точкой.
              if (!playing) setPicked(null);
              toggle();
            }}
          />
        </div>

        <aside className="toy-hand">
          {game ? (
            <GamePanel
              story={story}
              targetMonth={targetMonth}
              earliestMonth={earliestMonth}
              lastMonth={last}
              onShiftTarget={(delta) => setDelay(Math.max(0, targetMonth + delta - earliestMonth))}
              onPlace={place}
              onUndo={history.length ? undo : null}
              onNewGame={newGame}
            />
          ) : null}
          {selected ? (
            <div aria-live="polite">
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
              {game && selected.districtId !== null ? (
                selected.openingMonth > current ? (
                  <div className="toy-move">
                    <button type="button" onClick={() => moveSelected(-1)} disabled={selected.openingMonth <= earliestMonth}>Раньше</button>
                    <button type="button" onClick={() => moveSelected(1)} disabled={selected.openingMonth >= last}>Позже</button>
                    <button type="button" className="is-remove" onClick={removeSelected}>Убрать</button>
                  </div>
                ) : <p className="toy-move-note">Точка уже работает. Чтобы переиграть, передвиньте время назад — до её открытия.</p>
              ) : null}
              <PointCards point={selected} busiestChecks={facts.busiestChecks} />
              <p className="toy-hand-total">В командах открытых точек: {now.staffTotal}</p>
            </div>
          ) : null}
        </aside>

        <div className="toy-charts">
          <CashChart story={story} month={month} onMonth={setMonth} />
          <ProfitChart story={story} month={month} onMonth={setMonth} />
        </div>
      </div>
    </div>
  );
}
