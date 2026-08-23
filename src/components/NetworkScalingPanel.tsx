import { useMemo, useState } from "react";
import { networkScalingProjection, type NetworkScalingItem } from "../lib/network-scaling";
import { useInvestorConfiguration } from "./InvestorConfigurationProvider";

const money = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 });

function formatRub(value: number | null) {
  return value === null ? "не рассчитано" : `${money.format(Math.round(value))} ₽`;
}

function formatMillion(value: number) {
  return `${decimal.format(value / 1_000_000)} млн ₽`;
}

function ItemList({ items, multiplier }: { items: NetworkScalingItem[]; multiplier: "once" | "per_point" | "not_aggregated" }) {
  if (!items.length) return <p className="scaling-empty">Подтверждённых канонических статей пока нет.</p>;
  return (
    <div className="scaling-item-list">
      {items.map((item) => (
        <details key={item.id} className={`scaling-item is-${item.ownership}`} data-ownership={item.ownership} data-multiplier={item.multiplier}>
          <summary>
            <span>{item.name}{item.partial ? <small>частичное ценовое покрытие</small> : null}</span>
            <strong>{item.included ? formatRub(item.amountRub) : "Не применяется"}</strong>
          </summary>
          <div className="scaling-item-detail">
            <p>{item.reason}</p>
            <small>Источник: {item.source}</small>
            {item.detail?.length ? <ul>
              {item.detail.map((detail) => <li key={detail.id}><span>{detail.name}{detail.quantity === null ? " · количество уточняется" : ` · ${detail.quantity} шт.`}</span><strong>{formatRub(detail.amountRub)}</strong></li>)}
            </ul> : null}
            {multiplier === "not_aggregated" ? <em>Не включается в network multiplier.</em> : null}
          </div>
        </details>
      ))}
    </div>
  );
}

export function NetworkScalingPanel({ onReturnToUnit }: { onReturnToUnit: () => void }) {
  const { configuration, setLaunchBudget, setNetworkScaling } = useInvestorConfiguration();
  const projection = useMemo(() => networkScalingProjection(configuration), [configuration]);
  const [productionDetailsOpen, setProductionDetailsOpen] = useState(false);
  const [pointDetailsOpen, setPointDetailsOpen] = useState(false);
  const [unresolvedDetailsOpen, setUnresolvedDetailsOpen] = useState(false);

  function setPointCount(value: number) {
    setNetworkScaling((current) => ({ ...current, pointCount: Math.max(1, Math.floor(value || 1)) }));
  }

  function setBarEnabled(enabled: boolean) {
    setLaunchBudget((current) => ({ ...current, barEnabled: enabled }));
  }

  function setGrowEnabled(enabled: boolean) {
    setLaunchBudget((current) => ({ ...current, growEnabled: enabled }));
  }

  return (
    <section className="scaling-workspace" aria-labelledby="scaling-title">
      <header className="scaling-header">
        <p>Investor Terminal · структура сети</p>
        <h2 id="scaling-title">Масштабирование</h2>
        <p className="scaling-intro">Заготовочное производство создаётся один раз. Повторяемой является только торговая точка; общие и неразделённые статьи не маскируются под точную network economics.</p>
      </header>

      <div className="scaling-grid">
        <div className="scaling-inputs">
          <section className="scaling-section" aria-labelledby="production-title">
            <header>
              <div><p>Общая инфраструктура</p><h3 id="production-title">Заготовочное производство</h3></div>
              <strong className="scaling-multiplier" data-testid="scaling-production-multiplier">×1</strong>
            </header>
            <div className="scaling-row" data-amount-rub={projection.productionInvestmentRub}>
              <span>Общая производственная база</span>
              <strong>{formatMillion(projection.productionInvestmentRub)}</strong>
            </div>
            <div className="scaling-row is-control">
              <span>Модуль выращивания</span>
              <button type="button" className={`terminal-toggle${projection.productionGrowEnabled ? " is-on" : ""}`} role="switch" aria-checked={projection.productionGrowEnabled} onClick={() => setGrowEnabled(!projection.productionGrowEnabled)} data-testid="scaling-grow-toggle"><span aria-hidden="true"><i /></span>{projection.productionGrowEnabled ? "Включён · ×1" : "Выключен"}</button>
            </div>
            <div className="scaling-row is-note"><span>Мощность производства</span><small>{projection.capacityNote}</small></div>
            <button type="button" className="scaling-details-button" aria-expanded={productionDetailsOpen} onClick={() => setProductionDetailsOpen((open) => !open)}>{productionDetailsOpen ? "Скрыть состав" : "Показать состав"}</button>
            {productionDetailsOpen ? <div data-testid="scaling-production-items"><ItemList items={projection.productionItems} multiplier="once" /></div> : null}
          </section>

          <section className="scaling-section" aria-labelledby="point-title">
            <header>
              <div><p>Повторяемый unit</p><h3 id="point-title">Торговая точка</h3></div>
              <strong className="scaling-multiplier">×N</strong>
            </header>
            <div className="scaling-choice-row" role="group" aria-label="Формат торговой точки">
              <span>Формат</span>
              <div className="terminal-segmented">
                <button type="button" className={projection.pointFormat === "with_seating" ? "is-selected" : ""} aria-pressed={projection.pointFormat === "with_seating"} onClick={() => setNetworkScaling((current) => ({ ...current, pointFormat: "with_seating" }))} data-testid="scaling-format-with-seating">С посадкой</button>
                <button type="button" className={projection.pointFormat === "without_seating" ? "is-selected" : ""} aria-pressed={projection.pointFormat === "without_seating"} onClick={() => setNetworkScaling((current) => ({ ...current, pointFormat: "without_seating" }))} data-testid="scaling-format-without-seating">Без посадки</button>
              </div>
            </div>
            <p className="scaling-source-note">Используется существующий canonical format: {projection.pointFormatSourceId}. Для формата без посадки нет отдельной канонической площади — меняются только подтверждённые модульные статьи.</p>
            <div className="scaling-row is-control">
              <span>Бар</span>
              <button type="button" className={`terminal-toggle${projection.pointBarEnabled ? " is-on" : ""}`} role="switch" aria-checked={projection.pointBarEnabled} onClick={() => setBarEnabled(!projection.pointBarEnabled)} data-testid="scaling-bar-toggle"><span aria-hidden="true"><i /></span>{projection.pointBarEnabled ? "Включён" : "Выключен"}</button>
            </div>
            <div className="scaling-row is-control scaling-count-row">
              <span>Количество точек</span>
              <div className="scaling-stepper">
                <button type="button" aria-label="Уменьшить количество точек" onClick={() => setPointCount(projection.pointCount - 1)}>−</button>
                <input aria-label="Количество торговых точек" data-testid="scaling-point-count" type="number" min="1" step="1" inputMode="numeric" value={projection.pointCount} onChange={(event) => setPointCount(Number(event.target.value))} />
                <button type="button" aria-label="Увеличить количество точек" onClick={() => setPointCount(projection.pointCount + 1)}>+</button>
              </div>
            </div>
            <div className="scaling-row"><span>Стоимость одной точки</span><strong data-testid="scaling-point-unit" data-amount-rub={projection.pointInvestmentRub}>{formatMillion(projection.pointInvestmentRub)}</strong></div>
            <button type="button" className="scaling-details-button" aria-expanded={pointDetailsOpen} onClick={() => setPointDetailsOpen((open) => !open)}>{pointDetailsOpen ? "Скрыть состав" : "Показать состав"}</button>
            {pointDetailsOpen ? <div data-testid="scaling-point-items"><ItemList items={projection.pointItems} multiplier="per_point" /></div> : null}
          </section>

          <section className="scaling-section is-unresolved" aria-labelledby="unresolved-title">
            <header><div><p>Не включается автоматически</p><h3 id="unresolved-title">Shared / unresolved</h3></div><strong className="scaling-multiplier">—</strong></header>
            <div className="scaling-row is-note"><span>Shared / network</span><small>Подтверждённых отдельных network-статей в canonical launch model пока нет.</small></div>
            <div className="scaling-row is-note" data-testid="scaling-reserve"><span>Операционный запас</span><small>{projection.reserveNote}</small></div>
            <div className="scaling-row is-note"><span>Резерв запуска</span><small>{projection.contingencyNote}</small></div>
            <button type="button" className="scaling-details-button" aria-expanded={unresolvedDetailsOpen} onClick={() => setUnresolvedDetailsOpen((open) => !open)}>{unresolvedDetailsOpen ? "Скрыть неразделённые статьи" : `Показать неразделённые статьи (${projection.unresolvedItems.length})`}</button>
            {unresolvedDetailsOpen ? <div data-testid="scaling-unresolved"><ItemList items={projection.unresolvedItems} multiplier="not_aggregated" /></div> : null}
          </section>
        </div>

        <aside className="scaling-results" aria-label="Сводка масштабирования">
          <p>Сеть · частичный расчёт</p>
          <h3>{projection.pointFormatName}</h3>
          <dl>
            <div><dt>Производство</dt><dd data-testid="scaling-production-investment" data-amount-rub={projection.productionInvestmentRub}>{formatMillion(projection.productionInvestmentRub)} <b>×1</b></dd></div>
            <div><dt>Торговая точка</dt><dd>{formatMillion(projection.pointInvestmentRub)} <b>×{projection.pointCount}</b></dd></div>
            <div><dt>Point investment ×{projection.pointCount}</dt><dd data-testid="scaling-point-network" data-amount-rub={projection.pointNetworkInvestmentRub}>{formatMillion(projection.pointNetworkInvestmentRub)}</dd></div>
            <div><dt>Shared / network</dt><dd>не подтверждено</dd></div>
            <div><dt>Unresolved</dt><dd>не включено</dd></div>
            <div className="is-total"><dt>Подтверждённая часть инвестиций</dt><dd data-testid="scaling-confirmed-total" data-amount-rub={projection.confirmedInvestmentSubtotalRub}>{formatMillion(projection.confirmedInvestmentSubtotalRub)}</dd></div>
          </dl>
          <p className="scaling-partial-note">Это не точная общая сумма сети: резерв, contingency, недвижимость, неразделённая подготовка и прочие unresolved статьи не умножаются автоматически.</p>
          <button type="button" className="terminal-reset" onClick={onReturnToUnit}>Вернуться к экономике точки</button>
        </aside>
      </div>
    </section>
  );
}
