import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { formatMonth } from "../format";
import { useCamera, type Camera } from "./camera";
import { mapCredit, mapCreditUrl } from "./geo/geo";

/** Насколько близко камера: «город целиком», «район», «улица». */
export type ZoomLevel = "far" | "mid" | "near";

type Props = {
  className: string;
  label: string;
  /** Нарисованный участок: за его край камера не уходит. */
  world: Camera;
  /** Кадр «город целиком». */
  home: Camera;
  /** Ширина самого ближнего кадра. */
  closeW: number;
  aspect: number;
  /** Куда подлететь: выбранная точка сети. */
  focus: { x: number; y: number } | null;
  month: number;
  calendarMonth: number;
  playing: boolean;
  onToggle: () => void;
  onBackground: () => void;
  /** Камера остановилась: кадр для варианта (что видно — то и дорисовывать подробно). */
  onView?: (view: Camera) => void;
  defs?: ReactNode;
  children: ReactNode;
  /**
   * Верхний слой: то, что движется или меняется по месяцам (точки, лодки, облака). Он лежит
   * отдельной картинкой поверх неподвижного города, и его анимация не перерисовывает город.
   */
  overlay?: ReactNode;
};

export const levelOf = (view: Camera, home: Camera): ZoomLevel => {
  const k = view.w / home.w;
  return k > 0.6 ? "far" : k > 0.27 ? "mid" : "near";
};

/**
 * Рамка карты для вариантов лаборатории: камера, кнопки «пуск» и масштаба, подпись OpenStreetMap.
 * Уровень масштаба стоит в data-zoom: по нему стиль варианта плавно показывает и прячет подробности.
 */
export function MapShell({ className, label, world, home, closeW, aspect, focus, month, calendarMonth, playing, onToggle, onBackground, onView, defs, children, overlay }: Props) {
  const surface = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const top = useRef<SVGSVGElement>(null);
  const [zoom, setZoom] = useState<ZoomLevel>("far");
  const viewHandler = useRef(onView);
  viewHandler.current = onView;
  const onSettle = useCallback((view: Camera) => {
    setZoom(levelOf(view, home));
    viewHandler.current?.({ ...view });
  }, [home]);
  const { view, flyTo, flyHome } = useCamera({ surface, layers: [svg, top], world, home, closeW, aspect, onSettle });

  const focusKey = focus ? `${Math.round(focus.x)}:${Math.round(focus.y)}` : "";
  const focusRef = useRef(focus);
  focusRef.current = focus;
  useEffect(() => {
    const target = focusRef.current;
    if (!target) return;
    flyTo({ cx: target.x, cy: target.y, w: Math.min(view.current.w, home.w * 0.42) });
  }, [focusKey, flyTo, home.w, view]);

  const zoomBy = (factor: number) => {
    const current = view.current;
    flyTo({ cx: current.x + current.w / 2, cy: current.y + current.h / 2, w: current.w * factor });
  };

  return (
    <div className={`lab-map ${className}`} ref={surface} data-zoom={zoom}>
      <svg
        ref={svg}
        className="lab-map-svg"
        viewBox={`${home.x} ${home.y} ${home.w} ${home.h}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={label}
      >
        {defs ? <defs>{defs}</defs> : null}
        <rect className="lab-map-hit" x={home.x - home.w} y={home.y - home.h} width={home.w * 3} height={home.h * 3} onClick={onBackground} />
        {children}
      </svg>
      <svg
        ref={top}
        className="lab-map-svg is-overlay"
        viewBox={`${home.x} ${home.y} ${home.w} ${home.h}`}
        preserveAspectRatio="xMidYMid meet"
        aria-hidden={overlay ? undefined : true}
      >
        {overlay}
      </svg>
      <div className="lab-map-hud">
        <button className="lab-map-play" type="button" onClick={onToggle} aria-label={playing ? "Пауза" : "Запустить время"}>
          {playing ? "❚❚" : "▶"}
        </button>
        <span className="lab-map-month">{formatMonth(month, calendarMonth)}</span>
      </div>
      <div className="lab-map-zoom" role="group" aria-label="Масштаб карты">
        <button type="button" onClick={() => zoomBy(0.5)} aria-label="Приблизить">+</button>
        <button type="button" onClick={() => zoomBy(2)} aria-label="Отдалить">−</button>
        <button type="button" onClick={flyHome} aria-label="Весь город">◎</button>
      </div>
      <a className="lab-map-credit" href={mapCreditUrl} target="_blank" rel="noopener noreferrer">{mapCredit}</a>
    </div>
  );
}
