import { useEffect, useMemo, useRef, useState } from "react";
import type {
  CSSProperties,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  TouchEvent as ReactTouchEvent
} from "react";
import { flushSync } from "react-dom";
import type { MomentItem } from "../types";

type MomentsMosaicProps = {
  id: string;
  title: string;
  description?: string;
  items: MomentItem[];
};

type OriginBounds = {
  left: number;
  top: number;
  scaleX: number;
  scaleY: number;
};

const animationDuration = 380;

function useReducedMotion() {
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

function isUsableItem(item: MomentItem) {
  return Boolean(item.src && (item.type === "image" || item.poster));
}

export function MomentsMosaic({ id, title, description, items }: MomentsMosaicProps) {
  const reducedMotion = useReducedMotion();
  const [failedIds, setFailedIds] = useState<Set<string>>(() => new Set());
  const filteredItems = useMemo(
    () => items.filter((item) => isUsableItem(item) && !failedIds.has(item.id)),
    [failedIds, items]
  );
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [phase, setPhase] = useState<"opening" | "closing" | null>(null);
  const [origin, setOrigin] = useState<OriginBounds | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<HTMLDivElement>(null);
  const tileRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const pointerStart = useRef<{ x: number; y: number } | null>(null);
  const swiped = useRef(false);
  const videoStartedInGesture = useRef(false);
  const activeItem = activeIndex === null ? null : filteredItems[activeIndex];
  const activePosition = activeIndex === null ? 0 : activeIndex + 1;

  useEffect(() => {
    if (activeIndex !== null) {
      window.setTimeout(() => viewerRef.current?.focus(), 0);
    }
  }, [activeIndex]);

  useEffect(() => {
    if (activeIndex === null) {
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [activeIndex]);

  useEffect(() => {
    const video = videoRef.current;
    if (video && activeItem?.type === "video") {
      if (videoStartedInGesture.current) {
        videoStartedInGesture.current = false;
        return;
      }

      startVideoPlayback(video);
    }
  }, [activeIndex, activeItem?.type]);

  useEffect(() => {
    if (activeIndex === null) {
      return undefined;
    }

    const handleWindowKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) {
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        closeItem();
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        moveActive(-1);
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        moveActive(1);
      }
    };

    window.addEventListener("keydown", handleWindowKeyDown);
    return () => window.removeEventListener("keydown", handleWindowKeyDown);
  }, [activeIndex, filteredItems.length]);

  function stopVideo() {
    const video = videoRef.current;
    if (video) {
      video.pause();
      try {
        video.currentTime = 0;
      } catch {
        // Some mobile browsers reject currentTime changes before metadata is ready.
      }
    }
  }

  function startVideoPlayback(video: HTMLVideoElement | null) {
    if (!video) {
      return false;
    }

    video.muted = true;
    video.playsInline = true;
    video.setAttribute("playsinline", "");
    video.setAttribute("webkit-playsinline", "");
    video.load();
    try {
      video.currentTime = 0;
    } catch {
      // Metadata may not be ready yet; playback can still start from the beginning.
    }
    video.play().catch(() => undefined);
    return true;
  }

  function getOriginBounds(index: number): OriginBounds | null {
    const tile = tileRefs.current[index];
    if (!tile) {
      return null;
    }

    const tileRect = tile.getBoundingClientRect();
    return {
      left: tileRect.left,
      top: tileRect.top,
      scaleX: tileRect.width / window.innerWidth,
      scaleY: tileRect.height / window.innerHeight
    };
  }

  function openItem(index: number) {
    const nextOrigin = getOriginBounds(index);
    const nextPhase = reducedMotion ? null : "opening";
    const nextItem = filteredItems[index];

    if (nextItem?.type === "video") {
      flushSync(() => {
        setOrigin(nextOrigin);
        setActiveIndex(index);
        setPhase(nextPhase);
      });
      videoStartedInGesture.current = startVideoPlayback(videoRef.current);
    } else {
      setOrigin(nextOrigin);
      setActiveIndex(index);
      setPhase(nextPhase);
      videoStartedInGesture.current = false;
    }

    if (!reducedMotion) {
      window.setTimeout(() => setPhase(null), animationDuration);
    }
  }

  function closeItem() {
    if (activeIndex === null) {
      return;
    }

    stopVideo();
    setOrigin(getOriginBounds(activeIndex));
    if (reducedMotion) {
      const tile = tileRefs.current[activeIndex];
      setActiveIndex(null);
      setPhase(null);
      tile?.focus();
      return;
    }

    setPhase("closing");
    window.setTimeout(() => {
      const tile = tileRefs.current[activeIndex];
      setActiveIndex(null);
      setPhase(null);
      tile?.focus();
    }, animationDuration);
  }

  function moveActive(delta: number) {
    if (activeIndex === null || !filteredItems.length) {
      return;
    }

    stopVideo();
    const nextIndex = (activeIndex + delta + filteredItems.length) % filteredItems.length;
    setOrigin(getOriginBounds(nextIndex));
    setActiveIndex(nextIndex);
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (activeIndex === null) {
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      closeItem();
    }

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      moveActive(-1);
    }

    if (event.key === "ArrowRight") {
      event.preventDefault();
      moveActive(1);
    }
  }

  function startSwipe(x: number, y: number) {
    pointerStart.current = { x, y };
    swiped.current = false;
  }

  function finishSwipe(x: number, y: number) {
    const start = pointerStart.current;
    pointerStart.current = null;
    if (!start) {
      return;
    }

    const deltaX = x - start.x;
    const deltaY = y - start.y;
    if (Math.abs(deltaX) > 52 && Math.abs(deltaX) > Math.abs(deltaY) * 1.4) {
      swiped.current = true;
      moveActive(deltaX > 0 ? -1 : 1);
      window.setTimeout(() => {
        swiped.current = false;
      }, 0);
    }
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerType === "touch") {
      return;
    }

    startSwipe(event.clientX, event.clientY);
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerType === "touch") {
      return;
    }

    finishSwipe(event.clientX, event.clientY);
  }

  function handleTouchStart(event: ReactTouchEvent<HTMLDivElement>) {
    const touch = event.changedTouches[0];
    if (touch) {
      startSwipe(touch.clientX, touch.clientY);
    }
  }

  function handleTouchEnd(event: ReactTouchEvent<HTMLDivElement>) {
    const touch = event.changedTouches[0];
    if (touch) {
      finishSwipe(touch.clientX, touch.clientY);
    }
  }

  function handleViewerClick(event: ReactMouseEvent<HTMLDivElement>) {
    if (swiped.current) {
      return;
    }

    const target = event.target as HTMLElement;
    if (target.closest(".moments-control") || target.closest("video")) {
      return;
    }

    closeItem();
  }

  function handleMediaError(id: string) {
    setFailedIds((current) => {
      const next = new Set(current);
      next.add(id);
      return next;
    });
  }

  if (!filteredItems.length) {
    return null;
  }

  return (
    <section className="section section-light moments-section" id={id}>
      <div className="section-inner">
        <div className="moments-head">
          <p className="eyebrow">Галерея</p>
          <h2>{title}</h2>
          {description ? <p>{description}</p> : null}
        </div>
        <div className="moments-stage" ref={stageRef}>
          <div className="moments-grid-scroll" aria-hidden={activeIndex !== null}>
            <div className="moments-grid">
              {filteredItems.map((item, index) => (
                <button
                  aria-label={item.type === "video" ? `${item.alt}. Открыть видео` : `${item.alt}. Открыть фото`}
                  className="moments-tile"
                  key={item.id}
                  onClick={() => openItem(index)}
                  ref={(element) => {
                    tileRefs.current[index] = element;
                  }}
                  tabIndex={activeIndex === null ? 0 : -1}
                  type="button"
                >
                  <img
                    alt={item.alt}
                    decoding="async"
                    loading="lazy"
                    onError={() => handleMediaError(item.id)}
                    src={item.type === "video" ? item.poster ?? item.src : item.src}
                  />
                  {item.type === "video" ? <span className="moments-play" aria-hidden="true" /> : null}
                </button>
              ))}
            </div>
          </div>

          {activeItem ? (
            <div
              aria-label={`${activeItem.alt}. Просмотр ${activePosition} из ${filteredItems.length}`}
              className={`moments-expanded ${activeItem.type === "video" ? "is-video" : ""} ${phase ? `is-${phase}` : ""}`}
              onClick={handleViewerClick}
              onKeyDown={handleKeyDown}
              onPointerDown={handlePointerDown}
              onPointerUp={handlePointerUp}
              onTouchEnd={handleTouchEnd}
              onTouchStart={handleTouchStart}
              ref={viewerRef}
              role="region"
              style={
                origin
                  ? ({
                      "--moment-from-left": `${origin.left}px`,
                      "--moment-from-top": `${origin.top}px`,
                      "--moment-from-scale-x": String(origin.scaleX),
                      "--moment-from-scale-y": String(origin.scaleY)
                    } as CSSProperties)
                  : undefined
              }
              tabIndex={-1}
            >
              <div className="moments-expanded-frame">
                {activeItem.type === "video" ? (
                  <video
                    aria-label={activeItem.alt}
                    autoPlay
                    controls
                    key={activeItem.id}
                    muted
                    playsInline
                    poster={activeItem.poster ?? undefined}
                    preload="metadata"
                    ref={videoRef}
                  >
                    <source src={activeItem.src} type="video/mp4" />
                    {activeItem.webm ? <source src={activeItem.webm} type="video/webm" /> : null}
                  </video>
                ) : (
                  <img alt={activeItem.alt} decoding="async" src={activeItem.src} />
                )}
              </div>
              <button
                aria-label="Предыдущий материал"
                className="moments-control moments-control-prev"
                onClick={(event) => {
                  event.stopPropagation();
                  moveActive(-1);
                }}
                type="button"
              >
                ←
              </button>
              <button
                aria-label="Следующий материал"
                className="moments-control moments-control-next"
                onClick={(event) => {
                  event.stopPropagation();
                  moveActive(1);
                }}
                type="button"
              >
                →
              </button>
              <button
                aria-label="Вернуться к плитке"
                className="moments-control moments-close"
                onClick={(event) => {
                  event.stopPropagation();
                  closeItem();
                }}
                type="button"
              >
                ×
              </button>
              <span className="moments-counter">
                {activePosition} / {filteredItems.length}
              </span>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
