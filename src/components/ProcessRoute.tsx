import { useEffect, useRef, useState } from "react";

type ProductionRouteStep = {
  id: string;
  number: string;
  label: string;
  description: string;
};

type ProductionRoute = {
  title: string;
  ariaLabel: string;
  steps: ProductionRouteStep[];
};

type ProcessRouteProps = {
  route: ProductionRoute;
  tone?: "dark" | "light";
};

const desktopPositions = [
  { x: 70, y: 340 },
  { x: 230, y: 245 },
  { x: 340, y: 275 },
  { x: 455, y: 160 },
  { x: 560, y: 88 }
] as const;

const routePath =
  "M70 340 C 145 260, 185 292, 230 245 S 310 215, 340 275 S 415 220, 455 160 S 520 130, 560 88";

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

export function ProcessRoute({ route, tone = "dark" }: ProcessRouteProps) {
  const ref = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (reducedMotion) {
      setVisible(true);
      return;
    }

    const element = ref.current;
    if (!element) {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.35 }
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [reducedMotion]);

  return (
    <div
      className={`process-route process-route-${tone} ${visible ? "is-visible" : ""} ${
        reducedMotion ? "is-reduced-motion" : ""
      }`}
      ref={ref}
      aria-label={route.ariaLabel}
    >
      <div className="process-route-desktop" aria-hidden="true">
        <p className="process-route-title">{route.title}</p>
        <svg viewBox="0 0 620 420" focusable="false">
          <path
            className="process-route-base"
            d={routePath}
          />
          <path
            className="process-route-line"
            d={routePath}
          />
          {route.steps.map((step, index) => {
            const position = desktopPositions[index];

            return (
              <g
                className={`process-route-node process-route-node-${index + 1}`}
                key={step.id}
                tabIndex={0}
              >
                <circle className="process-route-node-halo" cx={position.x} cy={position.y} r="28" />
                <circle className="process-route-node-dot" cx={position.x} cy={position.y} r="16" />
                <text className="process-route-node-number" x={position.x} y={position.y + 4} textAnchor="middle">
                  {step.number}
                </text>
              </g>
            );
          })}
        </svg>
        <div className="process-route-callouts">
          {route.steps.map((step, index) => (
            <span className={`process-route-callout process-route-callout-${index + 1}`} key={step.id}>
              {step.label}
            </span>
          ))}
        </div>
      </div>
      <ol className="process-route-mobile">
        {route.steps.map((step) => (
          <li key={step.id}>
            <span>{step.number}</span>
            <div>
              <strong>{step.label}</strong>
              <p>{step.description}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
