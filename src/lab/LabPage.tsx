import { Suspense } from "react";
import { useNetworkStory } from "./useNetworkStory";
import { variantComponents, variants } from "./variants/index";
import "./lab.css";

function VariantStage({ id }: { id: string }) {
  const props = useNetworkStory();
  const Component = variantComponents[id];
  return (
    <Suspense fallback={<p className="lab-loading">Загружается вариант…</p>}>
      <Component {...props} />
    </Suspense>
  );
}

/**
 * Лаборатория визуализаций сети. Страницы открываются только по прямой ссылке:
 * их нет в меню и в карте сайта, поисковикам они закрыты.
 */
export function LabPage({ path }: { path: string }) {
  const id = path.replace(/^\/lab\/?/, "");
  const current = variants.find((variant) => variant.id === id);
  return (
    <div className="lab-page" data-testid="lab-page">
      <header className="lab-header">
        <p className="lab-eyebrow">Лаборатория · рабочие варианты</p>
        <h1>{current ? current.title : "Визуализация сети"}</h1>
        <p>{current ? current.summary : "Один расчёт — несколько способов его показать. Цифры общие с калькулятором инвестора и таблицей вводных."}</p>
        <nav className="lab-nav" aria-label="Варианты визуализации">
          {variants.map((variant) => (
            <a key={variant.id} href={`/lab/${variant.id}`} className={variant.id === id ? "is-current" : ""}>{variant.title}</a>
          ))}
          <a href="/investor-terminal">Калькулятор</a>
        </nav>
      </header>
      {current ? (
        <VariantStage id={current.id} />
      ) : (
        <div className="lab-index">
          {variants.map((variant) => (
            <a key={variant.id} className="lab-index-card" href={`/lab/${variant.id}`}>
              <strong>{variant.title}</strong>
              <span>{variant.summary}</span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
