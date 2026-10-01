/**
 * Камера над городом: приближение и сдвиг колесом, щипком, перетаскиванием и кнопками.
 * Кадр меняется прямо в атрибуте viewBox, без перерисовки React; React узнаёт о кадре,
 * только когда камера остановилась (и изредка по ходу движения), — чтобы решить, где показывать людей.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import type { Camera } from "./city";

/** Куда смотреть: центр кадра и его ширина в единицах рисунка. */
export type CameraTarget = { cx: number; cy: number; w: number };

type Options = {
  /** Рамка карты: принимает жесты, ей задаётся, кому отдавать жест пальцем — странице или карте. */
  surface: RefObject<HTMLElement | null>;
  /** Слои картинки — город и верхний слой с людьми и табличками: смотрят одним кадром. */
  layers: Array<RefObject<SVGSVGElement | null>>;
  /** Нарисованный участок города: за его край камера не уходит. */
  world: Camera;
  /** Кадр «сеть целиком» — самый дальний. */
  home: Camera;
  /** Ширина кадра «одна точка вблизи» — самого ближнего. */
  closeW: number;
  aspect: number;
  /** Камера остановилась (или движется дольше 200 мс): текущий кадр. */
  onSettle: (view: Camera) => void;
};

const FLY_MS = 650;
const DRAG_START_PX = 6;
// Колесо, пока страница ещё прокручивается, отдаётся странице: иначе карта перехватит прокрутку на лету.
const PAGE_SCROLL_GRACE_MS = 400;

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const stillness = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function useCamera({ surface, layers, world, home, closeW, aspect, onSettle }: Options) {
  const view = useRef<Camera>(home);
  const limits = useRef({ world, home, closeW, aspect });
  limits.current = { world, home, closeW, aspect };
  const settleHandler = useRef(onSettle);
  settleHandler.current = onSettle;
  const layerRefs = useRef(layers);
  layerRefs.current = layers;
  const flight = useRef(0);
  const settleTimer = useRef(0);
  const lastSettle = useRef(0);

  /**
   * Кадр в пределах: не ближе «одной точки», не дальше «сети целиком», не за краем города.
   * Чем дальше камера, тем ближе пределы сдвига к кадру сети: отдалённая до конца камера всегда видит всю сеть.
   */
  const fit = useCallback((target: CameraTarget): Camera => {
    const { world, home: wide, closeW: narrow, aspect: ratio } = limits.current;
    const w = Math.min(wide.w, Math.max(narrow, target.w));
    const h = w / ratio;
    const t = Math.min(1, Math.max(0, (wide.w - w) / Math.max(wide.w - narrow, 1)));
    const mix = (from: number, to: number) => from + (to - from) * t;
    const bounds = { x: mix(wide.x, world.x), y: mix(wide.y, world.y), w: mix(wide.w, world.w), h: mix(wide.h, world.h) };
    const along = (center: number, size: number, start: number, length: number) =>
      size >= length ? start + length / 2 - size / 2 : Math.min(start + length - size, Math.max(start, center - size / 2));
    return { x: along(target.cx, w, bounds.x, bounds.w), y: along(target.cy, h, bounds.y, bounds.h), w, h };
  }, []);

  const settleNow = useCallback(() => {
    window.clearTimeout(settleTimer.current);
    lastSettle.current = performance.now();
    settleHandler.current(view.current);
  }, []);

  /** Сообщить о кадре после паузы в движении, а по ходу движения — не чаще раза в 200 мс. */
  const settleSoon = useCallback(() => {
    window.clearTimeout(settleTimer.current);
    if (performance.now() - lastSettle.current > 200) settleNow();
    settleTimer.current = window.setTimeout(settleNow, 140);
  }, [settleNow]);

  const draw = useCallback((next: Camera) => {
    view.current = next;
    const box = `${next.x.toFixed(1)} ${next.y.toFixed(1)} ${next.w.toFixed(1)} ${next.h.toFixed(1)}`;
    for (const layer of layerRefs.current) layer.current?.setAttribute("viewBox", box);
    const element = surface.current;
    if (!element) return;
    // В кадре «сеть целиком» вертикальный жест пальцем прокручивает страницу; приближенную карту палец двигает.
    const zoomed = next.w < limits.current.home.w - 1;
    element.style.touchAction = zoomed ? "none" : "pan-y";
    element.classList.toggle("is-zoomed", zoomed);
  }, [surface]);

  const stopFlight = useCallback(() => cancelAnimationFrame(flight.current), []);

  const center = (camera: Camera): CameraTarget => ({ cx: camera.x + camera.w / 2, cy: camera.y + camera.h / 2, w: camera.w });

  const flyTo = useCallback((target: CameraTarget) => {
    stopFlight();
    const from = center(view.current);
    const to = center(fit(target));
    if (stillness()) {
      draw(fit(to));
      settleNow();
      return;
    }
    const started = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - started) / FLY_MS);
      const k = ease(t);
      // Ширина меняется в разах, а не на столько-то единиц: приближение выглядит равномерным.
      draw(fit({ cx: from.cx + (to.cx - from.cx) * k, cy: from.cy + (to.cy - from.cy) * k, w: from.w * (to.w / from.w) ** k }));
      if (t < 1) flight.current = requestAnimationFrame(step);
      else settleNow();
    };
    flight.current = requestAnimationFrame(step);
  }, [draw, fit, settleNow, stopFlight]);

  const flyHome = useCallback(() => flyTo(center(limits.current.home)), [flyTo]);

  // Первый кадр и смена пропорций (узкий ↔ широкий экран): сразу «сеть целиком», без полёта.
  useLayoutEffect(() => {
    stopFlight();
    draw(limits.current.home);
    settleNow();
  }, [aspect, draw, settleNow, stopFlight]);

  useEffect(() => {
    const element = surface.current;
    if (!element) return;
    let pageScrolledAt = -Infinity;
    const pointers = new Map<number, { x: number; y: number }>();
    let dragStart: { x: number; y: number } | null = null;
    let dragging = false;
    let pinch: { distance: number; x: number; y: number } | null = null;
    let swallowClick = false;

    /** Приблизить в factor раз вокруг точки экрана (px, py — пиксели от левого верхнего угла карты). */
    const zoomAround = (factor: number, px: number, py: number) => {
      const box = element.getBoundingClientRect();
      const current = view.current;
      const ux = current.x + (px / box.width) * current.w;
      const uy = current.y + (py / box.height) * current.h;
      const probe = fit({ cx: 0, cy: 0, w: current.w * factor });
      const w = probe.w;
      const h = probe.h;
      return fit({ cx: ux - (px / box.width) * w + w / 2, cy: uy - (py / box.height) * h + h / 2, w });
    };
    const panBy = (dxPx: number, dyPx: number) => {
      const box = element.getBoundingClientRect();
      const current = view.current;
      return fit({ cx: current.x + current.w / 2 + (dxPx / box.width) * current.w, cy: current.y + current.h / 2 + (dyPx / box.height) * current.h, w: current.w });
    };
    const moved = (left: Camera, right: Camera) => Math.abs(left.x - right.x) > 0.05 || Math.abs(left.y - right.y) > 0.05 || Math.abs(left.w - right.w) > 0.05;

    const onPageScroll = () => {
      pageScrolledAt = performance.now();
    };

    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && performance.now() - pageScrolledAt < PAGE_SCROLL_GRACE_MS) return;
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 400 : 1;
      const dx = event.deltaX * unit;
      const dy = event.deltaY * unit;
      const box = element.getBoundingClientRect();
      let next: Camera;
      if (!event.ctrlKey && (event.shiftKey || Math.abs(dx) > Math.abs(dy))) {
        // Сдвиг: колесо с Shift или горизонтальная прокрутка тачпада.
        next = event.shiftKey && !dx ? panBy(dy, 0) : panBy(dx, dy);
      } else {
        // Щипок на тачпаде приходит колесом с Ctrl и мелкими шагами — для него шаг крупнее.
        next = zoomAround(Math.exp(dy * (event.ctrlKey ? 0.012 : 0.0022)), event.clientX - box.left, event.clientY - box.top);
      }
      // Дальше некуда — колесо прокручивает страницу.
      if (!moved(view.current, next)) return;
      event.preventDefault();
      stopFlight();
      draw(next);
      settleSoon();
    };

    // Кнопки поверх карты («пуск», «+», «−») жестом камеры не считаются.
    const onControl = (event: Event) => event.target instanceof Element && Boolean(event.target.closest("button"));

    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      if (onControl(event)) return;
      swallowClick = false;
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pointers.size === 1) {
        dragStart = { x: event.clientX, y: event.clientY };
        dragging = false;
      } else if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinch = { distance: Math.hypot(a.x - b.x, a.y - b.y), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        dragging = true;
        stopFlight();
      }
    };

    const onPointerMove = (event: PointerEvent) => {
      const previous = pointers.get(event.pointerId);
      if (!previous) return;
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pointers.size === 1 && dragStart) {
        if (!dragging && Math.hypot(event.clientX - dragStart.x, event.clientY - dragStart.y) > DRAG_START_PX) {
          dragging = true;
          stopFlight();
          element.setPointerCapture(event.pointerId);
          element.classList.add("is-dragging");
        }
        if (!dragging) return;
        const next = panBy(previous.x - event.clientX, previous.y - event.clientY);
        if (moved(view.current, next)) {
          draw(next);
          settleSoon();
        }
      } else if (pointers.size === 2 && pinch) {
        const [a, b] = [...pointers.values()];
        const now = { distance: Math.hypot(a.x - b.x, a.y - b.y), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const box = element.getBoundingClientRect();
        draw(zoomAround(pinch.distance / Math.max(now.distance, 1), now.x - box.left, now.y - box.top));
        draw(panBy(pinch.x - now.x, pinch.y - now.y));
        pinch = now;
        settleSoon();
      }
    };

    const onPointerEnd = (event: PointerEvent) => {
      if (!pointers.delete(event.pointerId)) return;
      if (pointers.size < 2) pinch = null;
      if (pointers.size === 1) {
        const [rest] = [...pointers.values()];
        dragStart = rest;
      }
      if (pointers.size === 0) {
        // Нажатие, которое закончило перетаскивание, — не выбор здания.
        swallowClick = dragging;
        dragging = false;
        dragStart = null;
        element.classList.remove("is-dragging");
        settleNow();
      }
    };

    const onClickCapture = (event: MouseEvent) => {
      if (!swallowClick) return;
      swallowClick = false;
      event.stopPropagation();
      event.preventDefault();
    };

    window.addEventListener("scroll", onPageScroll, { passive: true });
    element.addEventListener("wheel", onWheel, { passive: false });
    element.addEventListener("pointerdown", onPointerDown);
    element.addEventListener("pointermove", onPointerMove);
    element.addEventListener("pointerup", onPointerEnd);
    element.addEventListener("pointercancel", onPointerEnd);
    element.addEventListener("click", onClickCapture, true);
    return () => {
      window.removeEventListener("scroll", onPageScroll);
      element.removeEventListener("wheel", onWheel);
      element.removeEventListener("pointerdown", onPointerDown);
      element.removeEventListener("pointermove", onPointerMove);
      element.removeEventListener("pointerup", onPointerEnd);
      element.removeEventListener("pointercancel", onPointerEnd);
      element.removeEventListener("click", onClickCapture, true);
      window.clearTimeout(settleTimer.current);
      stopFlight();
    };
  }, [draw, fit, settleNow, settleSoon, stopFlight, surface]);

  return { view, flyTo, flyHome };
}
