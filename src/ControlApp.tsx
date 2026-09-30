import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { ThemeToggle } from "./components/ThemeToggle";
import { InvestorConfigurationProvider } from "./components/InvestorConfigurationProvider";

const FranchiseModelPage = lazy(() => import("./components/FranchiseModel").then((module) => ({ default: module.FranchiseModelPage })));

const CapexConfiguratorPage = lazy(() => import("./components/CapexConfigurator").then((module) => ({ default: module.CapexConfiguratorPage })));
const LaunchBudgetPage = lazy(() => import("./components/LaunchBudget").then((module) => ({ default: module.LaunchBudgetPage })));
const RevenueModelPage = lazy(() => import("./components/RevenueModel").then((module) => ({ default: module.RevenueModelPage })));
const EconomicsPage = lazy(() => import("./components/Economics").then((module) => ({ default: module.EconomicsPage })));
const FranchisePlatformPage = lazy(() => import("./components/FranchisePlatform").then((module) => ({ default: module.FranchisePlatformPage })));

const controlLinks = [
  { href: "/control", label: "Control" },
  { href: "/control/franchise-model", label: "Модель сети и франшизы" },
  { href: "/control/franchise-platform", label: "Franchise Platform" },
  { href: "/control/capex", label: "CAPEX" },
  { href: "/control/launch-budget", label: "Launch Budget" },
  { href: "/control/revenue", label: "Revenue" },
  { href: "/control/economics", label: "Economics" },
] as const;

function normalizePath(pathname: string) {
  return pathname === "" ? "/control" : pathname.replace(/\/+$/, "") || "/control";
}

function Loading() {
  return <main className="plain-page"><div className="section-inner"><p>Загружается внутренний инструмент…</p></div></main>;
}

function ControlHub() {
  const internalTools = [
    { href: "/control/franchise-model", title: "Модель сети и франшизы", text: "Рабочие сценарии первого узла, франчайзи, HeadCo и инвестора." },
    { href: "/control/franchise-platform", title: "Стратегия франчайзинговой платформы", text: "Общая стратегическая архитектура, сценарии и параметры масштабирования." },
    { href: "/control/capex", title: "CAPEX-конфигуратор", text: "Рабочая конфигурация оборудования и модулей точки." },
    { href: "/control/launch-budget", title: "Расчёт стоимости запуска", text: "Подготовка бюджета запуска и параметров помещения." },
    { href: "/control/revenue", title: "Модель выручки", text: "Расчёт структуры продаж и производственной нагрузки." },
    { href: "/control/economics", title: "Экономика объекта", text: "Детальная рабочая модель экономики объекта." },
    { href: "/leads", title: "Заявки", text: "Защищённый backend-контур обращений с сайта." },
  ];
  return (
    <main className="control-hub" aria-labelledby="control-title">
      <section className="control-hub-hero">
        <p>Внутреннее рабочее пространство</p>
        <h1 id="control-title">Control</h1>
        <span>Стратегические и расчётные инструменты проекта.</span>
      </section>
      <section className="control-tool-grid" aria-label="Внутренние инструменты">
        {internalTools.map((tool) => <a key={tool.href} href={tool.href}><h2>{tool.title}</h2><p>{tool.text}</p><span>Открыть →</span></a>)}
      </section>
      <section className="control-external-links" aria-label="Внешние ссылки">
        <strong>Внешние представления</strong>
        <div><a href="/investor-terminal">Investor Terminal</a><a href="/">Публичный сайт</a></div>
      </section>
    </main>
  );
}

function renderControlPage(path: string) {
  switch (path) {
    case "/control": return <ControlHub />;
    case "/control/franchise-model": return <Suspense fallback={<Loading />}><FranchiseModelPage /></Suspense>;
    case "/control/franchise-platform": return <Suspense fallback={<Loading />}><FranchisePlatformPage /></Suspense>;
    case "/control/capex": return <Suspense fallback={<Loading />}><CapexConfiguratorPage /></Suspense>;
    case "/control/launch-budget": return <Suspense fallback={<Loading />}><LaunchBudgetPage /></Suspense>;
    case "/control/revenue": return <Suspense fallback={<Loading />}><RevenueModelPage /></Suspense>;
    case "/control/economics": return <Suspense fallback={<Loading />}><EconomicsPage /></Suspense>;
    default: return <ControlHub />;
  }
}

export default function ControlApp() {
  const [path, setPath] = useState(() => normalizePath(window.location.pathname));
  const [desktopNavigation, setDesktopNavigation] = useState(() => window.matchMedia("(min-width: 780px)").matches);
  const active = useMemo(() => controlLinks.find((item) => item.href === path)?.href ?? "/control", [path]);

  useEffect(() => {
    const onPopState = () => setPath(normalizePath(window.location.pathname));
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 780px)");
    const onChange = () => setDesktopNavigation(media.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  const shell = (
      <div className="control-shell">
        <header className="control-header">
          <a className="control-brand" href="/control">{path === "/control/franchise-model" ? "Управление" : "Control"} <span>Колобочная</span></a>
          <ThemeToggle />
          <details className="control-navigation" open={desktopNavigation || undefined}>
            <summary aria-label={path === "/control/franchise-model" ? "Навигация рабочего пространства" : "Навигация Control"}>Разделы</summary>
            <nav aria-label={path === "/control/franchise-model" ? "Навигация рабочего пространства" : "Навигация Control"}>
              {controlLinks.map((link, i) => <a key={link.href} href={link.href} aria-current={active === link.href ? "page" : undefined}>{path === "/control/franchise-model" ? ["Управление", "Модель сети и франшизы", "Стратегия франшизы", "Инвестиции в запуск", "Бюджет запуска", "Выручка", "Экономика"][i] : link.label}</a>)}
              <a href="/leads">{path === "/control/franchise-model" ? "Заявки" : "Leads"}</a>
              <a className="control-logout" href="/control/logout">Выйти</a>
            </nav>
          </details>
        </header>
        {renderControlPage(path)}
      </div>
  );
  return path === "/control/franchise-model" ? shell : <InvestorConfigurationProvider>{shell}</InvestorConfigurationProvider>;
}
