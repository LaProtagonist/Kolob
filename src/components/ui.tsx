import { FocusEvent, FormEvent, KeyboardEvent, useCallback, useEffect, useRef, useState } from "react";
import type {
  DocumentItem,
  HeroContent,
  HeroVideo,
  ImageSpec,
  NavGroup,
  ProductItem,
  TimelineItem,
  VideoItem
} from "../types";
import { footerGroups, navGroups, primaryNav } from "../content/navigation";
import { interestOptions } from "../content/investorQuestions";
import { site } from "../content/site";

type HeaderProps = {
  activePath: string;
};

function srcSet(base: string, widths: number[]) {
  return widths.map((width) => `/media/${base}-${width}.webp ${width}w`).join(", ");
}

export function ResponsiveImage({
  base,
  widths,
  sizes,
  alt,
  className,
  loading = "lazy",
  fetchPriority = "auto"
}: ImageSpec & {
  className?: string;
  loading?: "eager" | "lazy";
  fetchPriority?: "high" | "low" | "auto";
}) {
  const largest = widths[widths.length - 1];

  return (
    <img
      className={className}
      src={`/media/${base}-${largest}.webp`}
      srcSet={srcSet(base, widths)}
      sizes={sizes}
      alt={alt}
      loading={loading}
      decoding="async"
      fetchPriority={fetchPriority}
    />
  );
}

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return reduced;
}

function prepareInlineAutoplayVideo(element: HTMLVideoElement) {
  element.defaultMuted = true;
  element.muted = true;
  element.autoplay = true;
  element.loop = true;
  element.playsInline = true;
  element.setAttribute("muted", "");
  element.setAttribute("autoplay", "");
  element.setAttribute("loop", "");
  element.setAttribute("playsinline", "");
  element.setAttribute("webkit-playsinline", "");
}

function isNearViewport(element: HTMLElement) {
  const rect = element.getBoundingClientRect();
  return rect.top < window.innerHeight + 220 && rect.bottom > -120;
}

export function HeroMedia({ image, video }: { image: ImageSpec; video?: HeroVideo }) {
  const reducedMotion = usePrefersReducedMotion();
  const videoRef = useRef<HTMLVideoElement>(null);
  const hasVideo = Boolean(video?.mp4 || video?.webm);

  useEffect(() => {
    if (!hasVideo || reducedMotion) {
      return;
    }

    const element = videoRef.current;
    if (!element) {
      return;
    }

    prepareInlineAutoplayVideo(element);
    void element.play().catch(() => undefined);
  }, [hasVideo, reducedMotion, video?.mp4, video?.webm]);

  if (!hasVideo || reducedMotion) {
    return <ResponsiveImage {...(video?.poster ?? image)} loading="eager" fetchPriority="high" />;
  }

  return (
    <video
      ref={videoRef}
      className="hero-video"
      poster={`/media/${video?.poster.base}-${video?.poster.widths[video.poster.widths.length - 1]}.webp`}
      muted
      autoPlay
      loop
      playsInline
      preload="metadata"
      aria-label={image.alt}
    >
      {video?.webm ? <source src={video.webm} type="video/webm" /> : null}
      {video?.mp4 ? <source src={video.mp4} type="video/mp4" /> : null}
    </video>
  );
}

export function LoopMedia({
  image,
  video,
  className,
  loading = "lazy"
}: {
  image: ImageSpec;
  video?: HeroVideo;
  className?: string;
  loading?: "eager" | "lazy";
}) {
  const reducedMotion = usePrefersReducedMotion();
  const videoRef = useRef<HTMLVideoElement>(null);
  const retryTimer = useRef<number | null>(null);
  const verifyTimer = useRef<number | null>(null);
  const autoplayAttempts = useRef(0);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const hasVideo = Boolean(video?.mp4 || video?.webm);
  const poster = video?.poster ?? image;
  const posterSrc = `/media/${poster.base}-${poster.widths[poster.widths.length - 1]}.webp`;

  const clearPlaybackTimers = useCallback(() => {
    if (retryTimer.current) {
      window.clearTimeout(retryTimer.current);
      retryTimer.current = null;
    }

    if (verifyTimer.current) {
      window.clearTimeout(verifyTimer.current);
      verifyTimer.current = null;
    }
  }, []);

  const attemptAutoplay = useCallback(
    (force = false) => {
      if (!hasVideo || reducedMotion || (!force && autoplayBlocked)) {
        return;
      }

      const element = videoRef.current;
      if (!element) {
        return;
      }

      if (!isVisible && !isNearViewport(element)) {
        return;
      }

      prepareInlineAutoplayVideo(element);
      clearPlaybackTimers();
      autoplayAttempts.current += 1;

      const scheduleRetry = () => {
        if (autoplayAttempts.current >= 4) {
          if (element.paused) {
            setAutoplayBlocked(true);
          }
          return;
        }

        retryTimer.current = window.setTimeout(() => attemptAutoplay(force), 420);
      };

      const playAttempt = element.play();

      verifyTimer.current = window.setTimeout(() => {
        if (!element.paused) {
          autoplayAttempts.current = 0;
          setAutoplayBlocked(false);
          return;
        }

        scheduleRetry();
      }, 900);

      if (playAttempt) {
        playAttempt
          .then(() => {
            autoplayAttempts.current = 0;
            setAutoplayBlocked(false);
          })
          .catch(() => {
            if (verifyTimer.current) {
              window.clearTimeout(verifyTimer.current);
              verifyTimer.current = null;
            }
            scheduleRetry();
          });
      }
    },
    [autoplayBlocked, clearPlaybackTimers, hasVideo, isVisible, reducedMotion]
  );

  useEffect(() => {
    setAutoplayBlocked(false);
    setIsVisible(false);
    autoplayAttempts.current = 0;
    clearPlaybackTimers();
  }, [clearPlaybackTimers, video?.mp4, video?.webm]);

  useEffect(() => {
    return () => clearPlaybackTimers();
  }, [clearPlaybackTimers]);

  useEffect(() => {
    if (!hasVideo || reducedMotion) {
      return;
    }

    const element = videoRef.current;
    if (!element) {
      return;
    }

    prepareInlineAutoplayVideo(element);

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsVisible(entry.isIntersecting);
      },
      { rootMargin: "220px 0px", threshold: 0.06 }
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [hasVideo, reducedMotion, video?.mp4, video?.webm]);

  useEffect(() => {
    attemptAutoplay();
  }, [attemptAutoplay]);

  useEffect(() => {
    if (!hasVideo || reducedMotion) {
      return;
    }

    let animationFrame = 0;

    function retryWhenNearViewport() {
      if (animationFrame) {
        return;
      }

      animationFrame = window.requestAnimationFrame(() => {
        animationFrame = 0;
        const element = videoRef.current;
        if (element && element.paused && isNearViewport(element)) {
          attemptAutoplay(true);
        }
      });
    }

    function retryWhenPageIsActive() {
      if (document.visibilityState === "visible") {
        attemptAutoplay(true);
      }
    }

    retryWhenNearViewport();
    window.addEventListener("scroll", retryWhenNearViewport, { passive: true });
    window.addEventListener("resize", retryWhenNearViewport);
    window.addEventListener("touchend", retryWhenNearViewport, { passive: true });
    window.addEventListener("pageshow", retryWhenPageIsActive);
    document.addEventListener("visibilitychange", retryWhenPageIsActive);
    return () => {
      if (animationFrame) {
        window.cancelAnimationFrame(animationFrame);
      }
      window.removeEventListener("scroll", retryWhenNearViewport);
      window.removeEventListener("resize", retryWhenNearViewport);
      window.removeEventListener("touchend", retryWhenNearViewport);
      window.removeEventListener("pageshow", retryWhenPageIsActive);
      document.removeEventListener("visibilitychange", retryWhenPageIsActive);
    };
  }, [attemptAutoplay, hasVideo, reducedMotion]);

  async function handleManualPlay() {
    const element = videoRef.current;
    if (!element) {
      return;
    }

    clearPlaybackTimers();
    prepareInlineAutoplayVideo(element);
    autoplayAttempts.current = 0;

    try {
      await element.play();
      setAutoplayBlocked(false);
    } catch {
      setAutoplayBlocked(true);
    }
  }

  if (!hasVideo || reducedMotion) {
    return <ResponsiveImage {...poster} className={className} loading={loading} />;
  }

  return (
    <div className={`loop-media-frame ${className ?? ""} ${autoplayBlocked ? "is-manual-start" : ""}`}>
      <video
        ref={videoRef}
        className="loop-media-video"
        poster={posterSrc}
        muted
        autoPlay
        loop
        playsInline
        preload="auto"
        aria-label={image.alt}
        onLoadedMetadata={() => attemptAutoplay()}
        onCanPlay={() => {
          attemptAutoplay();
        }}
        onCanPlayThrough={() => {
          attemptAutoplay();
        }}
        onPlaying={() => {
          clearPlaybackTimers();
          autoplayAttempts.current = 0;
          setAutoplayBlocked(false);
        }}
        onError={() => setAutoplayBlocked(true)}
      >
        {video?.mp4 ? <source src={video.mp4} type="video/mp4" /> : null}
        {video?.webm ? <source src={video.webm} type="video/webm" /> : null}
      </video>
      {autoplayBlocked ? (
        <button className="loop-media-play" type="button" onClick={handleManualPlay} aria-label="Запустить видео">
          <span aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}

function isActive(activePath: string, href: string) {
  return href === "/" ? activePath === "/" : activePath.startsWith(href);
}

export function SiteHeader({ activePath }: HeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 18);
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    setMenuOpen(false);
  }, [activePath]);

  return (
    <header className={`site-header ${scrolled ? "is-scrolled" : ""}`}>
      <a className="brand-link" href="/" aria-label="Колобочная - главная">
        <img src={scrolled ? site.logoDark : site.logoLight} alt="Колобочная" />
      </a>

      <DesktopNavigation activePath={activePath} />

      <a className="header-cta" href={site.ctaHref}>
        {site.ctaLabel}
      </a>

      <button
        className="menu-toggle"
        type="button"
        aria-label={menuOpen ? "Закрыть меню" : "Открыть меню"}
        aria-expanded={menuOpen}
        aria-controls="mobile-menu"
        onClick={() => setMenuOpen((value) => !value)}
      >
        <span />
        <span />
      </button>

      <MobileNavigation activePath={activePath} open={menuOpen} />
    </header>
  );
}

function DesktopNavigation({ activePath }: HeaderProps) {
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const closeTimer = useRef<number | null>(null);
  const navRef = useRef<HTMLElement>(null);

  function clearCloseTimer() {
    if (closeTimer.current) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }

  function open(label: string) {
    clearCloseTimer();
    setOpenGroup(label);
  }

  function scheduleClose() {
    clearCloseTimer();
    closeTimer.current = window.setTimeout(() => {
      setOpenGroup(null);
    }, 240);
  }

  function toggleOpen(label: string) {
    clearCloseTimer();
    setOpenGroup((current) => (current === label ? null : label));
  }

  function handleDropdownBlur(event: FocusEvent<HTMLDivElement>) {
    const nextFocus = event.relatedTarget;
    if (!nextFocus || !event.currentTarget.contains(nextFocus as Node)) {
      scheduleClose();
    }
  }

  useEffect(() => {
    function handlePointerDown(event: globalThis.MouseEvent) {
      if (!navRef.current?.contains(event.target as Node)) {
        setOpenGroup(null);
      }
    }

    function handleKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        setOpenGroup(null);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      clearCloseTimer();
    };
  }, []);

  useEffect(() => {
    setOpenGroup(null);
  }, [activePath]);

  return (
    <nav className="desktop-nav" aria-label="Основная навигация" ref={navRef}>
      {primaryNav.map((item) => (
        <a className={isActive(activePath, item.href) ? "is-active" : ""} href={item.href} key={item.href}>
          {item.label}
        </a>
      ))}
      {navGroups.map((group) => {
        const groupActive = group.items.some((item) => isActive(activePath, item.href));
        const groupOpen = openGroup === group.label;
        return (
          <div
            className={`nav-dropdown ${groupActive ? "is-active" : ""} ${groupOpen ? "is-open" : ""}`}
            key={group.label}
            onMouseEnter={() => open(group.label)}
            onMouseLeave={scheduleClose}
            onFocus={() => open(group.label)}
            onBlur={handleDropdownBlur}
          >
            <button
              type="button"
              aria-haspopup="true"
              aria-expanded={groupOpen}
              onClick={() => open(group.label)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  toggleOpen(group.label);
                }
                if (event.key === "Escape") {
                  setOpenGroup(null);
                }
              }}
            >
              {group.label}
            </button>
            <div className="nav-dropdown-panel" onMouseEnter={() => open(group.label)} onMouseLeave={scheduleClose}>
              {group.items.map((item) => (
                <a
                  className={isActive(activePath, item.href) ? "is-active" : ""}
                  href={item.href}
                  key={item.href}
                  onClick={() => setOpenGroup(null)}
                >
                  {item.label}
                </a>
              ))}
            </div>
          </div>
        );
      })}
    </nav>
  );
}

function MobileNavigation({ activePath, open }: HeaderProps & { open: boolean }) {
  const [openGroups, setOpenGroups] = useState<string[]>([]);

  useEffect(() => {
    if (!open) {
      setOpenGroups([]);
    }
  }, [open]);

  useEffect(() => {
    setOpenGroups([]);
  }, [activePath]);

  function toggleGroup(label: string) {
    setOpenGroups((current) => (current.includes(label) ? current.filter((item) => item !== label) : [...current, label]));
  }

  return (
    <nav className={`mobile-nav ${open ? "is-open" : ""}`} id="mobile-menu" aria-label="Мобильная навигация">
      {primaryNav.map((item) => (
        <a className={isActive(activePath, item.href) ? "is-active" : ""} href={item.href} key={item.href}>
          {item.label}
        </a>
      ))}
      {navGroups.map((group) => {
        const groupOpen = openGroups.includes(group.label);
        return (
          <div className={`mobile-nav-group ${groupOpen ? "is-open" : ""}`} key={group.label}>
            <button type="button" aria-expanded={groupOpen} onClick={() => toggleGroup(group.label)}>
              {group.label}
            </button>
            <div className="mobile-nav-submenu">
              {group.items.map((item) => (
                <a className={isActive(activePath, item.href) ? "is-active" : ""} href={item.href} key={item.href}>
                  {item.label}
                </a>
              ))}
            </div>
          </div>
        );
      })}
      <a className="mobile-nav-cta" href={site.ctaHref}>
        {site.ctaLabel}
      </a>
    </nav>
  );
}

export function SiteFooter() {
  const contacts = [site.contact.email, site.contact.telegram, site.contact.phone].filter(Boolean);

  return (
    <footer className="site-footer">
      <div className="footer-brand">
        <img src={site.logoLight} alt="Колобочная" />
        <p>{site.tagline}</p>
      </div>
      <div className="footer-grid">
        {footerGroups.map((group: NavGroup) => (
          <div className="footer-group" key={group.label}>
            <h2>{group.label}</h2>
            {group.items.map((item) => (
              <a href={item.href} key={item.href}>
                {item.label}
              </a>
            ))}
          </div>
        ))}
        {contacts.length ? (
          <div className="footer-group">
            <h2>Контакты</h2>
            {contacts.map((item) => (
              <span key={item}>{item}</span>
            ))}
          </div>
        ) : null}
      </div>
      <p className="footer-disclaimer">{site.disclaimer}</p>
      <p className="footer-year">© {site.year} Колобочная</p>
    </footer>
  );
}

export function Breadcrumbs({ current }: { current: string }) {
  if (current === "Главная") {
    return null;
  }

  return (
    <nav className="breadcrumbs" aria-label="Хлебные крошки">
      <a href="/">Главная</a>
      <span aria-hidden="true">/</span>
      <span>{current}</span>
    </nav>
  );
}

export function PageHero({ hero, current }: { hero: HeroContent; current: string }) {
  const className = ["page-hero", hero.mediaShape === "circle" ? "page-hero-circle" : "", hero.heroClassName ?? ""]
    .filter(Boolean)
    .join(" ");

  return (
    <section className={className}>
      <div className="page-hero-copy">
        <Breadcrumbs current={current} />
        {hero.eyebrow ? <p className="eyebrow">{hero.eyebrow}</p> : null}
        <h1>{hero.title}</h1>
        <p className="lead">{hero.lead}</p>
        {hero.text ? <p>{hero.text}</p> : null}
      </div>
      <div className="page-hero-media">
        <HeroMedia image={hero.image} video={hero.video} />
      </div>
    </section>
  );
}

export function SectionIntro({
  eyebrow,
  title,
  text,
  align = "left"
}: {
  eyebrow?: string;
  title: string;
  text?: string;
  align?: "left" | "center";
}) {
  return (
    <div className={`section-intro ${align === "center" ? "is-centered" : ""}`}>
      {eyebrow ? <p className="eyebrow dark">{eyebrow}</p> : null}
      <h2>{title}</h2>
      {text ? <p>{text}</p> : null}
    </div>
  );
}

export function QuoteBlock({
  quote,
  name,
  role,
  image
}: {
  quote: string;
  name?: string | null;
  role?: string | null;
  image?: ImageSpec | null;
}) {
  return (
    <section className="quote-block">
      <div>
        <p className="quote-mark">“</p>
        <blockquote>{quote}</blockquote>
        {name || role ? (
          <div className="quote-author">
            {name ? <strong>{name}</strong> : null}
            {role ? <span>{role}</span> : null}
          </div>
        ) : null}
      </div>
      {image ? (
        <div className="quote-image">
          <ResponsiveImage {...image} />
        </div>
      ) : null}
    </section>
  );
}

export function MediaCarousel({ title, text, videos }: { title: string; text?: string; videos: VideoItem[] }) {
  const scroller = useRef<HTMLDivElement>(null);

  function scrollByCard(direction: number) {
    const element = scroller.current;
    if (!element) {
      return;
    }
    element.scrollBy({ left: direction * Math.min(680, element.clientWidth * 0.86), behavior: "smooth" });
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowLeft") {
      scrollByCard(-1);
    }
    if (event.key === "ArrowRight") {
      scrollByCard(1);
    }
  }

  if (!videos.length) {
    return null;
  }

  return (
    <section className="section section-paper">
      <div className="section-inner">
        <div className="carousel-head">
          <SectionIntro eyebrow="Видео" title={title} text={text} />
          <div className="carousel-actions" aria-label="Навигация по видео">
            <button type="button" onClick={() => scrollByCard(-1)} aria-label="Предыдущее видео">
              ←
            </button>
            <button type="button" onClick={() => scrollByCard(1)} aria-label="Следующее видео">
              →
            </button>
          </div>
        </div>
        <div
          className="media-carousel"
          ref={scroller}
          tabIndex={0}
          onKeyDown={handleKeyDown}
          aria-label="Обзорные ролики"
        >
          {videos.map((video, index) => (
            <VideoCard featured={false} item={video} key={`${video.title}-${index}`} />
          ))}
        </div>
      </div>
    </section>
  );
}

export function VideoCard({ item, featured = false }: { item: VideoItem; featured?: boolean }) {
  const facts = [
    item.author ? { label: "Автор", value: item.author } : null,
    item.year ? { label: "Дата", value: item.year } : null,
    item.platform ? { label: "Платформа", value: item.platform } : null,
    item.place ? { label: "Место", value: item.place } : null,
    item.viewsLabel ? { label: null, value: item.viewsLabel, full: true } : null,
    item.viewsNote ? { label: null, value: item.viewsNote, full: true } : null,
    item.reach ? { label: "Охват", value: item.reach } : null
  ].filter(Boolean) as { label: string | null; value: string; full?: boolean }[];
  const hasVideo = Boolean(item.videoMp4 || item.videoWebm);

  return (
    <article className={`video-card ${featured ? "is-featured" : ""}`}>
      <div className="video-poster">
        {hasVideo ? (
          <video
            poster={`/media/${item.poster.base}-${item.poster.widths[item.poster.widths.length - 1]}.webp`}
            controls
            preload="metadata"
            playsInline
          >
            {item.videoWebm ? <source src={item.videoWebm} type="video/webm" /> : null}
            {item.videoMp4 ? <source src={item.videoMp4} type="video/mp4" /> : null}
          </video>
        ) : (
          <>
            <ResponsiveImage {...item.poster} />
            <span className="play-mark" aria-hidden="true" />
          </>
        )}
      </div>
      <div className="video-card-body">
        <p className="card-meta">{item.meta}</p>
        <h3>{item.title}</h3>
        {item.description ? <p>{item.description}</p> : null}
        {facts.length ? (
          <dl>
            {facts.map((fact) => (
              <div className={fact.full ? "is-full" : ""} key={`${fact.label ?? "fact"}-${fact.value}`}>
                {fact.label ? <dt>{fact.label}</dt> : null}
                <dd>{fact.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
        {item.originalPublicationUrl ? (
          <a className="text-link" href={item.originalPublicationUrl} target="_blank" rel="noreferrer">
            Оригинальная публикация
          </a>
        ) : null}
        {item.status ? <span className="status-pill">{item.status}</span> : null}
      </div>
    </article>
  );
}

export function ProductCarousel({
  id,
  items,
  title,
  text
}: {
  id?: string;
  items: ProductItem[];
  title?: string;
  text?: string;
}) {
  if (!items.length) {
    return null;
  }

  return (
    <section className="section section-light" id={id}>
      <div className="section-inner">
        {title ? <SectionIntro eyebrow="Продукт" title={title} text={text} /> : null}
        <div className="product-carousel">
          {items.map((item) => (
            <article className="product-card" key={item.title}>
              {item.image ? <ResponsiveImage {...item.image} /> : null}
              <div>
                {item.tag ? <p className="card-meta">{item.tag}</p> : null}
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

export function Timeline({
  items,
  title = "Проверка в реальной среде",
  text,
  cta
}: {
  items: TimelineItem[];
  title?: string;
  text?: string;
  cta?: {
    href: string;
    label: string;
  };
}) {
  return (
    <section className="section section-paper">
      <div className="section-inner timeline-layout">
        <SectionIntro
          eyebrow="Практика"
          title={title}
          text={text}
        />
        <div className="timeline">
          {items.map((item) => (
            <article className="timeline-item" key={`${item.period}-${item.title}`}>
              <div className="timeline-year">{item.period}</div>
              <div className="timeline-card">
                <TimelineMedia item={item} />
                <div>
                  <h3>{item.title}</h3>
                  <p>{item.text}</p>
                </div>
              </div>
            </article>
          ))}
          {cta ? (
            <div className="timeline-more">
              <a className="timeline-more-link" href={cta.href}>
                {cta.label}
              </a>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function TimelineMedia({ item }: { item: TimelineItem }) {
  const reducedMotion = usePrefersReducedMotion();
  const video = item.coverVideo;
  const hasVideo = Boolean(video?.mp4 || video?.webm);

  if (!hasVideo || reducedMotion) {
    return <ResponsiveImage {...(video?.poster ?? item.image)} />;
  }

  return (
    <video
      className="timeline-cover-video"
      poster={`/media/${video?.poster.base}-${video?.poster.widths[video.poster.widths.length - 1]}.webp`}
      muted
      autoPlay
      loop
      playsInline
      preload="metadata"
      aria-label={video?.poster.alt ?? item.image.alt}
    >
      {video?.webm ? <source src={video.webm} type="video/webm" /> : null}
      {video?.mp4 ? <source src={video.mp4} type="video/mp4" /> : null}
    </video>
  );
}

export function ProcessFlow({ steps, title, text }: { steps: string[]; title: string; text?: string }) {
  return (
    <section className="section section-dark">
      <div className="section-inner process-layout">
        <SectionIntro eyebrow="Процесс" title={title} text={text} />
        <ol className="process-flow">
          {steps.map((step, index) => (
            <li key={step}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <strong>{step}</strong>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

export function ClusterDiagram({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`cluster-diagram ${compact ? "is-compact" : ""}`} aria-label="Схема производственной модели">
      <div className="cluster-hub">
        <strong>центр</strong>
      </div>
      {Array.from({ length: 8 }, (_, index) => (
        <span className={`cluster-point cluster-point-${index + 1}`} key={index} aria-hidden="true" />
      ))}
      <p>городские точки</p>
    </div>
  );
}

export function CTASection({
  title,
  text,
  primaryLabel = "Обсудить участие",
  primaryHref = "/investor-questions",
  secondaryLabel = "Запросить материалы",
  secondaryHref = "/materials"
}: {
  title: string;
  text: string;
  primaryLabel?: string;
  primaryHref?: string;
  secondaryLabel?: string;
  secondaryHref?: string;
}) {
  return (
    <section className="cta-section">
      <div>
        <h2>{title}</h2>
        <p>{text}</p>
      </div>
      <div className="cta-actions">
        <a className="button button-primary" href={primaryHref}>
          {primaryLabel}
        </a>
        <a className="button button-secondary" href={secondaryHref}>
          {secondaryLabel}
        </a>
      </div>
    </section>
  );
}

export function DocumentCard({ item }: { item: DocumentItem }) {
  return (
    <article className="document-card">
      <div>
        {item.status ? <p className="card-meta">{item.status}</p> : null}
        <h3>{item.title}</h3>
        <p>{item.description}</p>
      </div>
      <a href={item.documentUrl ?? item.href}>{item.actionLabel}</a>
    </article>
  );
}

function serializeForm(form: HTMLFormElement) {
  const data = new FormData(form);
  return Object.fromEntries(Array.from(data.entries()).map(([key, value]) => [key, String(value).trim()]));
}

export function ContactForm() {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const name = String(data.get("name") || "").trim();
    const company = String(data.get("company") || "").trim();
    const contact = String(data.get("contact") || "").trim();
    const email = String(data.get("email") || "").trim();
    const consent = data.get("consent");
    const endpoint = import.meta.env.VITE_CONTACT_FORM_ENDPOINT as string | undefined;

    if (!name || !company || !contact || !email) {
      setError("Заполните имя, компанию, email и телефон или Telegram.");
      setSent(false);
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Укажите корректный email.");
      setSent(false);
      return;
    }

    if (!consent) {
      setError("Подтвердите согласие на обработку данных.");
      setSent(false);
      return;
    }

    if (!endpoint) {
      setError("Не удалось отправить запрос. Попробуйте позже.");
      setSent(false);
      return;
    }

    setSubmitting(true);
    setError("");
    setSent(false);

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(serializeForm(form))
      });

      if (!response.ok) {
        throw new Error("Request failed");
      }

      setSent(true);
      form.reset();
    } catch {
      setError("Не удалось отправить запрос. Попробуйте позже.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="contact-form" onSubmit={handleSubmit} noValidate>
      <div className="form-grid">
        <label>
          Имя
          <input name="name" autoComplete="name" required />
        </label>
        <label>
          Компания
          <input name="company" autoComplete="organization" required />
        </label>
        <label>
          Должность
          <input name="role" autoComplete="organization-title" />
        </label>
        <label>
          Телефон или Telegram
          <input name="contact" autoComplete="tel" required />
        </label>
        <label>
          Email
          <input name="email" type="email" autoComplete="email" required />
        </label>
        <label>
          Формат интереса
          <select name="interest" defaultValue={interestOptions[0]}>
            {interestOptions.map((option) => (
              <option value={option} key={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label>
        Комментарий
        <textarea name="comment" rows={5} />
      </label>
      <label className="consent-field">
        <input name="consent" type="checkbox" />
        <span>Согласен на обработку персональных данных.</span>
      </label>
      <button className="button button-primary" type="submit" disabled={submitting}>
        {submitting ? "Отправляем..." : "Обсудить участие"}
      </button>
      {error || sent ? (
        <p className={`form-status ${error ? "is-error" : ""}`} role="status">
          {error || "Спасибо. Мы свяжемся с вами и предоставим материалы проекта."}
        </p>
      ) : null}
    </form>
  );
}
