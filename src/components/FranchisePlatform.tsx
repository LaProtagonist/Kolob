import { Breadcrumbs } from "./ui";
import { franchisePlatformContent, petrogradkaContent } from "../content/franchise-platform";
import "./FranchisePlatform.css";

const rub = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });

function formatRange([from, to]: readonly [number, number]) {
  return `${rub.format(from)}–${rub.format(to)} ₽`;
}

function labelForStatus(status: string) {
  const labels: Record<string, string> = {
    proposed: "внутренний проект",
    research: "исследовательский сценарий",
    assumption: "допущение для расчёта",
    missing_input: "требует расчёта",
    scenario_structure: "структура сценария",
    derived_when_inputs_confirmed: "после подтверждения входов",
    available_subject_to_confirmation: "требует письменного подтверждения",
  };
  return labels[status] ?? status;
}

function Status({ status }: { status: string }) {
  return <span className={`franchise-status is-${status.replace(/_/g, "-")}`} data-status={status}>{labelForStatus(status)}</span>;
}

function Flow({ items, className = "" }: { items: readonly string[]; className?: string }) {
  return (
    <ol className={`franchise-flow ${className}`}>
      {items.map((item, index) => <li key={item}><span>{String(index + 1).padStart(2, "0")}</span><strong>{item}</strong></li>)}
    </ol>
  );
}

function SectionHeading({ number, title, text }: { number: string; title: string; text?: string }) {
  return <header className="franchise-section-heading"><span>{number}</span><div><h2>{title}</h2>{text ? <p>{text}</p> : null}</div></header>;
}

function ParameterValue({ value, unit }: { value: number | null; unit: string }) {
  if (value === null) return <>Требует расчёта</>;
  if (unit === "RUB") return <>{rub.format(value)} ₽</>;
  if (unit === "percent") return <>{value}%</>;
  if (unit === "points") return <>{value} точек</>;
  return <>{value}</>;
}

export function FranchisePlatformPage() {
  const content = franchisePlatformContent;
  const entryFee = content.parameters.find((item) => item.id === "franchise_entry_fee");
  const royalty = content.parameters.find((item) => item.id === "royalty_rate");

  return (
    <div className="franchise-page" data-testid="franchise-platform-page">
      <section className="franchise-hero" aria-labelledby="franchise-title">
        <div className="section-inner">
          <Breadcrumbs current="Стратегия масштабирования сети" />
          <div className="franchise-hero-grid">
            <div>
              <p className="franchise-eyebrow"><Status status={content.status} /> Внутренняя стратегическая архитектура</p>
              <h1 id="franchise-title">{content.title}</h1>
              <p className="franchise-lead">{content.lead}</p>
            </div>
            <aside className="franchise-boundary"><strong>Граница документа</strong><p>{content.boundary}</p></aside>
          </div>
          <div className="franchise-thesis"><p>{content.thesis}</p><strong>{content.capitalThesis}</strong></div>
        </div>
      </section>

      <section className="franchise-main">
        <div className="section-inner">
          <section className="franchise-section" aria-labelledby="franchise-architecture-title">
            <SectionHeading number="01" title="Архитектура масштабирования" text="Головная компания создаёт платформу; собственные и партнёрские точки подключаются к её стандартам и инфраструктуре." />
            <ol className="franchise-architecture" id="franchise-architecture-title">
              {content.architecture.map((item, index) => <li key={item.title}><span>{String(index + 1).padStart(2, "0")}</span><h3>{item.title}</h3><p>{item.text}</p></li>)}
            </ol>
            <p className="franchise-architecture-note">{content.architectureNote}</p>
          </section>

          <section className="franchise-section franchise-split" aria-label="Центральное производство и торговая точка">
            <article className="franchise-card is-production"><p className="franchise-card-kicker">Первый инфраструктурный узел</p><h2>Центральное производство</h2><p>{content.productionIntro}</p><ul>{content.production.map((item) => <li key={item}>{item}</li>)}</ul><p className="franchise-card-note"><Status status="assumption" /> {content.productionCapacity}<br /><span>{content.productionCapacityConfirmation}</span></p></article>
            <article className="franchise-card"><p className="franchise-card-kicker">Упрощённая операционная роль</p><h2>Торговая точка</h2><p>{content.pointIntro}</p><ul>{content.point.map((item) => <li key={item}>{item}</li>)}</ul><p className="franchise-card-list-heading">Эффект для точки</p><ul className="franchise-effect-list">{content.pointEffects.map((item) => <li key={item}>{item}</li>)}</ul></article>
          </section>

          <section className="franchise-section" aria-labelledby="franchise-os-title">
            <SectionHeading number="02" title="Цифровая система управления сетью" text={content.operatingSystemIntro} />
            <div className="franchise-os" id="franchise-os-title">{content.operatingSystem.map((item) => <span key={item}>{item}</span>)}</div>
            <div className="franchise-control-grid">
              <div><strong>Централизованное управление</strong><p>{content.controlledLead}</p><p>{content.controlledText}</p></div>
              <div><strong>Роль франчайзи</strong><p>{content.franchiseeRoleLead}</p><p>{content.franchiseeRoleText}</p></div>
            </div>
          </section>

          <section className="franchise-section franchise-operations" aria-labelledby="franchise-operations-title">
            <SectionHeading number="03" title="Поставки, автозаказ и автоматические расчёты" text="Централизованный контроль строится на событиях, технологических картах и подтверждённых операционных правилах." />
            <div className="franchise-operations-grid" id="franchise-operations-title">
              <article><h3>Жизненный цикл партии</h3><Flow items={content.batchStates} className="is-batches" /><p>{content.batchDescription}</p></article>
              <article><h3>Автозаказ</h3><Flow items={content.orderSteps} /><p>{content.orderDescription}</p><p>{content.orderConfirmation}</p></article>
              <article><h3>Ежедневные расчёты</h3><Flow items={content.dailyCalculationSteps} /><p>{content.dailyCalculationDescription}</p><strong className="franchise-card-list-heading">На первом этапе:</strong><ul className="franchise-compact-list">{content.dailyCalculationItems.map((item) => <li key={item}>{item}</li>)}</ul><p>{content.dailyCalculationFuture}</p></article>
            </div>
          </section>

          <section className="franchise-section" aria-labelledby="franchise-economics-title">
            <SectionHeading number="04" title="Экономика головной компании и франчайзи" text="Каждый контур считается отдельно; внутригрупповые поставки исключаются при консолидации." />
            <div className="franchise-money-flow" id="franchise-economics-title" data-testid="franchise-money-flow">
              <div className="franchise-money-flow-origin"><strong>Гость</strong><span aria-hidden="true">↓</span><strong>Франчайзи</strong></div>
              <ul>
                <li>оплата заготовок <span aria-hidden="true">→</span> <strong>центральное производство</strong></li>
                <li>роялти <span aria-hidden="true">→</span> <strong>головная компания</strong></li>
                <li>маркетинговый сбор <span aria-hidden="true">→</span> <strong>продвижение сети</strong></li>
                <li>ФОТ / аренда / налоги</li>
                <li>остаток <span aria-hidden="true">→</span> <strong>результат франчайзи</strong></li>
              </ul>
            </div>
            <p className="franchise-economic-note">Схема показывает экономическую логику и не является обязательной юридической конструкцией.</p>
            <div className="franchise-economics-grid">
              <article><h3>Головная компания</h3><p>Головная компания может получать:</p><ul className="franchise-compact-list">{content.headcoFlows.map((item) => <li key={item}>{item}</li>)}</ul><div className="franchise-scenario-parameters"><strong>Рабочие параметры сценария — не утверждённые условия франшизы</strong><Status status="assumption" /><dl><div><dt>Паушальный взнос</dt><dd><ParameterValue value={entryFee?.value ?? null} unit="RUB" /></dd></div><div><dt>Роялти</dt><dd><ParameterValue value={royalty?.value ?? null} unit="percent" /></dd></div><div><dt>Сценарная иллюстрация</dt><dd>9 франчайзинговых точек × 1 000 000 ₽ = 9 000 000 ₽ разовых паушальных поступлений.</dd></div></dl><small>Допущение для моделирования.</small></div></article>
              <article><h3>Франчайзи</h3><p>Франчайзи получает:</p><ul className="franchise-compact-list">{content.franchiseeBenefits.map((item) => <li key={item}>{item}</li>)}</ul><p>Экономика франчайзи рассчитывается после:</p><ul className="franchise-compact-list">{content.franchiseeCosts.map((item) => <li key={item}>{item}</li>)}</ul><strong className="franchise-key-metric">Сколько остаётся партнёру после всех обязательных платежей.</strong></article>
              <article><h3>Что необходимо подтвердить расчётом</h3><ul className="franchise-compact-list">{content.calculationInputs.map((item) => <li key={item}>{item}</li>)}</ul><p>Будет заполнено после подтверждения исходных данных.</p></article>
            </div>
          </section>

          <section className="franchise-section" aria-labelledby="franchise-first-stage-title" data-testid="franchise-first-stage">
            <SectionHeading number="05" title="Результат первого этапа" text={content.firstStage.intro} />
            <div className="franchise-first-stage-grid" id="franchise-first-stage-title">
              {content.firstStage.results.map((result, index) => <article key={result.title}><span>{String(index + 1).padStart(2, "0")}</span><h3>{result.title}</h3><p>{result.text}</p></article>)}
            </div>
            <p className="franchise-first-stage-thesis">{content.firstStage.conclusion}</p>
          </section>

          <section className="franchise-section" aria-labelledby="franchise-scenarios-title">
            <SectionHeading number="06" title="Базовая стратегия и сценарии запуска" text="Сценарии запуска не изменяют базовую стратегию компании. Они определяют способ создания первого производственного узла в зависимости от доступной инфраструктуры, капитала и условий конкретной площадки." />
            <div className="franchise-profile-grid" id="franchise-scenarios-title">
              {content.scenarioProfiles.map((profile, index) => <article key={profile.id} className={index === 0 ? "is-active" : ""}><Status status={index === 0 ? "research" : "proposed"} /><h3>{profile.title}</h3><p>{profile.text}</p>{profile.petrogradka ? <><p className="franchise-profile-note">{profile.petrogradka}</p><p className="franchise-profile-note">Сценарий не является новой базовой моделью проекта.</p><a className="franchise-link" href={content.links.scenario}>Открыть сценарий Петроградки</a></> : null}</article>)}
            </div>
            <div className="franchise-matrix"><strong>Структура первых расчётных срезов</strong>{content.scenarioMatrix.map((scenario) => <span key={scenario.franchiseUnitCount}>1 собственная + {scenario.franchiseUnitCount} франчайзи</span>)}<p>Результаты не выводятся до появления подтверждённых входов.</p></div>
          </section>

          <section className="franchise-section franchise-scale" aria-labelledby="franchise-scale-title">
            <SectionHeading number="07" title="Экономический эффект масштаба" text="Эффект масштаба проверяется ступенчатой моделью загрузки, капитальных затрат, персонала, логистики и ограничений мощности." />
            <Flow items={content.scaleLoop} className="is-scale" />
            <p className="franchise-scale-note">{content.scaleCaveat}</p>
            <div className="franchise-future"><div><strong>Медиапрограмма</strong><p>{content.media}</p></div><div><strong>Следующие этапы развития инфраструктуры</strong><p>{content.futureLayersIntro} {content.futureLayers.join(" → ")}.</p></div></div>
          </section>
        </div>
      </section>
    </div>
  );
}

export function PetrogradkaFranchiseScenarioPage() {
  const content = petrogradkaContent;
  return (
    <div className="franchise-page franchise-scenario-page" data-testid="petrogradka-scenario-page">
      <section className="franchise-hero" aria-labelledby="petrogradka-title">
        <div className="section-inner">
          <Breadcrumbs current="Сценарий Петроградки" />
          <div className="franchise-hero-grid"><div><p className="franchise-eyebrow"><Status status="research" /> Сценарий запуска</p><h1 id="petrogradka-title">{content.title}</h1><p className="franchise-lead">{content.lead}</p></div><aside className="franchise-boundary"><strong>Сценарий, не базовая модель</strong><p>Помещение, его оборудование и условия не утверждены. Замена помещения не требует изменения стратегии масштабирования сети.</p></aside></div>
        </div>
      </section>

      <section className="franchise-main">
        <div className="section-inner">
          <section className="franchise-section" aria-labelledby="petrogradka-summary-title">
            <SectionHeading number="01" title="Готовая производственная база" text="Сценарий рассматривает готовое пищевое производство на Петроградской стороне как возможный первый центральный заготовочный узел." />
            <div className="petrogradka-summary" id="petrogradka-summary-title"><div><span>Статус сценария</span><strong><Status status="research" /></strong></div><div><span>Оборудование и инженерия</span><strong><Status status="available_subject_to_confirmation" /></strong></div><div><span>Рабочее допущение мощности</span><strong><Status status="assumption" /></strong></div><div><span>Дополнительный пароконвектомат</span><strong>Не включён</strong></div></div>
          </section>

          <section className="franchise-section petrogradka-grid" aria-label="Оборудование и инфраструктура">
            <article className="franchise-card"><p className="franchise-card-kicker"><Status status="available_subject_to_confirmation" /></p><h2>Оборудование из объявления</h2><ul>{content.equipment.map((item) => <li key={item}>{item}</li>)}</ul></article>
            <article className="franchise-card"><p className="franchise-card-kicker"><Status status="available_subject_to_confirmation" /></p><h2>Инфраструктура</h2><ul>{content.infrastructure.map((item) => <li key={item}>{item}</li>)}</ul><p className="franchise-card-note">Критическое ограничение: собственник может вывезти часть оборудования. Каждая позиция требует письменного подтверждения.</p></article>
          </section>

          <section className="franchise-section" aria-labelledby="petrogradka-capex-title">
            <SectionHeading number="02" title="Сценарные капитальные затраты" text="Готовое производство может сократить вложения в ремонт и инженерию и направить капитал в технологию, медиа и цифровую инфраструктуру." />
            <div className="petrogradka-capex" id="petrogradka-capex-title">{content.capexRows.map((row) => <div key={row.label}><span>{row.label}</span><strong>{formatRange(row.value)}</strong><small><Status status="assumption" /> {row.note}</small></div>)}</div>
            <p className="franchise-exclusion"><strong>Не включено:</strong> {content.excluded.join(" · ")}.</p>
          </section>

          <section className="franchise-section" aria-labelledby="petrogradka-operations-title">
            <SectionHeading number="03" title="Торговая функция и подтверждения" text="Производственный сценарий не поглощает капитальные затраты торговых точек и не подменяет существующую модель точки." />
            <div className="petrogradka-operations" id="petrogradka-operations-title"><article><h3>Допустимые слои</h3><ol>{content.trading.map((item, index) => <li key={item}><span>{String(index + 1).padStart(2, "0")}</span>{item}</li>)}</ol></article><article><h3>Требует подтверждения</h3><ul>{content.confirmation.map((item) => <li key={item}>{item}</li>)}</ul></article></div>
          </section>

          <section className="franchise-section franchise-next" aria-label="Следующий шаг"><div><Status status="research" /><h2>До получения входов сценарий не формирует финансовый результат.</h2><p>После проверки исходные параметры передаются в существующую финансовую модель как отдельный слой сценария: без второй независимой модели и без изменения базовой модели проекта.</p></div><a className="franchise-link" href={franchisePlatformContent.links.core}>Вернуться к стратегии масштабирования сети</a></section>
        </div>
      </section>
    </div>
  );
}
