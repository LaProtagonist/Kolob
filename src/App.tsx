import { lazy, MouseEvent, Suspense, useEffect, useMemo, useState } from "react";
import {
  Breadcrumbs,
  ContactForm,
  CTASection,
  DocumentCard,
  HeroMedia,
  LoopMedia,
  MediaCarousel,
  PageHero,
  QuoteBlock,
  ResponsiveImage,
  SectionIntro,
  SiteFooter,
  SiteHeader,
  Timeline
} from "./components/ui";
import { MomentsMosaic } from "./components/MomentsMosaic";
import { ProcessRoute } from "./components/ProcessRoute";
import { InvestorConfigurationProvider } from "./components/InvestorConfigurationProvider";
import { approvedCopy } from "./content/approved-copy";
import {
  conceptDefinition,
  conceptHero,
  conceptMeaningBlock,
  conceptMenuFormats,
  conceptTasteBlock
} from "./content/concept";
import { historyHero, timeline } from "./content/history";
import {
  founderQuote,
  homeAbout,
  homeHero,
  homeQuality,
  homeScale,
  homeStatementMedia,
  homeTeasers,
  overviewVideos
} from "./content/home";
import { investorQuestionsHero, investorQuestionsIntro } from "./content/investorQuestions";
import {
  investmentCta,
  investmentDialogue,
  investmentHero,
  investmentParticipation,
  investmentPointFormats,
  investmentQualityStandard,
  investmentWhatScales,
  investmentWhyNow
} from "./content/investment";
import { documents, materialVideos, materialsHero, moments } from "./content/materials";
import { productionRoute } from "./content/production-route";
import { qualityCta, qualityDrinks, qualityHero, qualitySections, repeatableQuality } from "./content/quality";
import { pageByPath, site } from "./content/site";
import type { PageMeta } from "./types";

const CapexConfiguratorPage = lazy(() =>
  import("./components/CapexConfigurator").then((module) => ({ default: module.CapexConfiguratorPage }))
);

const LaunchBudgetPage = lazy(() =>
  import("./components/LaunchBudget").then((module) => ({ default: module.LaunchBudgetPage }))
);

const RevenueModelPage = lazy(() =>
  import("./components/RevenueModel").then((module) => ({ default: module.RevenueModelPage }))
);

const EconomicsPage = lazy(() =>
  import("./components/Economics").then((module) => ({ default: module.EconomicsPage }))
);

const InvestorTerminalPage = lazy(() =>
  import("./components/InvestorTerminal").then((module) => ({ default: module.InvestorTerminalPage }))
);

const ControlHomePage = lazy(() => import("./components/ControlHub").then((module) => ({ default: module.ControlHomePage })));
const ControlCapexPage = lazy(() => import("./components/ControlHub").then((module) => ({ default: module.ControlCapexPage })));
const ControlParticipationPage = lazy(() => import("./components/ControlHub").then((module) => ({ default: module.ControlParticipationPage })));
const ControlRequestsPage = lazy(() => import("./components/ControlHub").then((module) => ({ default: module.ControlRequestsPage })));

const controlRoutesEnabled = import.meta.env.DEV;

function normalizePath(pathname: string) {
  return pathname === "" ? "/" : pathname.replace(/\/+$/, "") || "/";
}

function ensureMeta(selector: string, create: () => HTMLMetaElement | HTMLLinkElement) {
  let element = document.head.querySelector(selector) as HTMLMetaElement | HTMLLinkElement | null;
  if (!element) {
    element = create();
    document.head.appendChild(element);
  }
  return element;
}

function usePageMeta(page: PageMeta) {
  useEffect(() => {
    const absolutePageUrl = `${window.location.origin}${page.path}`;
    const absoluteImageUrl = new URL(page.ogImage ?? "/media/hero-kolobok-1200.webp", window.location.origin).href;

    document.title = page.title;

    const description = ensureMeta('meta[name="description"]', () => {
      const meta = document.createElement("meta");
      meta.setAttribute("name", "description");
      return meta;
    }) as HTMLMetaElement;
    description.content = page.description;

    const canonical = ensureMeta('link[rel="canonical"]', () => {
      const link = document.createElement("link");
      link.setAttribute("rel", "canonical");
      return link;
    }) as HTMLLinkElement;
    canonical.href = absolutePageUrl;

    const robots = ensureMeta('meta[name="robots"]', () => {
      const meta = document.createElement("meta");
      meta.setAttribute("name", "robots");
      return meta;
    }) as HTMLMetaElement;
    robots.content = page.noindex ? "noindex, nofollow" : "index, follow";

    const ogTitle = ensureMeta('meta[property="og:title"]', () => {
      const meta = document.createElement("meta");
      meta.setAttribute("property", "og:title");
      return meta;
    }) as HTMLMetaElement;
    ogTitle.content = page.title;

    const ogDescription = ensureMeta('meta[property="og:description"]', () => {
      const meta = document.createElement("meta");
      meta.setAttribute("property", "og:description");
      return meta;
    }) as HTMLMetaElement;
    ogDescription.content = page.description;

    const ogType = ensureMeta('meta[property="og:type"]', () => {
      const meta = document.createElement("meta");
      meta.setAttribute("property", "og:type");
      return meta;
    }) as HTMLMetaElement;
    ogType.content = "website";

    const ogSiteName = ensureMeta('meta[property="og:site_name"]', () => {
      const meta = document.createElement("meta");
      meta.setAttribute("property", "og:site_name");
      return meta;
    }) as HTMLMetaElement;
    ogSiteName.content = site.name;

    const ogLocale = ensureMeta('meta[property="og:locale"]', () => {
      const meta = document.createElement("meta");
      meta.setAttribute("property", "og:locale");
      return meta;
    }) as HTMLMetaElement;
    ogLocale.content = "ru_RU";

    const ogUrl = ensureMeta('meta[property="og:url"]', () => {
      const meta = document.createElement("meta");
      meta.setAttribute("property", "og:url");
      return meta;
    }) as HTMLMetaElement;
    ogUrl.content = absolutePageUrl;

    const ogImage = ensureMeta('meta[property="og:image"]', () => {
      const meta = document.createElement("meta");
      meta.setAttribute("property", "og:image");
      return meta;
    }) as HTMLMetaElement;
    ogImage.content = absoluteImageUrl;

    const twitterCard = ensureMeta('meta[name="twitter:card"]', () => {
      const meta = document.createElement("meta");
      meta.setAttribute("name", "twitter:card");
      return meta;
    }) as HTMLMetaElement;
    twitterCard.content = "summary_large_image";

    const twitterTitle = ensureMeta('meta[name="twitter:title"]', () => {
      const meta = document.createElement("meta");
      meta.setAttribute("name", "twitter:title");
      return meta;
    }) as HTMLMetaElement;
    twitterTitle.content = page.title;

    const twitterDescription = ensureMeta('meta[name="twitter:description"]', () => {
      const meta = document.createElement("meta");
      meta.setAttribute("name", "twitter:description");
      return meta;
    }) as HTMLMetaElement;
    twitterDescription.content = page.description;

    const twitterImage = ensureMeta('meta[name="twitter:image"]', () => {
      const meta = document.createElement("meta");
      meta.setAttribute("name", "twitter:image");
      return meta;
    }) as HTMLMetaElement;
    twitterImage.content = absoluteImageUrl;
  }, [page]);
}

function QualityPillarIcon({ icon }: { icon: string }) {
  return <img src={`/media/quality-icons/${icon}.png`} alt="" loading="lazy" decoding="async" aria-hidden="true" />;
}

function HomePage() {
  return (
    <>
      <section className="home-hero" aria-labelledby="home-title">
        <div className="home-hero-copy">
          <h1 id="home-title">{homeHero.title}</h1>
          <p className="hero-tagline" aria-label={approvedCopy.tagline}>
            {homeHero.taglineParts.map((line, index) => [
              <span key={line}>{line}</span>,
              index < homeHero.taglineParts.length - 1 ? "\n" : null
            ])}
          </p>
          <p className="lead">{homeHero.lead}</p>
          {homeHero.text ? <p>{homeHero.text}</p> : null}
          <div className="hero-actions">
            <a className="button button-primary" href="/investor-questions">
              {approvedCopy.cta.discuss}
            </a>
            <a className="button button-secondary" href="/materials">
              {approvedCopy.cta.viewMaterials}
            </a>
          </div>
        </div>
        <div className="home-hero-media" aria-label="Главный продуктовый визуал">
          <HeroMedia image={homeHero.image} video={homeHero.video} />
        </div>
      </section>

      <section className="section section-light about-project-section">
        <div className="section-inner about-project-grid">
          <div className="about-project-copy">
            <SectionIntro title={homeAbout.title} text={homeAbout.text} />
            <a className="text-link" href={homeAbout.link.href}>
              {homeAbout.link.label}
            </a>
          </div>
          <div className="about-project-cards" aria-label="Ключевые основания проекта">
            {homeTeasers.map((item) => (
              <article
                className={`about-project-card ${item.featured ? "is-featured" : ""} ${
                  item.visual === "fox-mark" ? "culturalCodeCard" : ""
                } ${
                  item.visual === "play-mark" ? "provenInterestCard" : ""
                }`}
                key={item.title}
              >
                {item.image ? (
                  <div className="about-project-card-media" aria-hidden="true">
                    <ResponsiveImage {...item.image} />
                  </div>
                ) : null}
                <span className="about-project-card-number">{item.number}</span>
                {item.visual !== "fox-mark" ? (
                  <span className={`about-project-card-mark about-project-card-mark-${item.visual}`} aria-hidden="true" />
                ) : null}
                <h3>{item.title}</h3>
                <p>{item.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <MediaCarousel
        title="Видео проекта уже собрали миллионы просмотров."
        text="Идея получила внимание аудитории ещё на этапе первых запусков."
        videos={overviewVideos}
      />

      <QuoteBlock {...founderQuote} />

      <section className="section section-yellow">
        <div className="section-inner statement-grid">
          <div>
            <SectionIntro title={approvedCopy.conceptDefinition} text={approvedCopy.productVariety} />
            <p className="category-line">Мясные · Морские · Вегетарианские · Сладкие</p>
            <a className="text-link" href="/concept">
              Подробнее о концепции
            </a>
          </div>
          <ResponsiveImage
            {...homeStatementMedia.image}
            sizes="(max-width: 720px) 100vw, 42vw"
            className="statement-photo"
          />
        </div>
      </section>

      <section className="section section-light home-quality-section">
        <div className="section-inner statement-grid home-quality-layout">
          <div className="quality-teaser-copy">
            <SectionIntro title={homeQuality.title} text={homeQuality.text} />
            <div className="quality-pillars-wrap">
              <div className="quality-pillars-label">{homeQuality.label}</div>
              <ol className="quality-pillars" aria-label={homeQuality.label}>
                {homeQuality.pillars.map((item) => (
                  <li className="quality-pillar" key={item.number}>
                    <span className="quality-pillar-number">{item.number}</span>
                    <span className="quality-pillar-icon">
                      <QualityPillarIcon icon={item.icon} />
                    </span>
                    <span className="quality-pillar-text">
                      <strong>{item.title}</strong>
                      <span>{item.text}</span>
                    </span>
                  </li>
                ))}
              </ol>
              <a className="text-link" href={homeQuality.link.href}>
                {homeQuality.link.label}
              </a>
            </div>
          </div>
          <LoopMedia
            image={homeQuality.media.image}
            video={homeQuality.media.video}
            className="statement-photo"
          />
        </div>
      </section>

      <section className="section section-dark">
        <div className="section-inner scale-layout">
          <ProcessRoute route={productionRoute} />
          <div>
            <SectionIntro title={homeScale.title} text={homeScale.text} />
            <a className="text-link text-link-light" href={homeScale.link.href}>
              {homeScale.link.label}
            </a>
          </div>
        </div>
      </section>

      <CTASection
        title="Рассматриваем партнёров для следующего этапа развития."
        text="Проект готовится к масштабированию через производственную систему, городские точки и единый стандарт качества."
        primaryLabel={approvedCopy.cta.discuss}
        primaryHref="/investor-questions"
        secondaryLabel={approvedCopy.cta.viewMaterials}
        secondaryHref="/materials"
      />
    </>
  );
}

function ConceptPage() {
  return (
    <>
      <PageHero hero={conceptHero} current="Концепция" />
      <section className="section section-yellow">
        <div className="section-inner definition-block">
          <p>{conceptDefinition}</p>
        </div>
      </section>
      <section className="section section-light concept-taste-section">
        <div className="section-inner concept-taste-block">
          <div className="concept-taste-copy">
            <SectionIntro title={conceptTasteBlock.title} text={conceptTasteBlock.text} />
          </div>
          <div className="concept-taste-visual">
            <p className="concept-tags">{conceptTasteBlock.tags}</p>
            {conceptTasteBlock.collage.length > 0 ? (
              <div className="concept-collage" aria-label="Разные вкусы и разрезы Колобочной">
                {conceptTasteBlock.collage.map((image, index) => (
                  <div className={`concept-collage-item concept-collage-item-${index + 1}`} key={`${image.base}-${index}`}>
                    <ResponsiveImage {...image} />
                  </div>
                ))}
              </div>
            ) : null}
          </div>
          <picture className="concept-fox">
            <source srcSet={conceptTasteBlock.fox.webp} type="image/webp" />
            <img src={conceptTasteBlock.fox.png} alt={conceptTasteBlock.fox.alt} loading="lazy" decoding="async" />
          </picture>
        </div>
      </section>
      <section className="section section-paper">
        <div className="section-inner">
          <SectionIntro title={conceptMenuFormats.title} text={conceptMenuFormats.text} />
          <div className="concept-format-grid">
            {conceptMenuFormats.items.map((item, index) => (
              <article className="concept-format-card" key={item.title}>
                {item.image ? (
                  <div className="concept-format-media">
                    <ResponsiveImage {...item.image} />
                  </div>
                ) : (
                  <div className="concept-format-icon" aria-hidden="true">
                    {String(index + 1).padStart(2, "0")}
                  </div>
                )}
                <h3>{item.title}</h3>
                <p>{item.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
      <section className="section section-paper concept-meaning-section">
        <div className="section-inner concept-meaning">
          <div className="concept-meaning-column">
            <SectionIntro title={conceptMeaningBlock.left.title} />
            <div className="concept-meaning-text">
              {conceptMeaningBlock.left.text.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>
            <ul className="concept-meaning-list">
              {conceptMeaningBlock.left.tags.map((item, index) => (
                <li key={item}>
                  <span className="concept-meaning-number">{String(index + 1).padStart(2, "0")}</span>
                  <span className="concept-meaning-divider" aria-hidden="true" />
                  <span className="concept-meaning-item-text">{item}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="concept-meaning-column">
            <SectionIntro title={conceptMeaningBlock.right.title} />
            <div className="concept-meaning-text">
              {conceptMeaningBlock.right.text.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>
            <ul className="concept-meaning-list">
              {conceptMeaningBlock.right.tags.map((item, index) => (
                <li key={item}>
                  <span className="concept-meaning-number">{String(index + 1).padStart(2, "0")}</span>
                  <span className="concept-meaning-divider" aria-hidden="true" />
                  <span className="concept-meaning-item-text">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
      <CTASection
        title="Так создаётся качество"
        text="Следующий слой проекта — сырьё, технология, напитки, городская ферма и производственная цепочка."
        primaryLabel={approvedCopy.cta.discuss}
        primaryHref="/investor-questions"
        secondaryLabel="К качеству"
        secondaryHref="/quality"
      />
    </>
  );
}

function HistoryPage() {
  return (
    <>
      <PageHero hero={historyHero} current="История проекта" />
      <Timeline
        items={timeline}
        title="От первых точек — к масштабируемой системе"
        text={approvedCopy.history.timelineIntro}
        cta={{
          href: "/materials#moments",
          label: "Больше моментов с Колобочной"
        }}
      />
      <CTASection
        title="Проверенный продукт становится системой"
        text="История «Колобочной» — это не набор отдельных запусков, а практическая проверка формата: от событийных площадок до стационарной городской точки. Следующий шаг — превратить этот опыт в масштабируемую производственную модель с единым стандартом качества."
        primaryLabel={approvedCopy.cta.discuss}
        primaryHref="/investor-questions"
        secondaryLabel="Модель развития"
        secondaryHref="/investment"
      />
    </>
  );
}

function QualityStorySection({
  section,
  index
}: {
  section: (typeof qualitySections)[number];
  index: number;
}) {
  const isReversed = index % 2 === 1;

  return (
    <section className={`section ${section.tone === "paper" ? "section-paper" : "section-light"} quality-story-section`} id={section.id}>
      <div className={`section-inner quality-story ${isReversed ? "is-reversed" : ""}`}>
        <div className="quality-story-copy">
          <SectionIntro title={section.title} />
          <div className="quality-story-text">
            {section.text.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </div>
        </div>
        {section.video && section.image ? (
          <LoopMedia
            image={section.image}
            video={section.video}
            className="statement-photo quality-story-media"
          />
        ) : section.image ? (
          <div className="quality-story-media">
            <ResponsiveImage {...section.image} />
          </div>
        ) : null}
      </div>
    </section>
  );
}

function QualityDrinksSection() {
  return (
    <section className="section section-light quality-drinks-section">
      <div className="section-inner">
        <SectionIntro eyebrow="Напитки" title={qualityDrinks.title} text={qualityDrinks.text} />
        <div className="quality-drink-lines">
          {qualityDrinks.lines.map((item) => (
            <article className="quality-drink-line" key={item.title}>
              {item.image ? (
                <div className="quality-drink-media">
                  <ResponsiveImage {...item.image} />
                </div>
              ) : null}
              <div>
                <h3>{item.title}</h3>
                <p>{item.text}</p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function RepeatableQualitySection() {
  return (
    <section className="section section-dark quality-repeat-section">
      <div className="section-inner quality-repeat quality-repeat-text-only">
        <div>
          <SectionIntro title={repeatableQuality.title} />
          <div className="quality-story-text">
            <p>{repeatableQuality.text}</p>
            <p>{repeatableQuality.note}</p>
          </div>
        </div>
      </div>
    </section>
  );
}

function QualityPage() {
  return (
    <>
      <PageHero hero={qualityHero} current="Качество и подход" />
      {qualitySections.slice(0, 3).map((section, index) => (
        <QualityStorySection section={section} index={index} key={section.id} />
      ))}
      <QualityDrinksSection />
      {qualitySections.slice(3).map((section, index) => (
        <QualityStorySection section={section} index={index + 3} key={section.id} />
      ))}
      <RepeatableQualitySection />
      <CTASection
        title={qualityCta.title}
        text={qualityCta.text}
        primaryLabel={qualityCta.primaryLabel}
        primaryHref={qualityCta.primaryHref}
        secondaryLabel={qualityCta.secondaryLabel}
        secondaryHref={qualityCta.secondaryHref}
      />
    </>
  );
}

function InvestmentPage() {
  return (
    <>
      <PageHero hero={investmentHero} current="Модель развития" />

      <section className="section section-light investment-section">
        <div className="section-inner investment-two-column">
          <SectionIntro title={investmentWhatScales.title} text={investmentWhatScales.text} />
          <ul className="investment-editorial-list">
            {investmentWhatScales.items.map((item) => (
              <li key={item.number}>
                <span>{item.number}</span>
                <div>
                  <strong>{item.title}</strong>
                  <p>{item.text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="section section-dark investment-section">
        <div className="section-inner investment-grid">
          <ProcessRoute route={productionRoute} tone="dark" />
          <div>
            <SectionIntro title={investmentQualityStandard.title} text={investmentQualityStandard.text} />
          </div>
        </div>
      </section>

      <section className="section section-paper investment-section">
        <div className="section-inner">
          <SectionIntro title={investmentPointFormats.title} text={investmentPointFormats.text} />
          <div className="investment-card-grid investment-card-grid-4">
            {investmentPointFormats.items.map((item, index) => (
              <article className={`investment-card is-soft investment-format-card investment-format-card-${index + 1}`} key={item.title}>
                <h3>{item.title}</h3>
                <p>{item.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section section-light investment-section">
        <div className="section-inner investment-two-column">
          <SectionIntro title={investmentWhyNow.title} text={investmentWhyNow.text} />
          <ul className="investment-editorial-list">
            {investmentWhyNow.items.map((item, index) => (
              <li key={item}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <strong>{item}</strong>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="section section-paper investment-section">
        <div className="section-inner">
          <SectionIntro title={investmentParticipation.title} text={investmentParticipation.text} />
          <div className="investment-card-grid investment-card-grid-3">
            {investmentParticipation.items.map((item) => (
              <article className="investment-card" key={item.title}>
                <h3>{item.title}</h3>
                <p>{item.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section section-light investment-section" id="dialogue">
        <div className="section-inner investment-dialogue-layout">
          <SectionIntro title={investmentDialogue.title} text={investmentDialogue.text} />
          <ol className="investment-dialogue-steps">
            {investmentDialogue.steps.map((step) => (
              <li key={step.number}>
                <span>{step.number}</span>
                <div>
                  <h3>{step.title}</h3>
                  <p>{step.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <CTASection
        title={investmentCta.title}
        text={investmentCta.text}
        primaryLabel={investmentCta.primaryLabel}
        primaryHref={investmentCta.primaryHref}
        secondaryLabel={investmentCta.secondaryLabel}
        secondaryHref={investmentCta.secondaryHref}
      />
    </>
  );
}

function MaterialsPage() {
  return (
    <>
      <PageHero hero={materialsHero} current="Материалы" />
      <MediaCarousel
        title="Продукт уже встретился с аудиторией."
        text={approvedCopy.practicalProof}
        videos={materialVideos}
      />
      <MomentsMosaic
        id="moments"
        title="Яркие моменты с Колобочной"
        description="Живые фото и видео проекта: продукт, точки, фестивали, процесс и гости."
        items={moments}
      />
      {documents.length ? (
        <section className="section section-paper">
          <div className="section-inner">
            <SectionIntro
              title="Документы"
              text="Закрытые материалы предоставляются после подтверждения предметного интереса."
            />
            <div className="document-grid">
              {documents.map((item) => (
                <DocumentCard item={item} key={item.title} />
              ))}
            </div>
          </div>
        </section>
      ) : null}
      <CTASection
        title="Материалы для предметного разговора"
        text="Оставьте удобный контакт. Мы свяжемся, уточним формат интереса и обсудим, какие материалы будут полезны для следующего шага."
        primaryLabel={approvedCopy.cta.discuss}
        primaryHref="/investor-questions"
        secondaryLabel="Модель развития"
        secondaryHref="/investment"
      />
    </>
  );
}

function InvestorQuestionsPage() {
  return (
    <>
      <PageHero hero={investorQuestionsHero} current="Обсудить участие" />
      <section className="section section-light">
        <div className="section-inner form-layout" id="form">
          <div>
            <SectionIntro
              title={investorQuestionsIntro.title}
              text={investorQuestionsIntro.text}
            />
          </div>
          <ContactForm />
        </div>
      </section>
    </>
  );
}

function PrivacyPage() {
  return (
    <section className="plain-page">
      <div className="section-inner">
        <Breadcrumbs current="Политика конфиденциальности" />
        <h1>Политика обработки персональных данных</h1>
        <p>
          Сайт «Колобочная» использует форму заявки для связи с потенциальными партнёрами. Переданные данные применяются
          для обработки запроса, подготовки ответа и предоставления материалов проекта.
        </p>
        <p>
          Данные не публикуются на сайте и не используются для массовых рассылок без отдельного согласия.
        </p>
        <a className="button button-primary" href="/investor-questions">
          Вернуться к форме
        </a>
      </div>
    </section>
  );
}

function NotFoundPage() {
  return (
    <section className="plain-page">
      <div className="section-inner">
        <Breadcrumbs current="Страница не найдена" />
        <h1>Страница не найдена</h1>
        <p>Такой страницы на сайте нет. Вернитесь на главную или выберите нужный раздел в меню.</p>
        <a className="button button-primary" href="/">
          На главную
        </a>
      </div>
    </section>
  );
}

function renderPage(path: string) {
  switch (path) {
    case "/":
      return <HomePage />;
    case "/concept":
      return <ConceptPage />;
    case "/history":
      return <HistoryPage />;
    case "/quality":
      return <QualityPage />;
    case "/investment":
      return <InvestmentPage />;
    case "/materials":
      return <MaterialsPage />;
    case "/investor-questions":
      return <InvestorQuestionsPage />;
    case "/privacy":
      return <PrivacyPage />;
    case "/control":
      return controlRoutesEnabled ? <Suspense fallback={null}><ControlHomePage /></Suspense> : <NotFoundPage />;
    case "/control/capex":
    case "/capex-configurator":
      if (!controlRoutesEnabled) return <NotFoundPage />;
      return (
        <Suspense fallback={<main className="plain-page"><div className="section-inner"><p>Загружается CAPEX-конфигуратор…</p></div></main>}>
          <ControlCapexPage />
        </Suspense>
      );
    case "/control/participation":
      return controlRoutesEnabled ? <Suspense fallback={null}><ControlParticipationPage /></Suspense> : <NotFoundPage />;
    case "/control/requests":
      return controlRoutesEnabled ? <Suspense fallback={null}><ControlRequestsPage /></Suspense> : <NotFoundPage />;
    case "/launch-budget":
      return (
        <Suspense fallback={<main className="plain-page"><div className="section-inner"><p>Загружается расчёт стоимости запуска…</p></div></main>}>
          <LaunchBudgetPage />
        </Suspense>
      );
    case "/revenue-model":
      return (
        <Suspense fallback={<main className="plain-page"><div className="section-inner"><p>Загружается расчёт объёма продаж…</p></div></main>}>
          <RevenueModelPage />
        </Suspense>
      );
    case "/economics":
      return (
        <Suspense fallback={<main className="plain-page"><div className="section-inner"><p>Загружается экономика объекта…</p></div></main>}>
          <EconomicsPage />
        </Suspense>
      );
    case "/investor-terminal":
      return (
        <Suspense fallback={<main className="plain-page"><div className="section-inner"><p>Загружается терминал инвестора…</p></div></main>}>
          <InvestorTerminalPage />
        </Suspense>
      );
    case "/404":
      return <NotFoundPage />;
    default:
      return <NotFoundPage />;
  }
}

export default function App() {
  const [path, setPath] = useState(() => normalizePath(window.location.pathname));
  const activePage = useMemo(() => pageByPath(path), [path]);
  usePageMeta(activePage);

  useEffect(() => {
    const handlePopState = () => setPath(normalizePath(window.location.pathname));
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    if (window.location.hash) {
      window.setTimeout(() => scrollToAnchor(window.location.hash), 0);
    }
  }, [path]);

  function scrollToAnchor(hash: string) {
    const id = decodeURIComponent(hash.replace(/^#/, ""));
    const target = document.getElementById(id);
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function navigate(href: string) {
    const nextUrl = new URL(href, window.location.origin);
    const nextPath = normalizePath(nextUrl.pathname);
    const nextHref = `${nextPath}${nextUrl.hash}`;
    if (nextPath === path) {
      if (nextUrl.hash) {
        scrollToAnchor(nextUrl.hash);
      } else {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
      return;
    }
    window.history.pushState({}, "", nextHref);
    setPath(nextPath);
    window.setTimeout(() => {
      if (nextUrl.hash) {
        scrollToAnchor(nextUrl.hash);
      } else {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    }, 0);
  }

  function handleInternalNavigation(event: MouseEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;
    const anchor = target.closest("a[href]") as HTMLAnchorElement | null;
    if (!anchor || anchor.target || anchor.hasAttribute("download")) {
      return;
    }
    const url = new URL(anchor.href);
    if (url.origin !== window.location.origin || !url.pathname.startsWith("/")) {
      return;
    }
    event.preventDefault();
    navigate(`${url.pathname}${url.hash}`);
  }

  const isControlRoute = path === "/capex-configurator" || path === "/control" || path.startsWith("/control/");
  return (
    <InvestorConfigurationProvider>
      <div className="app-shell" onClick={handleInternalNavigation}>
        {isControlRoute ? renderPage(path) : <><SiteHeader activePath={activePage.path} /><main>{renderPage(activePage.path)}</main><SiteFooter /></>}
      </div>
    </InvestorConfigurationProvider>
  );
}
