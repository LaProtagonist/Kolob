import { useState } from "react";
import { Breadcrumbs } from "./ui";
import { PropertySectionHeading as Heading } from "./PropertyProposal";
import { selectOpeningBudget, type OpeningBudgetSelection, type OpeningBudgetVariant } from "../lib/property-funding";
import { sennayaContent as copy } from "../content/sennaya";
import data from "../content/sennaya-data.json";
import "./FranchisePlatform.css";
import "./Sennaya.css";

const number = (value: number, maximumFractionDigits = 0) => value.toLocaleString("ru-RU", { maximumFractionDigits });
const money = (value: number, fractionDigits = 0) => `${value.toLocaleString("ru-RU", { minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits })} ₽`;
const million = (value: number) => `${number(value / 1_000_000, 2)} млн ₽`;

export function SennayaPage() {
  const mature = data.revenueScenarios.find(row => row.checksPerDay === data.targetChecksPerDay)!;
  const [selection, setSelection] = useState<OpeningBudgetSelection>({ preparation: true, equipment: true, launch: true, inventory: true, contingency: true });
  const budget = selectOpeningBudget(data.openingBudgetVariants as Record<string, OpeningBudgetVariant>, selection);
  return <div className="franchise-page franchise-scenario-page sennaya-page" data-testid="sennaya-page">
    <section className="franchise-hero" aria-labelledby="sennaya-title"><div className="section-inner">
      <Breadcrumbs current="Сенная" />
      <p className="franchise-eyebrow">{copy.eyebrow}</p>
      <h1 id="sennaya-title">{copy.title}</h1>
      <p className="franchise-lead">{copy.lead}</p>
      <div className="sennaya-metrics" aria-label="Параметры рабочего сценария">
        <div><strong>{number(data.areaM2, 1)} м²</strong><span>площадь помещения</span></div>
        <div><strong>Около {data.illustrativeSeats} мест</strong><span>расчётная посадка</span></div>
        <div><strong>{million(mature.revenueMonthlyRub)}<small>в месяц</small></strong><span>расчётная выручка при {data.targetChecksPerDay} чеках в день</span></div>
        <div><strong>{money(data.occupancyMonthlyRub)}<small>в месяц</small></strong><span>плановый платёж собственнику</span></div>
      </div>
      <p className="sennaya-note">{copy.scenarioNote}</p>
    </div></section>
    <div className="franchise-main"><div className="section-inner">
      <section className="franchise-section" aria-labelledby="sennaya-format">
        <Heading number="01" id="sennaya-format" title={copy.format.title} text={copy.format.text} />
        <div className="petrogradka-fit-grid">{copy.format.cards.map(card => <article key={card.title}><h3>{card.title}</h3><p>{card.text}</p></article>)}</div>
        <a className="franchise-link sennaya-base-link" href="/petrogradka">{copy.format.link}</a>
      </section>
      <section className="franchise-section" aria-labelledby="sennaya-budget">
        <Heading number="02" id="sennaya-budget" title={copy.budget.title} text={copy.budget.text} />
        <fieldset className="sennaya-budget-card"><legend className="visually-hidden">Состав расчёта</legend>
          <div className="sennaya-budget-rows">{budget.rows.map(row => {
            const group = copy.budget.groups[row.id];
            return <div key={row.id} data-budget-group={row.id} className={row.included ? undefined : "is-excluded"}>
              <div className="sennaya-budget-description"><h3 id={`scope-${row.id}`}>{group.title}</h3><p>{group.note}</p></div>
              <strong className="sennaya-budget-amount" data-amount={row.knownRub}>{row.included ? money(row.knownRub, Number.isInteger(row.knownRub) ? 0 : 2) : "Не включено"}</strong>
              <label className="sennaya-scope-switch"><input type="checkbox" role="switch" aria-labelledby={`scope-${row.id} included-${row.id}`} checked={selection[row.id]} onChange={event => setSelection(previous => ({ ...previous, [row.id]: event.target.checked }))} /><span id={`included-${row.id}`}>Включено в расчёт</span></label>
            </div>;
          })}</div>
          <div className="sennaya-budget-total" data-testid="opening-budget" aria-live="polite"><span>{copy.budget.total}</span><strong data-testid="budget-total" data-amount={budget.knownRub}>{money(budget.knownRub)}</strong></div>
        </fieldset>
        <p className="sennaya-note">{copy.budget.note}</p>
      </section>
      <section className="franchise-section" aria-labelledby="sennaya-revenue">
        <Heading number="03" id="sennaya-revenue" title={copy.revenue.title} text={`Сценарий рассчитан при среднем чеке ${data.averageCheckRub.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₽ и работе ${data.daysPerMonth} дней в месяц.`} />
        <table className="sennaya-scenarios"><thead><tr><th scope="col">Чеков в день</th><th scope="col">Расчётная выручка в месяц</th></tr></thead><tbody>{data.revenueScenarios.map(row => <tr key={row.checksPerDay} className={row.checksPerDay === data.targetChecksPerDay ? "is-target" : undefined}><th scope="row">{row.checksPerDay}</th><td>{million(row.revenueMonthlyRub)}</td></tr>)}</tbody></table>
        <p className="sennaya-note">{copy.revenue.note}</p>
      </section>
      <section className="franchise-section sennaya-property" aria-labelledby="sennaya-property">
        <Heading number="04" id="sennaya-property" title={copy.owner.title} />
        <div className="sennaya-property-text"><p>{copy.owner.intro} Плановый платёж составляет {money(data.occupancyMonthlyRub)} в месяц.</p><p>{copy.owner.caveat}</p><p>{copy.owner.alternative}</p><p>{copy.owner.improvements}</p><p>{copy.owner.optional}</p></div>
      </section>
      <section className="franchise-section sennaya-cooperation" aria-labelledby="sennaya-cooperation">
        <Heading number="05" id="sennaya-cooperation" title={copy.cooperation.title} text={copy.cooperation.text} />
        <p className="sennaya-note">{copy.cooperation.note}</p>
      </section>
      <section className="franchise-section" aria-labelledby="sennaya-checks">
        <Heading number="06" id="sennaya-checks" title={copy.checks.title} />
        <ul className="sennaya-technical-list">{copy.checks.groups.map(group => <li key={group.title}><strong>{group.title}</strong><span>{group.text}</span></li>)}</ul>
      </section>
      <section className="sennaya-next" aria-labelledby="sennaya-next"><h2 id="sennaya-next">{copy.contact.title}</h2><p>{copy.contact.text}</p><a className="button button-primary" href="/investor-questions">{copy.contact.button}</a></section>
    </div></div>
  </div>;
}
