import { Breadcrumbs } from "./ui";
import { petrogradkaContent } from "../content/franchise-platform";
import "./FranchisePlatform.css";

function SectionHeading({ number, title, text }: { number: string; title: string; text?: string }) {
  return <header className="franchise-section-heading"><span>{number}</span><div><h2>{title}</h2>{text ? <p>{text}</p> : null}</div></header>;
}

/**
 * A direct, share-only presentation of a concrete property. This module is
 * intentionally isolated from the protected Franchise Platform strategy.
 */
export function PetrogradkaPage() {
  const content = petrogradkaContent;
  return (
    <div className="franchise-page franchise-scenario-page" data-testid="petrogradka-scenario-page">
      <section className="franchise-hero" aria-labelledby="petrogradka-title">
        <div className="section-inner">
          <Breadcrumbs current="Петроградка" />
          <div className="franchise-hero-grid">
            <div>
              <p className="franchise-eyebrow">Готовая производственная база</p>
              <h1 id="petrogradka-title">{content.title}</h1>
              <p className="franchise-lead">{content.lead}</p>
            </div>
            <aside className="franchise-boundary">
              <strong>Предлагаемая роль объекта</strong>
              <p>{content.role}</p>
              <small>{content.roleNote}</small>
            </aside>
          </div>
        </div>
      </section>

      <section className="franchise-main">
        <div className="section-inner">
          <section className="franchise-section" aria-labelledby="petrogradka-fit-title">
            <SectionHeading number="01" title="Почему объект интересен проекту" text={content.fit.intro} />
            <div className="petrogradka-fit-grid" id="petrogradka-fit-title">
              {content.fit.items.map((item) => <article key={item.title}><h3>{item.title}</h3><p>{item.text}</p></article>)}
            </div>
          </section>

          <section className="franchise-section petrogradka-grid" aria-label="Оборудование и инфраструктура">
            <article className="franchise-card petrogradka-equipment-card">
              <p className="franchise-card-kicker">По данным объявления</p>
              <h2>Оборудование, указанное в объявлении</h2>
              <p>{content.equipmentIntro}</p>
              <div className="petrogradka-equipment-groups">
                {content.equipmentGroups.map((group) => <section key={group.title}><h3>{group.title}</h3><ul>{group.items.map((item) => <li key={item}>{item}</li>)}</ul></section>)}
              </div>
              <p className="petrogradka-equipment-note">{content.equipmentNote}</p>
            </article>
            <article className="franchise-card petrogradka-infrastructure-card">
              <p className="franchise-card-kicker">По данным объявления</p>
              <h2>Инженерная инфраструктура</h2>
              <p>{content.infrastructureIntro}</p>
              <ul>{content.infrastructure.map((item) => <li key={item}>{item}</li>)}</ul>
              <p className="franchise-card-note">{content.infrastructureNote}</p>
            </article>
          </section>

          <section className="franchise-section" aria-labelledby="petrogradka-additions-title">
            <SectionHeading number="02" title="Что создаёт проект на этой базе" text={content.additions.intro} />
            <div className="petrogradka-additions-grid" id="petrogradka-additions-title">
              {content.additions.items.map((item) => <article key={item.title}><h3>{item.title}</h3><p>{item.text}</p></article>)}
            </div>
          </section>

          <section className="franchise-section" aria-labelledby="petrogradka-investment-title">
            <SectionHeading number="03" title="Ориентир бюджета первого этапа" text={content.investment.intro} />
            <div className="petrogradka-launch-title"><span>Одна стратегия</span><span aria-hidden="true">→</span><strong>Две конфигурации запуска</strong></div>
            <div className="petrogradka-launch-variants" id="petrogradka-investment-title" aria-label="Варианты запуска">
              {content.investment.variants.map((item, index) => <article key={item.title}><span>Вариант {index + 1}</span><h3>{item.title}</h3><strong>{item.value}</strong><p>{item.text}</p><small>{item.note}</small></article>)}
            </div>
            <aside className="petrogradka-capital-effect">
              <strong>Эффект готовой производственной базы</strong>
              {content.investment.effect.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
            </aside>
          </section>

          <section className="franchise-section" aria-labelledby="petrogradka-network-role-title">
            <SectionHeading number="04" title="Роль объекта в развитии сети" />
            <div className="petrogradka-narrative-grid" id="petrogradka-network-role-title">
              {content.networkRole.map((item) => <article key={item.title}><h3>{item.title}</h3><p>{item.text}</p></article>)}
            </div>
          </section>

          <section className="franchise-section petrogradka-interaction" aria-labelledby="petrogradka-interaction-title">
            <SectionHeading number="05" title="Возможная модель взаимодействия" />
            <div id="petrogradka-interaction-title">{content.interaction.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}</div>
          </section>

          <section className="franchise-section" aria-labelledby="petrogradka-confirmations-title">
            <SectionHeading number="06" title="Что необходимо подтвердить" text={content.confirmation.intro} />
            <div className="petrogradka-confirmations" id="petrogradka-confirmations-title">
              {content.confirmation.groups.map((group) => <article key={group.title}><h3>{group.title}</h3><ul>{group.items.map((item) => <li key={item}>{item}</li>)}</ul></article>)}
            </div>
          </section>

          <section className="franchise-section petrogradka-format" aria-labelledby="petrogradka-format-title">
            <SectionHeading number="07" title="Предлагаемый формат запуска" />
            <div id="petrogradka-format-title">{content.format.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}</div>
          </section>

          <section className="franchise-section franchise-next petrogradka-next" aria-labelledby="petrogradka-next-title">
            <div>
              <p className="franchise-card-kicker">Совместная работа с собственником</p>
              <h2 id="petrogradka-next-title">Следующий шаг</h2>
              <p>{content.nextStep}</p>
              <p>{content.nextStepNote}</p>
            </div>
            <a className="franchise-link" href="/investor-questions">Обсудить условия</a>
          </section>
        </div>
      </section>
    </div>
  );
}
