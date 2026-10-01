import { formatMoneyShort, formatRub } from "../../format";
import type { StoryPoint } from "../../story";
import { locationTitles, plural } from "./labels";
import { Meeple } from "./pieces";

/** Стопка карточек выбранной точки: формат, команда по ролям, поток гостей, инвентарь. */
export function PointCards({ point, busiestChecks }: { point: StoryPoint; busiestChecks: number }) {
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

      <article className="toy-card is-inventory">
        <h4 className="toy-card-band">Инвентарь</h4>
        <div className="toy-card-body">
          <strong className="toy-card-lead">Чем оснащена точка</strong>
          {point.inventory.length ? (
            <ul className="toy-inventory">
              {point.inventory.map((group) => {
                const amount = group.amountRub === null ? "уточняется" : formatMoneyShort(group.amountRub);
                return (
                  <li key={group.id}>
                    {group.items.length ? (
                      <details>
                        <summary><span>{group.name}</span><b>{amount}</b></summary>
                        <ul>
                          {group.items.map((item) => <li key={item.name}>{item.name}{item.quantity === null ? "" : ` × ${item.quantity}`}</li>)}
                        </ul>
                      </details>
                    ) : <div className="toy-inventory-row"><span>{group.name}</span><b>{amount}</b></div>}
                  </li>
                );
              })}
            </ul>
          ) : <p>Состав оснащения в расчёте не задан</p>}
        </div>
      </article>
    </div>
  );
}
