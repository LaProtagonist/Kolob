import { MouseEvent, useEffect, useMemo, useState } from "react";
import {
  Breadcrumbs,
  ContactForm,
  CTASection,
  DocumentCard,
  HeroMedia,
  LoopMedia,
  MediaCarousel,
  PageHero,
  ProcessFlow,
  ProductCarousel,
  QuoteBlock,
  ResponsiveImage,
  SectionIntro,
  SiteFooter,
  SiteHeader,
  Timeline
} from "./components/ui";
import { MomentsMosaic } from "./components/MomentsMosaic";
import { ProcessRoute } from "./components/ProcessRoute";
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
  homeTeasers,
  overviewVideos
} from "./content/home";
import { investorQuestionsHero } from "./content/investorQuestions";
import {
  clusterDetails,
  investmentHero,
  investmentUses,
  participationModels,
  pointFormats
} from "./content/investment";
import { documents, materialVideos, materialsHero, moments } from "./content/materials";
import { productionRoute } from "./content/production-route";
import { drinkItems, processSteps, qualityBlocks, qualityDirections, qualityHero, urbanFarmItems } from "./content/quality";
import { pageByPath } from "./content/site";
import type { PageMeta } from "./types";

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
    canonical.href = `${window.location.origin}${page.path}`;

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

    const ogUrl = ensureMeta('meta[property="og:url"]', () => {
      const meta = document.createElement("meta");
      meta.setAttribute("property", "og:url");
      return meta;
    }) as HTMLMetaElement;
    ogUrl.content = `${window.location.origin}${page.path}`;

    const ogImage = ensureMeta('meta[property="og:image"]', () => {
      const meta = document.createElement("meta");
      meta.setAttribute("property", "og:image");
      return meta;
    }) as HTMLMetaElement;
    ogImage.content = page.ogImage ?? "/media/hero-kolobok-1200.webp";
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
            {homeHero.taglineParts.map((line) => (
              <span key={line}>{line}</span>
            ))}
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
            <SectionIntro eyebrow="О проекте" title={homeAbout.title} text={homeAbout.text} />
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
            {...homeHero.image}
            sizes="(max-width: 720px) 100vw, 42vw"
            className="statement-photo"
          />
        </div>
      </section>

      <section className="section section-light">
        <div className="section-inner statement-grid">
          <div className="quality-teaser-copy">
            <SectionIntro title={homeQuality.title} text={homeQuality.text} />
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
        secondaryLabel={approvedCopy.cta.requestProjectMaterials}
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
        primaryLabel="К качеству"
        primaryHref="/quality"
        secondaryLabel="История проекта"
        secondaryHref="/history"
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
        primaryLabel="Инвестиционная модель"
        primaryHref="/investment"
        secondaryLabel="Материалы"
        secondaryHref="/materials"
      />
    </>
  );
}

function QualityPage() {
  return (
    <>
      <PageHero hero={qualityHero} current="Качество и подход" />
      <ProductCarousel
        items={qualityBlocks}
        title="Качество продукта"
        text="Опорные направления: сырьё, собственная технология, современные методы обработки, открытая кухня и централизованный контроль рецептур."
      />
      <section className="section section-light">
        <div className="section-inner two-column">
          <SectionIntro title="Опорные направления качества" text="Страница раскрывает продуктовый, технологический и производственный подход «Колобочной»." />
          <ul className="feature-list">
            {qualityDirections.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </section>
      <section className="section section-paper">
        <div className="section-inner">
          <SectionIntro
            eyebrow="Напитки"
            title="Собственная культура напитков в пути."
            text="Пуэр, пуэр с кокосовыми сливками, натуральные лимонады и сезонные сочетания работают как отдельная продуктовая линия."
          />
          <div className="card-grid four">
            {drinkItems.map((item) => (
              <article className="product-card" key={item.title}>
                {item.image ? <ResponsiveImage {...item.image} /> : null}
                <div>
                  <h3>{item.title}</h3>
                  <p>{item.text}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>
      <ProductCarousel
        items={urbanFarmItems}
        title="Городская ферма"
        text={approvedCopy.farmFormula}
      />
      <ProcessFlow
        steps={processSteps}
        title="Производственная цепочка"
        text={approvedCopy.fullPathControl}
      />
      <CTASection
        title="Посмотреть инвестиционную модель"
        text="Производственная система позволяет воспроизводить рецептуру независимо от города и формата заведения."
        primaryLabel="К инвестициям"
        primaryHref="/investment"
        secondaryLabel="К материалам"
        secondaryHref="/materials"
      />
    </>
  );
}

function InvestmentPage() {
  return (
    <>
      <PageHero hero={investmentHero} current="Инвестиционное предложение" />
      <section className="section section-light">
        <div className="section-inner investment-grid">
          <ProcessRoute route={productionRoute} tone="light" />
          <div>
            <SectionIntro title="Производственная модель" text={approvedCopy.productionExplanation} />
            <ul className="feature-list">
              {clusterDetails.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>
      <ProductCarousel
        items={pointFormats}
        title="Форматы заведений"
        text="Модель поддерживает разные городские и событийные форматы без изменения базовой технологии продукта."
      />
      <section className="section section-paper">
        <div className="section-inner two-column">
          <div>
            <SectionIntro title="Форматы участия" text="Публичная страница показывает направления участия без раскрытия условий сделки." />
            <ul className="feature-list">
              {participationModels.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <div>
            <SectionIntro
              title="Что раскрывается в закрытых материалах"
              text="Закрытые материалы раскрывают состав работ, последовательность запуска и параметры финансовой модели."
            />
            <ul className="feature-list">
              {investmentUses.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>
      <CTASection
        title={approvedCopy.cta.requestProjectMaterials}
        text={approvedCopy.financialModelRequest}
        primaryLabel={approvedCopy.cta.requestProjectMaterials}
        primaryHref="/investor-questions"
        secondaryLabel="Материалы"
        secondaryHref="/materials"
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
        title={approvedCopy.cta.requestFullMaterials}
        text="Оставьте запрос, и команда проекта предоставит актуальный комплект материалов для предметного разговора."
        primaryLabel={approvedCopy.cta.requestFullMaterials}
        primaryHref="/investor-questions"
        secondaryLabel="Инвестиционная модель"
        secondaryHref="/investment"
      />
    </>
  );
}

function InvestorQuestionsPage() {
  return (
    <>
      <PageHero hero={investorQuestionsHero} current="Вопросы инвестора" />
      <section className="section section-light">
        <div className="section-inner form-layout" id="form">
          <div>
            <SectionIntro
              title="Канал для предметного разговора"
              text="Оставьте контакт — мы отправим материалы и обсудим подходящий формат участия."
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
        <h1>Политика конфиденциальности</h1>
        <p>
          Сайт «Колобочная» использует форму заявки для связи с потенциальными партнёрами. Переданные данные применяются
          для обработки запроса, подготовки ответа и предоставления материалов проекта.
        </p>
        <p>
          Данные не публикуются на сайте и не используются для массовых рассылок без отдельного согласия. Финальная
          юридическая редакция политики утверждается перед публичным запуском проекта.
        </p>
        <a className="button button-primary" href="/investor-questions">
          Вернуться к форме
        </a>
      </div>
    </section>
  );
}

function renderPage(path: string) {
  switch (path) {
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
    default:
      return <HomePage />;
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

  return (
    <div className="app-shell" onClick={handleInternalNavigation}>
      <SiteHeader activePath={activePage.path} />
      <main>{renderPage(activePage.path)}</main>
      <SiteFooter />
    </div>
  );
}
