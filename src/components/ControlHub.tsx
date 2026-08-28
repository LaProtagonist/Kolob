import { CapexConfiguratorPage } from "./CapexConfigurator";
import { ParticipationWorkbench } from "./InvestorEconomicsPanel";
import type { ReactNode } from "react";

type ControlRoute = "home" | "capex" | "participation" | "requests";

const links: Array<{ id: ControlRoute; href: string; label: string }> = [
  { id: "home", href: "/control", label: "Обзор" },
  { id: "capex", href: "/control/capex", label: "CAPEX" },
  { id: "participation", href: "/control/participation", label: "Условия участия" },
  { id: "requests", href: "/control/requests", label: "Обращения" },
];

function ControlShell({ active, title, children }: { active: ControlRoute; title: string; children: ReactNode }) {
  return <main className="control-page"><header className="control-header"><div><p>Внутренняя зона</p><h1>{title}</h1></div><nav aria-label="Управление">{links.map((link) => <a key={link.id} className={active === link.id ? "is-active" : ""} href={link.href}>{link.label}</a>)}</nav></header>{children}</main>;
}

export function ControlHomePage() {
  return <ControlShell active="home" title="Управление проектом"><section className="control-grid"><a href="/control/capex"><p>Финансы</p><h2>CAPEX и оборудование</h2><span>Комплектация, оборудование, конфигурации, цены и источники.</span></a><a href="/control/participation"><p>Финансы</p><h2>Условия участия</h2><span>Конструктор сценариев, чувствительность, водопады и сравнение.</span></a><a href="/control/requests"><p>Инвесторы</p><h2>Обращения</h2><span>Статус защищённого канала заявок «Обсудить участие».</span></a></section></ControlShell>;
}

export function ControlCapexPage() {
  return <ControlShell active="capex" title="CAPEX и оборудование"><CapexConfiguratorPage /></ControlShell>;
}

export function ControlParticipationPage() {
  return <ControlShell active="participation" title="Конструктор условий участия"><p className="control-note">Рабочие параметры не меняют опубликованные сценарии участия.</p><ParticipationWorkbench /></ControlShell>;
}

export function ControlRequestsPage() {
  return <ControlShell active="requests" title="Обращения"><section className="control-status"><h2>Текущий канал обращений</h2><p>Форма «Обсудить участие» отправляет данные через <code>POST /api/contact</code> в защищённый contact server. Сервер сохраняет заявки в JSONL и предоставляет защищённое cookie-auth read-only представление <code>/leads</code> и CSV.</p><p>У SPA нет безопасного server-side proxy к этому хранилищу, поэтому здесь намеренно не выводятся персональные данные и не создаётся фиктивная история заявок.</p><p>Для production-интеграции требуется reverse-proxy mapping control route к contact server с существующей server-side auth.</p></section></ControlShell>;
}
