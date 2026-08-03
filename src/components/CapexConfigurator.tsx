import { useEffect, useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import rawCapexData from "../content/capex-configurator-data.json";
import "./CapexConfigurator.css";

type ScenarioId = "minimum" | "base" | "scale_ready";
type CapexData = typeof rawCapexData;
type CapexItem = CapexData["items"][number];
type CapexModule = CapexData["modules"][number];
type ModuleLink = CapexData["moduleItems"][number];
type ScenarioPrice = NonNullable<CapexItem["scenarios"]["base"]>;
type NumericParameterKey = "outletCount" | "checksPerOutlet" | "shiftCount" | "fillingCount" | "cashierPostCount" | "hotKitchenPostCount" | "kdsPostCount" | "seatCount" | "guestAreaM2" | "serviceStationCount";
type Parameters = Record<NumericParameterKey, number | null> & {
  alcoholEnabled: boolean;
  sharedSeating: boolean;
  reusableTableware: boolean;
  centralSupply: boolean;
  mobileFormat: boolean;
};

type ComputedRow = {
  item: CapexItem;
  links: ModuleLink[];
  moduleIds: string[];
  primaryModuleId: string;
  requirement: string;
  quantity: number | null;
  quantityStatus: string;
  quantityRule: string;
  price: ScenarioPrice | null;
  unitPrice: number | null;
  lineTotal: number | null;
  independentProcurement: boolean;
  includedInParent: boolean;
  quoteRequired: boolean;
  sourceInclusion: string;
};

const capexData = rawCapexData as CapexData;
const scenarioIds: ScenarioId[] = ["minimum", "base", "scale_ready"];
const statusLabels: Record<string, string> = {
  research: "Исследование",
  required: "Обязательно",
  optional: "Опционально",
  conditional: "Зависит от формата",
  not_started: "Не сформировано",
  tbd: "Требует уточнения",
  quote_required: "Требуется КП",
  researched: "Есть ценовой ориентир",
  included_in_parent: "Входит в комплект",
  standalone: "Самостоятельная позиция",
  purchased_separately: "Покупается отдельно",
  active_catalog: "Активный каталог",
  equipment: "Оборудование",
  system: "Система",
  component: "Компонент",
  accessory: "Аксессуар",
  inventory: "Инвентарь",
  furniture: "Мебель",
  engineering_connection: "Инженерное подключение",
  installation_service: "Монтажная услуга",
  consumable: "Расходный материал",
  software: "Программное обеспечение",
  open_question: "Открытый вопрос",
  high: "Высокая",
  medium: "Средняя",
  low: "Низкая",
  structured: "Структурировано",
  not_created: "Не создан",
  fixed: "Фиксированное количество",
  manual: "Ручной расчёт",
  per_seat: "На посадочное место",
  per_guest_area_m2: "На м² гостевой площади",
  per_workstation: "На рабочее место",
  per_cashier_post: "На кассовый пост",
  per_hot_kitchen_post: "На горячий рабочий пост",
  per_filling: "На начинку",
  per_station: "На станцию",
};
const requirementRank: Record<string, number> = { required: 4, conditional: 3, optional: 2, tbd: 1 };
const rubFormatter = new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 2 });
const numberFormatter = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 });
const percentFormatter = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });
const dateFormatter = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" });

function formatRub(value: number | null) { return value === null ? "Не рассчитано" : rubFormatter.format(value); }
function formatNumber(value: number | null) { return value === null ? "—" : numberFormatter.format(value); }
function label(value: string | null | undefined) { return value ? statusLabels[value] ?? value : "Не указано"; }
function ruleLabel(value: string) { return value.split(" + ").map(part => label(part)).join(" + "); }
function checkedDate(value: string | null | undefined) { return value ? dateFormatter.format(new Date(value)) : "не указана"; }
function scenarioPrice(item: CapexItem, scenario: ScenarioId): ScenarioPrice | null { return item.scenarios[scenario] as ScenarioPrice | null; }
function classToken(value: string) { return value.toLowerCase().replace(/[^a-z0-9]+/g, "-"); }

function driverForRule(rule: string, parameters: Parameters) {
  if (rule === "per_seat") return parameters.seatCount;
  if (rule === "per_guest_area_m2") return parameters.guestAreaM2;
  if (rule === "per_workstation" || rule === "per_hot_kitchen_post") return parameters.hotKitchenPostCount;
  if (rule === "per_cashier_post") return parameters.cashierPostCount;
  if (rule === "per_filling") return parameters.fillingCount;
  if (rule === "per_station") return parameters.serviceStationCount;
  return null;
}

function computedFromLinks(links: ModuleLink[], parameters: Parameters) {
  const calculated = links.map(link => {
    if (link.quantityRuleType === "fixed" && link.quantityRuleValue !== null) return { value: link.quantityRuleValue, link };
    const driver = driverForRule(link.quantityRuleType, parameters);
    if (driver !== null && link.quantityRuleValue !== null) return { value: driver * link.quantityRuleValue, link };
    return { value: null, link };
  });
  const known = calculated.filter(entry => entry.value !== null) as Array<{ value: number; link: ModuleLink }>;
  if (!known.length) return { quantity: null, rule: links.map(link => link.quantityRuleType).join(" + ") || "tbd" };
  if (links.some(link => link.aggregationRule === "manual")) return { quantity: null, rule: "manual" };
  if (links.some(link => link.aggregationRule === "sum")) return { quantity: known.reduce((sum, entry) => sum + entry.value, 0), rule: known.map(entry => entry.link.quantityRuleType).join(" + ") };
  if (links.some(link => link.aggregationRule === "max")) return { quantity: Math.max(...known.map(entry => entry.value)), rule: "max" };
  return { quantity: known[0].value, rule: known[0].link.quantityRuleType };
}

function buildRows(activeModuleIds: Set<string>, scenario: ScenarioId, parameters: Parameters): ComputedRow[] {
  const itemById = new Map(capexData.items.map(item => [item.id, item]));
  const linksByItem = new Map<string, ModuleLink[]>();
  for (const link of capexData.moduleItems) {
    if (!activeModuleIds.has(link.moduleId)) continue;
    linksByItem.set(link.itemId, [...(linksByItem.get(link.itemId) ?? []), link]);
  }
  return [...linksByItem.entries()].map(([itemId, links]) => {
    const item = itemById.get(itemId)!;
    const price = scenarioPrice(item, scenario);
    const rules = computedFromLinks(links, parameters);
    const parameterDriven = links.some(link => link.quantityRuleType.startsWith("per_") && driverForRule(link.quantityRuleType, parameters) !== null && link.quantityRuleValue !== null);
    const quantity = parameterDriven ? rules.quantity : price?.quantity ?? rules.quantity;
    const includedInParent = item.inclusionStatus === "included_in_parent" || item.recordType === "component";
    const independentProcurement = ["standalone", "purchased_separately"].includes(item.inclusionStatus) && !["component", "engineering_connection", "open_question"].includes(item.recordType);
    const unitPrice = price?.unitPriceRub ?? null;
    const lineTotal = includedInParent || unitPrice === null || quantity === null || quantity <= 0 ? null : Math.round(unitPrice * quantity * 100) / 100;
    const requirement = [...links].sort((a, b) => (requirementRank[b.defaultRequirement] ?? 0) - (requirementRank[a.defaultRequirement] ?? 0))[0]?.defaultRequirement ?? item.requirement;
    return {
      item,
      links,
      moduleIds: [...new Set(links.map(link => link.moduleId))],
      primaryModuleId: links[0]?.moduleId ?? item.linkedModuleIds[0] ?? item.sourceModuleId,
      requirement,
      quantity,
      quantityStatus: quantity === null ? "Требует расчёта производительности" : quantity === 0 ? "Не входит в сценарий" : "Рассчитано по данным",
      quantityRule: parameterDriven ? rules.rule : price ? `Сценарий: ${capexData.scenarios.find(entry => entry.id === scenario)?.label ?? scenario}` : rules.rule,
      price,
      unitPrice,
      lineTotal,
      independentProcurement,
      includedInParent,
      quoteRequired: item.quoteStatus === "quote_required" || item.priceResearch?.quoteStatus === "quote_required",
      sourceInclusion: links.map(link => `${link.moduleId}: ${label(link.defaultRequirement)}`).join("; "),
    };
  }).sort((a, b) => a.item.id.localeCompare(b.item.id));
}

function NumberStepper({ labelText, value, onChange, hint, min = 0 }: { labelText: string; value: number | null; onChange: (value: number | null) => void; hint?: string; min?: number }) {
  return (
    <label className="capex-field">
      <span>{labelText}</span>
      <div className="capex-stepper">
        <button type="button" aria-label={`Уменьшить: ${labelText}`} disabled={value === null || value <= min} onClick={() => onChange(Math.max(min, (value ?? min) - 1))}>−</button>
        <input aria-label={labelText} type="number" min={min} value={value ?? ""} placeholder="—" onChange={event => onChange(event.target.value === "" ? null : Number(event.target.value))} />
        <button type="button" aria-label={`Увеличить: ${labelText}`} onClick={() => onChange((value ?? min) + 1)}>+</button>
      </div>
      {hint ? <small>{hint}</small> : null}
    </label>
  );
}

function Toggle({ checked, disabled, onChange, children, hint }: { checked: boolean; disabled?: boolean; onChange: () => void; children: ReactNode; hint?: string }) {
  return (
    <button type="button" className={`capex-switch${checked ? " is-on" : ""}`} role="switch" aria-checked={checked} disabled={disabled} onClick={onChange}>
      <span className="capex-switch-track" aria-hidden="true"><i /></span>
      <span><strong>{children}</strong>{hint ? <small>{hint}</small> : null}</span>
    </button>
  );
}

function MetricCard({ title, value, detail, tone = "default" }: { title: string; value: string; detail: string; tone?: "default" | "warning" | "dark" }) {
  return <article className={`capex-metric capex-metric-${tone}`}><span>{title}</span><strong>{value}</strong><p>{detail}</p></article>;
}

function CostBar({ value, max, labelText, detail, index = 0 }: { value: number; max: number; labelText: string; detail?: string; index?: number }) {
  const width = max > 0 ? Math.max(1, (value / max) * 100) : 0;
  return (
    <div className="capex-chart-row">
      <div><span>{labelText}</span><strong>{formatRub(value)}</strong></div>
      <div className="capex-chart-track" aria-hidden="true"><i className={`tone-${index % 6}`} style={{ "--bar-width": `${width}%` } as CSSProperties} /></div>
      {detail ? <small>{detail}</small> : null}
    </div>
  );
}

export function CapexConfiguratorPage() {
  const [formatId, setFormatId] = useState("FMT-INTEGRATED");
  const [scenarioId, setScenarioId] = useState<ScenarioId>("base");
  const [selectedModuleIds, setSelectedModuleIds] = useState<string[]>([]);
  const [parameters, setParameters] = useState<Parameters>({
    outletCount: capexData.businessCapacity.prep_outlet_count,
    checksPerOutlet: capexData.businessCapacity.checks_per_outlet_per_day,
    shiftCount: null,
    fillingCount: null,
    cashierPostCount: null,
    hotKitchenPostCount: null,
    kdsPostCount: null,
    seatCount: null,
    guestAreaM2: null,
    serviceStationCount: null,
    alcoholEnabled: false,
    sharedSeating: false,
    reusableTableware: false,
    centralSupply: false,
    mobileFormat: false,
  });
  const [search, setSearch] = useState("");
  const [moduleFilter, setModuleFilter] = useState("all");
  const [requirementFilter, setRequirementFilter] = useState("all");
  const [priceFilter, setPriceFilter] = useState("all");
  const [supplierFilter, setSupplierFilter] = useState("all");
  const [recordTypeFilter, setRecordTypeFilter] = useState("all");
  const [infrastructureFilters, setInfrastructureFilters] = useState<string[]>([]);
  const [onlyPurchases, setOnlyPurchases] = useState(true);
  const [onlyUnpriced, setOnlyUnpriced] = useState(false);
  const [onlyQuote, setOnlyQuote] = useState(false);
  const [showComponents, setShowComponents] = useState(false);
  const [showOptional, setShowOptional] = useState(false);
  const [groupBy, setGroupBy] = useState("module");

  const currentFormat = capexData.formats.find(format => format.id === formatId) ?? capexData.formats[1];
  const moduleById = useMemo(() => new Map(capexData.modules.map(module => [module.id, module])), []);

  useEffect(() => {
    setSelectedModuleIds([]);
    setModuleFilter("all");
    setParameters(current => ({
      ...current,
      sharedSeating: formatId === "FMT-FOOD-COURT",
      mobileFormat: formatId === "FMT-FOODTRUCK",
    }));
  }, [formatId]);

  const activeModuleIds = useMemo(() => new Set([...currentFormat.requiredModules, ...selectedModuleIds]), [currentFormat.requiredModules, selectedModuleIds]);
  const rows = useMemo(() => buildRows(activeModuleIds, scenarioId, parameters), [activeModuleIds, scenarioId, parameters]);
  const activeModules = capexData.modules.filter(module => activeModuleIds.has(module.id));
  const requiredModules = currentFormat.requiredModules.map(id => moduleById.get(id)).filter(Boolean) as CapexModule[];
  const incompleteRequiredModules = requiredModules.filter(module => module.status === "not_started");
  const pricedRows = rows.filter(row => row.independentProcurement && row.quantity !== 0 && row.lineTotal !== null);
  const coverageRows = rows.filter(row => row.independentProcurement && row.quantity !== 0);
  const unpricedRows = coverageRows.filter(row => row.lineTotal === null);
  const quoteRows = coverageRows.filter(row => row.quoteRequired);
  const total = pricedRows.reduce((sum, row) => sum + (row.lineTotal ?? 0), 0);
  const coveragePercent = coverageRows.length ? (pricedRows.length / coverageRows.length) * 100 : 0;

  const moduleSummaries = activeModules.map(module => {
    const moduleRows = rows.filter(row => row.moduleIds.includes(module.id));
    const allocatedRows = rows.filter(row => row.primaryModuleId === module.id);
    return {
      ...module,
      rowCount: moduleRows.length,
      subtotal: allocatedRows.reduce((sum, row) => sum + (row.lineTotal ?? 0), 0),
      missing: allocatedRows.filter(row => row.independentProcurement && row.quantity !== 0 && row.lineTotal === null).length,
      relation: (currentFormat.requiredModules as string[]).includes(module.id) ? "required" : (currentFormat.conditionalModules as string[]).includes(module.id) ? "conditional" : "optional",
    };
  });

  const scenarioSummaries = useMemo(() => scenarioIds.map(scenario => {
    const scenarioRows = buildRows(activeModuleIds, scenario, parameters);
    const priced = scenarioRows.filter(row => row.independentProcurement && row.quantity !== 0 && row.lineTotal !== null);
    const coverage = scenarioRows.filter(row => row.independentProcurement && row.quantity !== 0);
    const moduleTotals = Object.fromEntries(activeModules.map(module => [module.id, scenarioRows.filter(row => row.primaryModuleId === module.id).reduce((sum, row) => sum + (row.lineTotal ?? 0), 0)]));
    return { scenario, total: priced.reduce((sum, row) => sum + (row.lineTotal ?? 0), 0), priced: priced.length, unpriced: coverage.length - priced.length, quote: coverage.filter(row => row.quoteRequired).length, moduleTotals };
  }), [activeModuleIds, parameters, activeModules]);

  const suppliers = [...new Set(rows.map(row => row.price?.supplierName).filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b, "ru"));
  const recordTypes = [...new Set(rows.map(row => row.item.recordType))].sort();
  const visibleRows = rows.filter(row => {
    const haystack = [row.item.id, row.item.name, row.price?.supplierName, row.item.notes, row.item.priceNotes].filter(Boolean).join(" ").toLowerCase();
    if (search && !haystack.includes(search.toLowerCase())) return false;
    if (moduleFilter !== "all" && !row.moduleIds.includes(moduleFilter)) return false;
    if (requirementFilter !== "all" && row.requirement !== requirementFilter) return false;
    if (priceFilter === "priced" && row.lineTotal === null) return false;
    if (priceFilter === "unpriced" && row.lineTotal !== null) return false;
    if (priceFilter === "quote_required" && !row.quoteRequired) return false;
    if (supplierFilter !== "all" && row.price?.supplierName !== supplierFilter) return false;
    if (recordTypeFilter !== "all" && row.item.recordType !== recordTypeFilter) return false;
    if (onlyPurchases && !row.independentProcurement) return false;
    if (onlyUnpriced && row.lineTotal !== null) return false;
    if (onlyQuote && !row.quoteRequired) return false;
    if (!showComponents && row.includedInParent) return false;
    if (!showOptional && (row.requirement === "optional" || row.quantity === 0)) return false;
    for (const filter of infrastructureFilters) {
      if (filter === "220" && row.item.voltage !== 220) return false;
      if (filter === "380" && row.item.voltage !== 380) return false;
      if (filter === "water" && row.item.waterRequired !== true) return false;
      if (filter === "drainage" && row.item.drainageRequired !== true) return false;
      if (filter === "gas" && row.item.gasRequired !== true) return false;
      if (filter === "extraction" && row.item.extractionRequired !== true) return false;
    }
    return true;
  });

  function groupValue(row: ComputedRow) {
    if (groupBy === "module") return moduleById.get(row.primaryModuleId)?.name ?? row.primaryModuleId;
    if (groupBy === "requirement") return label(row.requirement);
    if (groupBy === "price") return row.lineTotal !== null ? "Есть ценовой ориентир" : row.quoteRequired ? "Требуется КП" : "Без цены";
    if (groupBy === "supplier") return row.price?.supplierName ?? "Поставщик не определён";
    return "Все позиции";
  }
  const groupedRows = [...visibleRows.reduce((map, row) => {
    const key = groupValue(row);
    map.set(key, [...(map.get(key) ?? []), row]);
    return map;
  }, new Map<string, ComputedRow[]>()).entries()];

  const moduleOptions = currentFormat.manualSelection
    ? capexData.modules
    : capexData.modules.filter(module => [...currentFormat.optionalModules, ...currentFormat.conditionalModules].includes(module.id));
  const maxScenario = Math.max(...scenarioSummaries.map(item => item.total), 1);
  const maxModule = Math.max(...moduleSummaries.map(item => item.subtotal), 1);
  const topDrivers = [...pricedRows].sort((a, b) => (b.lineTotal ?? 0) - (a.lineTotal ?? 0)).slice(0, 10);

  function toggleModule(moduleId: string) {
    if (currentFormat.requiredModules.includes(moduleId)) return;
    setSelectedModuleIds(current => current.includes(moduleId) ? current.filter(id => id !== moduleId) : [...current, moduleId]);
  }
  function updateParameter(key: NumericParameterKey, value: number | null) { setParameters(current => ({ ...current, [key]: value })); }
  function toggleInfrastructure(value: string) { setInfrastructureFilters(current => current.includes(value) ? current.filter(item => item !== value) : [...current, value]); }
  function toggleFeature(moduleId: string | null, key: keyof Pick<Parameters, "alcoholEnabled" | "sharedSeating" | "reusableTableware" | "centralSupply" | "mobileFormat">) {
    if (moduleId) toggleModule(moduleId);
    else setParameters(current => ({ ...current, [key]: !current[key] }));
  }

  return (
    <div className="capex-page">
      <section className="capex-hero" aria-labelledby="capex-title">
        <div className="section-inner capex-hero-inner">
          <div>
            <div className="capex-eyebrow"><span>Внутренний инструмент</span><span className="capex-status-pill">{capexData.meta.statusLabel}</span></div>
            <h1 id="capex-title">CAPEX-конфигуратор</h1>
            <p>Формат точки → модули → оборудование → стоимость оценённых позиций → полнота расчёта → источники.</p>
            <div className="capex-provenance-line"><span>Версия {capexData.meta.dataVersion}</span><span>{capexData.meta.decisionId}</span><span>Цены: {checkedDate(capexData.meta.priceCheckedAt)}</span></div>
          </div>
          <aside><strong>Исследование, не полный бюджет запуска</strong><p>{capexData.meta.warning}</p></aside>
        </div>
      </section>

      <section className="capex-summary-section" aria-label="Сводка текущей комплектации">
        <div className="section-inner capex-metrics-grid">
          <MetricCard tone="dark" title="Стоимость текущей комплектации оборудования" value={`${unpricedRows.length ? "от " : ""}${formatRub(total)}`} detail={`Только ${pricedRows.length} оценённых позиций · ${capexData.scenarios.find(item => item.id === scenarioId)?.label}`} />
          <MetricCard title="Ценовое покрытие" value={`${pricedRows.length} из ${coverageRows.length}`} detail={`${percentFormatter.format(coveragePercent)}% самостоятельных и системных позиций`} />
          <MetricCard tone={unpricedRows.length ? "warning" : "default"} title="Без цены" value={String(unpricedRows.length)} detail="Не считаются как 0 ₽" />
          <MetricCard tone={quoteRows.length ? "warning" : "default"} title="Требуют КП" value={String(quoteRows.length)} detail="Отдельно от показателя «Без цены»" />
          <MetricCard tone={incompleteRequiredModules.length ? "warning" : "default"} title="Полнота модулей" value={`${requiredModules.length - incompleteRequiredModules.length} из ${requiredModules.length}`} detail={incompleteRequiredModules.length ? `Не сформировано: ${incompleteRequiredModules.map(module => module.name).join(", ")}` : "Все обязательные модули описаны"} />
          <MetricCard title="Актуальность" value={capexData.meta.statusLabel} detail={`${checkedDate(capexData.meta.priceCheckedAt)} · ${capexData.meta.dataVersion}`} />
        </div>
      </section>

      <section className="capex-format-section" aria-labelledby="capex-format-title">
        <div className="section-inner">
          <div className="capex-section-title"><span>01 · Формат точки</span><h2 id="capex-format-title">С чего собираем объект</h2><p>Используются семь канонических профилей <code>FMT-*</code>. Формат подключает модули, но не копирует оборудование.</p></div>
          <div className="capex-format-tabs" role="list" aria-label="Форматы точек">
            {capexData.formats.map(format => <button type="button" key={format.id} data-format-id={format.id} className={format.id === formatId ? "is-selected" : ""} aria-pressed={format.id === formatId} onClick={() => setFormatId(format.id)}><span>{format.id}</span><strong>{format.name}</strong></button>)}
          </div>
          <div className="capex-flow" aria-label="Последовательность формирования расчёта"><span>Выбранный формат</span><i>→</i><span>Подключённые модули</span><i>→</i><span>Комплектация</span><i>→</i><span>Оценённая стоимость</span><i>→</i><span>Пробелы расчёта</span></div>
          <article className="capex-format-detail">
            <div><span className="capex-code">{currentFormat.id}</span><h3>{currentFormat.canonicalName}</h3><p>{currentFormat.purpose}</p>{currentFormat.notes ? <small>{currentFormat.notes}</small> : null}</div>
            <div className="capex-format-rules">
              <p><b>Обязательные:</b> {currentFormat.requiredModules.length ? currentFormat.requiredModules.join(", ") : "выбираются вручную"}</p>
              <p><b>Опциональные:</b> {currentFormat.optionalModules.join(", ") || "нет"}</p>
              <p><b>Зависят от формата:</b> {currentFormat.conditionalModules.join(", ") || "нет"}</p>
              <p><b>Отключены по умолчанию:</b> {currentFormat.excludedModules.join(", ") || "нет"}</p>
            </div>
          </article>
          {incompleteRequiredModules.length ? <div className="capex-alert" role="alert"><strong>Комплектация формата неполная</strong><span>Обязательные модули без сформированного состава: {incompleteRequiredModules.map(module => module.name).join(", ")}.</span></div> : null}
        </div>
      </section>

      <section className="capex-work-section" aria-labelledby="capex-work-title">
        <div className="section-inner">
          <div className="capex-section-title"><span>02 · Рабочая конфигурация</span><h2 id="capex-work-title">Параметры, модули и сценарий</h2><p>Параметр влияет на количество только при наличии quantity rule и коэффициента. Остальные поля сохраняют неопределённость.</p></div>
          <div className="capex-workbench">
            <details className="capex-parameters-panel" open>
              <summary>Параметры конфигурации</summary>
              <div className="capex-parameters-body">
                <fieldset><legend>Производство</legend>
                  <NumberStepper labelText="Обслуживаемых торговых точек" value={parameters.outletCount} onChange={value => updateParameter("outletCount", value)} hint="Ориентир исследования; не умножает оборудование автоматически" />
                  <NumberStepper labelText="Чеков на точку в день" value={parameters.checksPerOutlet} onChange={value => updateParameter("checksPerOutlet", value)} hint="Ориентир исследования; порог мощности не утверждён" />
                  <NumberStepper labelText="Производственных смен" value={parameters.shiftCount} onChange={value => updateParameter("shiftCount", value)} />
                  <NumberStepper labelText="Начинок" value={parameters.fillingCount} onChange={value => updateParameter("fillingCount", value)} />
                </fieldset>
                <fieldset><legend>Торговая точка</legend>
                  <NumberStepper labelText="Кассовых постов" value={parameters.cashierPostCount} onChange={value => updateParameter("cashierPostCount", value)} />
                  <NumberStepper labelText="Горячих рабочих постов" value={parameters.hotKitchenPostCount} onChange={value => updateParameter("hotKitchenPostCount", value)} />
                  <NumberStepper labelText="KDS-постов" value={parameters.kdsPostCount} onChange={value => updateParameter("kdsPostCount", value)} hint="Меняет расчёт только после утверждения правила" />
                  <NumberStepper labelText="Посадочных мест" value={parameters.seatCount} onChange={value => updateParameter("seatCount", value)} />
                  <NumberStepper labelText="Гостевая площадь, м²" value={parameters.guestAreaM2} onChange={value => updateParameter("guestAreaM2", value)} />
                  <NumberStepper labelText="Станций самообслуживания" value={parameters.serviceStationCount} onChange={value => updateParameter("serviceStationCount", value)} />
                </fieldset>
                <fieldset><legend>Модули и функции</legend>
                  <Toggle checked={activeModuleIds.has("MOD-PREP")} disabled={currentFormat.requiredModules.includes("MOD-PREP")} onChange={() => toggleModule("MOD-PREP")}>Заготовочное производство</Toggle>
                  <Toggle checked={activeModuleIds.has("MOD-BAR")} disabled={currentFormat.requiredModules.includes("MOD-BAR")} onChange={() => toggleModule("MOD-BAR")}>Бар и напитки</Toggle>
                  <Toggle checked={parameters.alcoholEnabled} onChange={() => toggleFeature(null, "alcoholEnabled")} hint="Отдельное условное направление">Алкогольное направление</Toggle>
                  <Toggle checked={activeModuleIds.has("MOD-GROW")} disabled={currentFormat.requiredModules.includes("MOD-GROW")} onChange={() => toggleModule("MOD-GROW")}>Выращивание</Toggle>
                  <Toggle checked={activeModuleIds.has("MOD-GUEST")} disabled={currentFormat.requiredModules.includes("MOD-GUEST")} onChange={() => toggleModule("MOD-GUEST")}>Посадочный зал</Toggle>
                  <Toggle checked={parameters.sharedSeating} onChange={() => toggleFeature(null, "sharedSeating")}>Общая посадка фудкорта</Toggle>
                  <Toggle checked={parameters.reusableTableware} onChange={() => toggleFeature(null, "reusableTableware")}>Многоразовая посуда</Toggle>
                  <Toggle checked={parameters.centralSupply} onChange={() => toggleFeature(null, "centralSupply")}>Централизованное снабжение</Toggle>
                  <Toggle checked={parameters.mobileFormat} onChange={() => toggleFeature(null, "mobileFormat")}>Мобильный формат</Toggle>
                </fieldset>
              </div>
            </details>

            <div className="capex-module-column">
              <div className="capex-scenario-switch" role="group" aria-label="Сценарий стоимости">
                {capexData.scenarios.map(scenario => <button type="button" key={scenario.id} data-scenario-id={scenario.id} className={scenario.id === scenarioId ? "is-selected" : ""} aria-pressed={scenario.id === scenarioId} onClick={() => setScenarioId(scenario.id as ScenarioId)}><strong>{scenario.label}</strong><span>{scenario.description}</span></button>)}
              </div>
              {moduleOptions.length ? <div className="capex-module-picker"><h3>{currentFormat.manualSelection ? "Выберите модули вручную" : "Опциональные и условные модули"}</h3>{moduleOptions.map(module => <Toggle key={module.id} checked={activeModuleIds.has(module.id)} disabled={currentFormat.requiredModules.includes(module.id)} onChange={() => toggleModule(module.id)} hint={`${module.id} · ${label(module.status)}`}>{module.name}</Toggle>)}</div> : null}
              <div className="capex-module-cards">
                {moduleSummaries.map(module => <article key={module.id} data-module-id={module.id} className={module.status === "not_started" ? "is-incomplete" : ""}><div><span className="capex-code">{module.id}</span><span className={`capex-tag status-${classToken(module.status)}`}>{label(module.status)}</span></div><h3>{module.name}</h3><p>{label(module.relation)} · {module.rowCount} позиций</p><strong>{module.subtotal ? formatRub(module.subtotal) : "Сумма не рассчитана"}</strong><small>{module.missing ? `${module.missing} без цены` : module.status === "not_started" ? "Состав не сформирован" : "Ценовые строки учтены"}</small></article>)}
              </div>
            </div>

            <aside className="capex-live-summary" aria-live="polite">
              <span>Стоимость текущей комплектации оборудования</span>
              <strong>{unpricedRows.length ? "от " : ""}{formatRub(total)}</strong>
              <p>{currentFormat.name} · {capexData.scenarios.find(item => item.id === scenarioId)?.label}</p>
              <dl><div><dt>Оценено</dt><dd>{pricedRows.length}</dd></div><div><dt>Без цены</dt><dd>{unpricedRows.length}</dd></div><div><dt>Требуют КП</dt><dd>{quoteRows.length}</dd></div><div><dt>Модулей</dt><dd>{activeModules.length}</dd></div></dl>
              <a href="#capex-equipment" className="button button-primary">К комплектации</a>
              <small>{capexData.meta.warning}</small>
            </aside>
          </div>
        </div>
      </section>

      <section className="capex-charts-section" aria-labelledby="capex-charts-title">
        <div className="section-inner">
          <div className="capex-section-title capex-section-title-light"><span>03 · Аналитика состава</span><h2 id="capex-charts-title">Что формирует текущую оценку</h2><p>Графики показывают только оборудование и сохраняют текстовое представление данных.</p></div>
          <div className="capex-chart-grid">
            <article className="capex-chart-card capex-chart-wide"><h3>Сравнение сценариев</h3>{scenarioSummaries.map((entry, index) => <CostBar key={entry.scenario} value={entry.total} max={maxScenario} index={index} labelText={capexData.scenarios.find(item => item.id === entry.scenario)?.label ?? entry.scenario} detail={`${entry.priced} с ценой · ${entry.unpriced} без цены · ${entry.quote} требуют КП`} />)}</article>
            <article className="capex-chart-card"><h3>Структура стоимости</h3>{moduleSummaries.filter(module => module.subtotal > 0).map((module, index) => <CostBar key={module.id} value={module.subtotal} max={maxModule} index={index} labelText={module.name} />)}{!moduleSummaries.some(module => module.subtotal > 0) ? <p>Нет оценённых модулей.</p> : null}</article>
            <article className="capex-chart-card"><h3>Диапазон оценки</h3>{scenarioSummaries.map((entry, index) => <CostBar key={entry.scenario} value={entry.total} max={maxScenario} index={index} labelText={capexData.scenarios.find(item => item.id === entry.scenario)?.label ?? entry.scenario} />)}</article>
            <article className="capex-chart-card capex-chart-wide"><h3>Основные драйверы стоимости</h3><ol className="capex-driver-list">{topDrivers.map(row => <li key={row.item.id}><span>{row.item.name}<small>{row.item.id} · {moduleById.get(row.primaryModuleId)?.name}</small></span><strong>{formatRub(row.lineTotal)}</strong></li>)}</ol></article>
            <article className="capex-chart-card"><h3>Полнота расчёта</h3><div className="capex-completeness"><div><strong>{percentFormatter.format(coveragePercent)}%</strong><span>ценовое покрытие</span></div><div><strong>{requiredModules.length - incompleteRequiredModules.length}/{requiredModules.length}</strong><span>обязательных модулей описано</span></div><div><strong>{coverageRows.length ? percentFormatter.format((quoteRows.length / coverageRows.length) * 100) : 0}%</strong><span>позиций требуют КП</span></div></div></article>
          </div>
        </div>
      </section>

      <section className="capex-equipment-section" id="capex-equipment" aria-labelledby="capex-equipment-title">
        <div className="section-inner">
          <div className="capex-section-title"><span>04 · Оснащение</span><h2 id="capex-equipment-title">Сформированная комплектация</h2><p>{rows.length} уникальных записей после дедупликации; {visibleRows.length} показано с учётом фильтров. Компоненты систем не суммируются отдельно.</p></div>
          <div className="capex-filter-panel">
            <label className="capex-search"><span>Поиск</span><input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="ID, оборудование, поставщик, комментарий" /></label>
            <label><span>Модуль</span><select value={moduleFilter} onChange={event => setModuleFilter(event.target.value)}><option value="all">Все модули</option>{activeModules.map(module => <option key={module.id} value={module.id}>{module.name}</option>)}</select></label>
            <label><span>Обязательность</span><select value={requirementFilter} onChange={event => setRequirementFilter(event.target.value)}><option value="all">Все</option><option value="required">Обязательно</option><option value="conditional">Зависит от формата</option><option value="optional">Опционально</option><option value="tbd">Требует уточнения</option></select></label>
            <label><span>Статус цены</span><select value={priceFilter} onChange={event => setPriceFilter(event.target.value)}><option value="all">Все</option><option value="priced">Есть цена</option><option value="unpriced">Без цены</option><option value="quote_required">Требуется КП</option></select></label>
            <label><span>Поставщик</span><select value={supplierFilter} onChange={event => setSupplierFilter(event.target.value)}><option value="all">Все</option>{suppliers.map(supplier => <option key={supplier}>{supplier}</option>)}</select></label>
            <label><span>Тип записи</span><select value={recordTypeFilter} onChange={event => setRecordTypeFilter(event.target.value)}><option value="all">Все</option>{recordTypes.map(type => <option key={type} value={type}>{label(type)}</option>)}</select></label>
            <label><span>Группировка</span><select value={groupBy} onChange={event => setGroupBy(event.target.value)}><option value="module">По модулю</option><option value="requirement">По обязательности</option><option value="price">По статусу цены</option><option value="supplier">По поставщику</option><option value="none">Без группировки</option></select></label>
          </div>
          <div className="capex-infra-filters" aria-label="Фильтры инфраструктуры">{[["220", "220 В"], ["380", "380 В"], ["water", "Вода"], ["drainage", "Канализация"], ["gas", "Газ"], ["extraction", "Вытяжка"]].map(([value, text]) => <button type="button" key={value} className={infrastructureFilters.includes(value) ? "is-selected" : ""} aria-pressed={infrastructureFilters.includes(value)} onClick={() => toggleInfrastructure(value)}>{text}</button>)}</div>
          <div className="capex-quick-filters" aria-label="Быстрые фильтры">
            <Toggle checked={onlyPurchases} onChange={() => setOnlyPurchases(value => !value)}>Только самостоятельные покупки</Toggle>
            <Toggle checked={onlyUnpriced} onChange={() => setOnlyUnpriced(value => !value)}>Только без цены</Toggle>
            <Toggle checked={onlyQuote} onChange={() => setOnlyQuote(value => !value)}>Только требующие КП</Toggle>
            <Toggle checked={showComponents} onChange={() => setShowComponents(value => !value)}>Показать компоненты систем</Toggle>
            <Toggle checked={showOptional} onChange={() => setShowOptional(value => !value)}>Показать опциональные позиции</Toggle>
          </div>

          {groupedRows.length ? groupedRows.map(([group, groupRows]) => <div className="capex-table-group" key={group}><h3>{group}<span>{groupRows.length}</span></h3><div className="capex-table-wrap"><table className="capex-table"><thead><tr><th scope="col">ID</th><th scope="col">Оборудование</th><th scope="col">Модуль</th><th scope="col">Обязательность</th><th scope="col">Количество</th><th scope="col">Цена за единицу</th><th scope="col">Сумма</th><th scope="col">Поставщик</th><th scope="col">Дата проверки</th><th scope="col">Статус цены</th></tr></thead><tbody>{groupRows.map(row => {
            const components = row.item.childItemIds.map(id => capexData.items.find(item => item.id === id)).filter(Boolean) as CapexItem[];
            return <tr key={`${group}-${row.item.id}`} data-item-id={row.item.id}><td data-label="ID"><code>{row.item.id}</code></td><td data-label="Оборудование"><strong>{row.item.name}</strong><small>{row.price?.productName ?? row.item.subcategory}</small><details><summary>Требования и происхождение</summary><div className="capex-row-details">{row.item.specification ? <p><b>Минимальные требования:</b> {row.item.specification}</p> : null}<p><b>Источник включения:</b> {row.sourceInclusion}</p><p><b>Правило количества:</b> {ruleLabel(row.quantityRule)}; {row.quantityStatus}</p>{components.length ? <div><b>Входит в систему:</b><ul>{components.map(component => <li key={component.id}>{component.id} — {component.name}</li>)}</ul></div> : null}{row.item.openParameters ? <p><b>Открытые параметры:</b> {row.item.openParameters}</p> : null}<p><b>Инфраструктура:</b> {[row.item.voltage ? `${row.item.voltage} В` : null, row.item.waterRequired ? "вода" : null, row.item.drainageRequired ? "канализация" : null, row.item.gasRequired ? "газ" : null, row.item.extractionRequired ? "вытяжка" : null].filter(Boolean).join(", ") || "не указана"}</p>{row.item.premisesDependency ? <p><b>Зависимость от помещения:</b> {row.item.premisesDependency}</p> : null}{row.item.priceResearch?.riskReason ? <p><b>Риск цены:</b> {row.item.priceResearch.riskReason}</p> : null}{row.item.priceNotes ? <p><b>Комментарий по цене:</b> {row.item.priceNotes}</p> : null}{row.item.notes ? <p>{row.item.notes}</p> : null}</div></details></td><td data-label="Модуль">{row.moduleIds.map(id => <span className="capex-code capex-code-block" key={id}>{id}</span>)}</td><td data-label="Обязательность"><span className={`capex-tag status-${classToken(row.requirement)}`}>{label(row.requirement)}</span></td><td data-label="Количество"><strong>{formatNumber(row.quantity)} {row.quantity !== null && row.item.unit !== "tbd" ? row.item.unit : ""}</strong><small>{row.quantityStatus}</small></td><td data-label="Цена за единицу">{formatRub(row.unitPrice)}</td><td data-label="Сумма"><strong>{row.includedInParent ? "Входит в комплект" : row.lineTotal === null ? "Не рассчитано" : formatRub(row.lineTotal)}</strong></td><td data-label="Поставщик">{row.price?.supplierName ?? "Не определён"}{row.price?.sourceUrl ? <a className="capex-product-link" href={row.price.sourceUrl} target="_blank" rel="noopener noreferrer">Открыть товар ↗</a> : <span className="capex-quote-label">Требуется КП</span>}</td><td data-label="Дата проверки">{checkedDate(row.price?.checkedAt ?? row.item.priceDate)}</td><td data-label="Статус цены"><span className={`capex-tag ${row.quoteRequired ? "status-warning" : row.lineTotal !== null ? "status-researched" : "status-tbd"}`}>{row.quoteRequired ? "Требуется КП" : row.lineTotal !== null ? "Исследование цен" : "Без цены"}</span>{row.price ? <small>Уверенность: {label(row.price.confidence)}</small> : null}</td></tr>;
          })}</tbody></table></div></div>) : <div className="capex-empty-state"><strong>Нет строк по выбранным фильтрам</strong><p>Сбросьте часть фильтров или включите компоненты и опциональные позиции.</p></div>}
        </div>
      </section>

      <section className="capex-missing-section" aria-labelledby="capex-missing-title">
        <div className="section-inner"><div className="capex-section-title capex-section-title-light"><span>05 · Границы расчёта</span><h2 id="capex-missing-title">Пока не включено в расчёт</h2><p>Отсутствующая оценка не равна нулю. Ниже — канонические missing sections и их фактический статус.</p></div><div className="capex-missing-grid">{capexData.missingSections.map(section => <article key={section.id}><span className="capex-code">{section.id}</span><h3>{section.name}</h3><strong>{section.status === "structured" ? "Частично сформировано" : section.dependencies.some(item => /помещ|планиров|инжен/i.test(item)) ? "Требует параметров помещения" : "Не рассчитано"}</strong><p>{section.notes}</p></article>)}</div></div>
      </section>

      <section className="capex-documents-section" aria-labelledby="capex-documents-title">
        <div className="section-inner"><div className="capex-section-title"><span>06 · Источники и аудит</span><h2 id="capex-documents-title">Документы проекта</h2><p>Список сформирован из registry; отсутствующие документы не создаются ради ссылки.</p></div><div className="capex-documents-grid">{capexData.documents.map(document => <article key={document.id}><span className="capex-code">{document.id}</span><h3>{document.title}</h3><p>{document.statusLabel}</p>{document.googleUrl ? <a href={document.googleUrl} target="_blank" rel="noopener noreferrer">Открыть ↗</a> : <span>Не создан</span>}</article>)}</div>
          <div className="capex-history-grid"><article><h3>История данных</h3><dl><div><dt>Версия данных</dt><dd>{capexData.meta.dataVersion}</dd></div><div><dt>Последняя синхронизация</dt><dd>{checkedDate(capexData.meta.generatedAt)}</dd></div><div><dt>Проверка цен</dt><dd>{checkedDate(capexData.meta.priceCheckedAt)}</dd></div><div><dt>Решение</dt><dd>{capexData.meta.decisionId}</dd></div><div><dt>Набор изменений</dt><dd>{capexData.meta.changeSetId}</dd></div><div><dt>Итерация</dt><dd>{capexData.meta.iterationId}</dd></div><div><dt>Базовый Git-коммит</dt><dd><code>{capexData.meta.gitBaselineCommit?.slice(0, 12) ?? "не зафиксирован"}</code></dd></div><div><dt>Статус</dt><dd>{capexData.meta.statusLabel}</dd></div></dl><details><summary>SHA-256 источников</summary><ul className="capex-hash-list">{Object.entries(capexData.meta.sourceHashes).map(([source, hash]) => <li key={source}><span>{source.replace("docs-platform/", "")}</span><code>{hash}</code></li>)}</ul></details></article><article><h3>Последние события</h3><ol className="capex-timeline">{capexData.timeline.map(event => <li key={event.id}><time dateTime={event.timestamp}>{checkedDate(event.timestamp)}</time><div><strong>{label(event.status)} · {event.decisionId}</strong><p>{event.summary}</p></div></li>)}</ol></article></div>
        </div>
      </section>
    </div>
  );
}
