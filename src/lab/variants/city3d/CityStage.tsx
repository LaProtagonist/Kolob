import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { StoryPoint } from "../../story";
import { planLabels } from "./plan";
import type { CityHandle, CityPoint } from "./scene";

type Props = {
  points: StoryPoint[];
  month: number;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
};

const toCityPoint = (point: StoryPoint): CityPoint => ({
  id: point.id,
  x: point.place.x,
  y: point.place.y,
  areaM2: point.areaM2,
  revenueRub: point.monthlyRevenueRub,
  base: point.isBase,
  hall: point.isBase || point.format === "with_seating",
  staffOnShift: point.staffOnShift,
  openingMonth: point.openingMonth,
});

/** Окно объёмной сцены: холст, подписи точек поверх него, кнопки камеры и пояснение цветов. */
export function CityStage({ points, month, selectedId, onSelect }: Props) {
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const city = useRef<CityHandle | null>(null);
  const latest = useRef({ points, month, selectedId, onSelect });
  const [status, setStatus] = useState<"loading" | "ready" | "failed">("loading");

  useEffect(() => {
    latest.current = { points, month, selectedId, onSelect };
  });

  useEffect(() => {
    let cancelled = false;
    // three подключается только здесь и только по требованию: в остальной сайт библиотека не попадает.
    import("./scene")
      .then(({ createCity }) => {
        if (cancelled || !stageRef.current || !canvasRef.current) return;
        const handle = createCity({ stage: stageRef.current, canvas: canvasRef.current, onSelect: (id) => latest.current.onSelect(id) });
        handle.setMonth(latest.current.month);
        handle.setPoints(latest.current.points.map(toCityPoint));
        handle.setSelected(latest.current.selectedId);
        city.current = handle;
        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setStatus("failed");
      });
    return () => {
      cancelled = true;
      city.current?.dispose();
      city.current = null;
    };
  }, []);

  useLayoutEffect(() => {
    city.current?.refreshLabels();
  }, [points, month, selectedId, status]);

  useEffect(() => {
    city.current?.setPoints(points.map(toCityPoint));
  }, [points]);

  useEffect(() => {
    city.current?.setMonth(month);
  }, [month]);

  useEffect(() => {
    city.current?.setSelected(selectedId);
  }, [selectedId]);

  return (
    <div
      className="city3d-stage"
      ref={stageRef}
      tabIndex={0}
      role="group"
      aria-label="Объёмная схема центра Петербурга с точками сети. Стрелки поворачивают камеру, плюс и минус меняют масштаб."
    >
      <canvas ref={canvasRef} className="city3d-canvas" aria-hidden="true" />

      <div className="city3d-labels">
        {planLabels.map((label) => (
          <span key={label.id} className="city3d-plan-label" data-city-label={label.id}>{label.title}</span>
        ))}
        {points.map((point) => {
          const open = point.openingMonth <= month;
          const selected = point.id === selectedId;
          return (
            <button
              key={point.id}
              type="button"
              className={`city3d-label${open ? " is-open" : " is-planned"}${selected ? " is-selected" : ""}`}
              data-city-label={point.id}
              data-point-id={point.id}
              aria-pressed={selected}
              onClick={() => onSelect(selected ? null : point.id)}
            >
              {point.title}{open ? "" : ` · М${point.openingMonth}`}
            </button>
          );
        })}
      </div>

      {status === "loading" ? <p className="city3d-status">Загружается сцена…</p> : null}
      {status === "failed" ? (
        <p className="city3d-status">Объёмная сцена не запустилась на этом устройстве. Карточки точек, шкала времени и графики работают.</p>
      ) : null}

      <div className="city3d-tools" data-city-control data-city-reserved>
        <button type="button" onClick={() => city.current?.zoomBy(0.78)} aria-label="Приблизить" title="Приблизить">+</button>
        <button type="button" onClick={() => city.current?.zoomBy(1 / 0.78)} aria-label="Отдалить" title="Отдалить">−</button>
        <button type="button" onClick={() => city.current?.tilt()} aria-label="Изменить наклон камеры" title="Наклон камеры">
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M4 18h16M6 18 17 6" />
            <path d="M12.5 18a7 7 0 0 0-2-4.4" />
          </svg>
        </button>
        <button type="button" onClick={() => city.current?.resetView()} aria-label="Вернуть исходный вид" title="Исходный вид">
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5.2 13.5a7 7 0 1 0 1.6-7.2" />
            <path d="M5.5 3.8v3.4h3.4" />
          </svg>
        </button>
      </div>

      <p className="city3d-hint" data-city-reserved>Потяните — поворот, щипок или кнопки — масштаб</p>

      <div className="city3d-legend" data-city-reserved>
        <span><i className="is-hall" />с залом</span>
        <span><i className="is-takeaway" />на вынос</span>
        <span><i className="is-lot" />участок до открытия</span>
        <em>Высота здания — выручка точки в месяц</em>
      </div>
    </div>
  );
}
