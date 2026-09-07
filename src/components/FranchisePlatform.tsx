import { Breadcrumbs } from "./ui";
import { franchisePlatformCalculationStatus } from "../lib/franchise-platform";
import { franchisePlatformContent, petrogradkaContent } from "../content/franchise-platform";
import "./FranchisePlatform.css";

const rub = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });

function formatRange([from, to]: readonly [number, number]) {
  return `${rub.format(from)}–${rub.format(to)} ₽`;
}

function labelForStatus(status: string) {
  const labels: Record<string, string> = {
    proposed: "proposed",
    research: "research",
    assumption: "assumption",
    missing_input: "требует входа",
    scenario_structure: "структура сценария",
    derived_when_inputs_confirmed: "после подтверждения входов",
    available_subject_to_confirmation: "требует подтверждения",
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
  if (value === null) return <>Не задано</>;
  if (unit === "RUB") return <>{rub.format(value)} ₽</>;
  if (unit === "percent") return <>{value}%</>;
  if (unit === "points") return <>{value} точек</>;
  return <>{value}</>;
}

export function FranchisePlatformPage() {
  const content = franchisePlatformContent;
  const calculation = franchisePlatformCalculationStatus();

  return (
    <div className="franchise-page" data-testid="franchise-platform-page">
      <section className="franchise-hero" aria-labelledby="franchise-title">
        <div className="section-inner">
          <Breadcrumbs current="Franchise Platform Strategy" />
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
            <SectionHeading number="01" title="Архитектура масштаба" text="Головная компания создаёт платформу; собственные и партнёрские точки подключаются к её стандартам и инфраструктуре." />
            <ol className="franchise-architecture" id="franchise-architecture-title">
              {content.architecture.map((item, index) => <li key={item.title}><span>{String(index + 1).padStart(2, "0")}</span><h3>{item.title}</h3><p>{item.text}</p></li>)}
            </ol>
          </section>

          <section className="franchise-section franchise-split" aria-label="Центральное производство и торговая точка">
            <article className="franchise-card is-production"><p className="franchise-card-kicker">Первый инфраструктурный узел</p><h2>Центральное производство</h2><p>Заготовочный центр работает как контур сети, а не как кухня при одной точке.</p><ul>{content.production.map((item) => <li key={item}>{item}</li>)}</ul><p className="franchise-card-note"><Status status="assumption" /> Рабочая мощность сценария: до 10 торговых точек после технологической проверки.</p></article>
            <article className="franchise-card"><p className="franchise-card-kicker">Упрощённая операционная роль</p><h2>Торговая точка</h2><p>На точке остаётся финальное исполнение и работа с гостем; повторяемая заготовка переносится в центр.</p><ul>{content.point.map((item) => <li key={item}>{item}</li>)}</ul><p className="franchise-card-note">Целевой эффект: меньше сложного оборудования, проще обучение и контроль качества.</p></article>
          </section>

          <section className="franchise-section" aria-labelledby="franchise-os-title">
            <SectionHeading number="02" title="Franchise Operating System" text="Одна цифровая система связывает производство, поставки, точки, данные и обязательные финансовые потоки." />
            <div className="franchise-os" id="franchise-os-title">{content.operatingSystem.map((item) => <span key={item}>{item}</span>)}</div>
            <div className="franchise-control-grid"><div><strong>Централизованно контролируются</strong><p>{content.controlled.join(" · ")}</p></div><div><strong>Ответственность партнёра</strong><p>Команда, дисциплина, качество исполнения, локальное управление и развитие точки.</p></div></div>
          </section>

          <section className="franchise-section franchise-operations" aria-labelledby="franchise-operations-title">
            <SectionHeading number="03" title="Партии, автозаказ и settlement" text="Централизованный контроль строится на событиях, техкартах и подтверждённых операционных правилах." />
            <div className="franchise-operations-grid" id="franchise-operations-title">
              <article><h3>Жизненный цикл партии</h3><Flow items={content.batchStates} className="is-batches" /><p>Приёмка — сканирование партии или накладной с автоматическим оприходованием. Вскрытие запускает срок использования после вскрытия.</p></article>
              <article><h3>Автозаказ</h3><Flow items={content.orderSteps} /><p>Прогноз может позднее учитывать погоду, сезонность, события, локальный трафик и медиаактивности.</p></article>
              <article><h3>Settlement</h3><Flow items={content.settlementSteps} /><p>Не предполагает обязательный split каждого клиентского чека. Банковская архитектура требует отдельного исследования.</p></article>
            </div>
          </section>

          <section className="franchise-section" aria-labelledby="franchise-economics-title">
            <SectionHeading number="04" title="Экономика платформы" text="Каждый контур считается отдельно; внутригрупповые поставки исключаются при консолидации." />
            <div className="franchise-economics-grid" id="franchise-economics-title">
              <article><h3>HeadCo</h3><p>{content.headcoFlows.join(" · ")}</p><dl><div><dt>Паушальный взнос</dt><dd><ParameterValue value={content.parameters.find((item) => item.id === "franchise_entry_fee")?.value ?? null} unit="RUB" /> <Status status="assumption" /></dd></div><div><dt>Royalty</dt><dd><ParameterValue value={content.parameters.find((item) => item.id === "royalty_rate")?.value ?? null} unit="percent" /> <Status status="assumption" /></dd></div><div><dt>Иллюстрация 1 + 9</dt><dd>9 000 000 ₽ <Status status="assumption" /></dd></div></dl></article>
              <article><h3>Франчайзи</h3><ol className="franchise-formula">{content.franchiseeFormula.map((item, index) => <li key={item}><span>{index === content.franchiseeFormula.length - 1 ? "=" : "−"}</span>{item}</li>)}</ol><p>Ключевой показатель — сумма, остающаяся партнёру после обязательных платежей.</p></article>
              <article><h3>Расчётный статус</h3><Status status="missing_input" /><p>{calculation.rule}</p><strong>{calculation.missing.length} обязательных входов не заданы</strong></article>
            </div>
          </section>

          <section className="franchise-section" aria-labelledby="franchise-scenarios-title">
            <SectionHeading number="05" title="Core Strategy + Scenario Profiles" text="Помещение является заменяемым сценарием, а не частью базовой стратегии." />
            <div className="franchise-profile-grid" id="franchise-scenarios-title">
              {content.profiles.map((profile) => <article key={profile} className={profile === "READY_PRODUCTION_BASE" ? "is-active" : ""}><Status status={profile === "READY_PRODUCTION_BASE" ? "research" : "proposed"} /><h3>{profile}</h3><p>{profile === "READY_PRODUCTION_BASE" ? "Готовое оборудованное производство. Первая реализация — PETROGRADKA." : profile === "CUSTOM_PRODUCTION_BASE" ? "Создание или переоборудование производства в выбранном помещении." : "Производство в собственном помещении как отдельный инвестиционный контур."}</p>{profile === "READY_PRODUCTION_BASE" ? <a className="franchise-link" href={content.links.scenario}>Открыть сценарий Петроградки</a> : null}</article>)}
            </div>
            <div className="franchise-matrix"><strong>Структура первых расчётных срезов</strong>{content.scenarioMatrix.map((scenario) => <span key={scenario.franchiseUnitCount}>1 собственная + {scenario.franchiseUnitCount} франчайзи</span>)}<p>Результаты не выводятся до появления подтверждённых входов.</p></div>
          </section>

          <section className="franchise-section franchise-scale" aria-labelledby="franchise-scale-title">
            <SectionHeading number="06" title="Петля масштаба и будущие слои" text="Эффект масштаба проверяется ступенчатой моделью загрузки, CAPEX, персонала, логистики и ограничений мощности." />
            <Flow items={content.scaleLoop} className="is-scale" />
            <div className="franchise-future"><div><strong>Media Program</strong><p>{content.media}</p></div><div><strong>Future layers</strong><p>{content.futureLayers.join(" · ")}</p></div></div>
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
          <Breadcrumbs current="PETROGRADKA scenario" />
          <div className="franchise-hero-grid"><div><p className="franchise-eyebrow"><Status status="research" /> READY_PRODUCTION_BASE</p><h1 id="petrogradka-title">{content.title}</h1><p className="franchise-lead">{content.lead}</p></div><aside className="franchise-boundary"><strong>Scenario, не baseline</strong><p>Помещение, его оборудование и условия не утверждены. Замена помещения не требует изменения Franchise Platform Strategy.</p></aside></div>
        </div>
      </section>

      <section className="franchise-main">
        <div className="section-inner">
          <section className="franchise-section" aria-labelledby="petrogradka-summary-title">
            <SectionHeading number="01" title="Готовая инфраструктура как ускоритель" text="Сценарий рассматривает готовое пищевое производство на Петроградской стороне как возможный первый центральный заготовочный узел." />
            <div className="petrogradka-summary" id="petrogradka-summary-title"><div><span>Статус помещения</span><strong><Status status="research" /></strong></div><div><span>Оборудование и инженерия</span><strong><Status status="available_subject_to_confirmation" /></strong></div><div><span>Мощность до 10 точек</span><strong><Status status="assumption" /></strong></div><div><span>Вторая точка Rational</span><strong>Не включена</strong></div></div>
          </section>

          <section className="franchise-section petrogradka-grid" aria-label="Оборудование и инфраструктура">
            <article className="franchise-card"><p className="franchise-card-kicker"><Status status="available_subject_to_confirmation" /></p><h2>Оборудование из объявления</h2><ul>{content.equipment.map((item) => <li key={item}>{item}</li>)}</ul></article>
            <article className="franchise-card"><p className="franchise-card-kicker"><Status status="available_subject_to_confirmation" /></p><h2>Инфраструктура</h2><ul>{content.infrastructure.map((item) => <li key={item}>{item}</li>)}</ul><p className="franchise-card-note">Критическое ограничение: собственник может вывезти часть оборудования. Каждая позиция требует письменного подтверждения.</p></article>
          </section>

          <section className="franchise-section" aria-labelledby="petrogradka-capex-title">
            <SectionHeading number="02" title="Сценарный CAPEX" text="Готовое производство может сократить вложения в ремонт и инженерию и направить капитал в технологию, медиа и цифровую инфраструктуру." />
            <div className="petrogradka-capex" id="petrogradka-capex-title">{content.capexRows.map((row) => <div key={row.label}><span>{row.label}</span><strong>{formatRange(row.value)}</strong><small><Status status="assumption" /> {row.note}</small></div>)}</div>
            <p className="franchise-exclusion"><strong>Не включено:</strong> {content.excluded.join(" · ")}.</p>
          </section>

          <section className="franchise-section" aria-labelledby="petrogradka-operations-title">
            <SectionHeading number="03" title="Торговая функция и подтверждения" text="Производственный сценарий не поглощает CAPEX торговых точек и не подменяет существующую модель точки." />
            <div className="petrogradka-operations" id="petrogradka-operations-title"><article><h3>Допустимые слои</h3><ol>{content.trading.map((item, index) => <li key={item}><span>{String(index + 1).padStart(2, "0")}</span>{item}</li>)}</ol></article><article><h3>Требует подтверждения</h3><ul>{content.confirmation.map((item) => <li key={item}>{item}</li>)}</ul></article></div>
          </section>

          <section className="franchise-section franchise-next" aria-label="Следующий шаг"><div><Status status="research" /><h2>До получения входов сценарий не формирует финансовый результат.</h2><p>После due diligence параметры передаются в существующую Financial Model как scenario layer: без второй независимой модели и без изменения baseline.</p></div><a className="franchise-link" href={franchisePlatformContent.links.core}>Вернуться к Franchise Platform Strategy</a></section>
        </div>
      </section>
    </div>
  );
}
