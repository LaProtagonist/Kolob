import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { platformRoot } from "../google/config.js";
import { readTimelineEvents } from "../governance/timeline.js";
import { readModularSources } from "./modular.js";
import { readRegister, serializeRegister, sha256 } from "./register.js";
import { PRICE_SCENARIOS, readPriceResearch } from "./price-research.js";

const projectRoot = path.resolve(platformRoot, "..");
export const WEB_SNAPSHOT_PATH = path.join(projectRoot, "src", "content", "capex-configurator-data.json");

const SOURCE_PATHS = [
  "docs-platform/working/capex-equipment-register.yaml",
  "docs-platform/working/capex-price-research.yaml",
  "docs-platform/working/capex-modules.yaml",
  "docs-platform/working/capex-module-items.yaml",
  "docs-platform/working/capex-point-formats.yaml",
  "docs-platform/working/capex-configurations.yaml",
  "docs-platform/working/capex-configuration-overrides.yaml",
  "docs-platform/working/pilot-capex-assumptions.yaml",
  "docs-platform/registry/documents.yaml",
  "docs-platform/registry/decisions.yaml",
  "docs-platform/changelog/events.ndjson",
] as const;

function readYaml(relativePath: string) { return YAML.parse(fs.readFileSync(path.join(projectRoot, relativePath), "utf8")); }
function googleLink(id: string, type: string) {
  if (type === "spreadsheet") return `https://docs.google.com/spreadsheets/d/${id}/preview`;
  return `https://docs.google.com/document/d/${id}/preview`;
}
function gitBaseline(timestamp: string) {
  try {
    return execFileSync("git", ["log", "-1", "--format=%H", `--before=${timestamp}`], { cwd: projectRoot, encoding: "utf8" }).trim() || null;
  } catch {
    return null;
  }
}

export function buildWebSnapshot() {
  const register = readRegister();
  const research = readPriceResearch();
  const modular = readModularSources();
  const pilotAssumptions = readYaml("docs-platform/working/pilot-capex-assumptions.yaml");
  const documents = (readYaml("docs-platform/registry/documents.yaml")?.documents ?? []) as Array<Record<string, unknown>>;
  const decisions = (readYaml("docs-platform/registry/decisions.yaml")?.decisions ?? []) as Array<Record<string, unknown>>;
  const events = readTimelineEvents();
  const currentDecision = decisions.find(item => item.id === register.document.decision_id) ?? decisions.at(-1) ?? null;
  const currentEvent = [...events].reverse().find(event => event.decision_id === register.document.decision_id && event.lifecycle_status === "verified") ?? null;
  const currentManifestPath = path.join(platformRoot, "changes", "iterations", `${register.document.iteration_id}.yaml`);
  const currentManifest = fs.existsSync(currentManifestPath) ? YAML.parse(fs.readFileSync(currentManifestPath, "utf8")) : null;
  const generatedAt = currentEvent?.timestamp ?? `${String((currentDecision?.updated_at as string | undefined) ?? "2026-08-03")}T00:00:00.000Z`;
  const sourceHashes = Object.fromEntries(SOURCE_PATHS.map(relativePath => [relativePath, sha256(fs.readFileSync(path.join(projectRoot, relativePath)))]));
  const researchByItem = new Map(research.items.map(item => [item.item_id, item]));
  const linksByItem = new Map<string, typeof modular.module_items.links>();
  for (const link of modular.module_items.links) linksByItem.set(link.item_id, [...(linksByItem.get(link.item_id) ?? []), link]);
  const childrenByParent = new Map<string, string[]>();
  for (const item of register.equipment) if (item.parent_item_id) childrenByParent.set(item.parent_item_id, [...(childrenByParent.get(item.parent_item_id) ?? []), item.item_id]);
  const procurement = register.equipment.filter(item => ["standalone", "purchased_separately"].includes(item.inclusion_status) && !["component", "engineering_connection", "open_question"].includes(item.record_type));

  const localDocuments = [
    ["DOC-FOUNDATION", "Foundation v1.0", "Утверждён", "document"],
    ["DOC-BUSINESS-MODEL-ARCHITECTURE", "Business Model Architecture v1.0", "Утверждён", "document"],
    ["DOC-CAPEX-EQUIPMENT-SPECIFICATION", "CAPEX Specification v0.1", "Исследование", "document"],
    ["DOC-CAPEX-EQUIPMENT-REGISTER", "CAPEX Equipment Register v0.1", "Исследование", "spreadsheet"],
    ["DOC-CAPEX-PRICE-RESEARCH", `CAPEX Price Research v${research.document.version}`, "Исследование", "document"],
  ].map(([id, title, statusLabel, googleType]) => {
    const entry = documents.find(item => item.id === id);
    const googleId = typeof entry?.google_file_id === "string" ? entry.google_file_id : null;
    return { id, title, status: entry?.status ?? "not_created", statusLabel, exists: Boolean(entry), localPath: entry?.local_path ?? null, googleUrl: googleId ? googleLink(googleId, googleType) : null };
  });
  localDocuments.push(
    { id: "DOC-FINANCIAL-MODEL", title: "Финансовая модель", status: "not_created", statusLabel: "Не создана", exists: false, localPath: null, googleUrl: null },
    { id: "DOC-INVESTMENT-MEMO", title: "Инвестиционный меморандум", status: "not_created", statusLabel: "Не создан", exists: false, localPath: null, googleUrl: null },
  );

  return {
    meta: {
      project: "Колобочная",
      title: "CAPEX-конфигуратор",
      status: "research",
      statusLabel: "Исследование",
      dataVersion: `${register.document.version}+${register.document.decision_id}`,
      generatedAt,
      priceCheckedAt: research.document.checked_at,
      currency: research.document.currency,
      decisionId: register.document.decision_id,
      changeSetId: currentEvent?.change_set_id ?? currentManifest?.change_set_id ?? null,
      iterationId: register.document.iteration_id,
      gitBaselineCommit: gitBaseline(generatedAt),
      warning: "В сумму включены только оценённые позиции выбранной комплектации оборудования. Инженерные работы, подготовка помещения, монтаж, расходы запуска, первоначальный запас, оборотный капитал и резерв бюджета пока не рассчитаны.",
      sourceHashes,
      sourceBundleSha256: sha256(JSON.stringify(sourceHashes)),
      counts: {
        equipmentRecords: register.equipment.length,
        independentProcurementRecords: procurement.length,
        foodPriceScopeRecords: research.summary.eligible_procurement_record_count,
        pricedRecords: research.summary.priced_record_count,
        unpricedRecords: research.summary.unpriced_record_count,
        quoteRequiredRecords: research.summary.quote_required_count,
        modules: modular.modules.modules.length,
        formats: modular.point_formats.formats.length,
      },
      scenarioTotalsRub: research.summary.totals_rub,
    },
    scenarios: [
      { id: "minimum", label: "Минимальная комплектация", description: "Исторический исследовательский сценарий; для запуска пилота не используется.", availableInSelector: false },
      { id: "base", label: "Базовая комплектация", description: "Рекомендуемый рабочий ориентир пилотного объекта по текущему исследованию.", availableInSelector: true },
      { id: "scale_ready", label: "С запасом для роста", description: "Более надёжные модели и подтверждённые сценарные количества без автоматического перехода к заводскому масштабу.", availableInSelector: true },
    ],
    businessCapacity: research.business_capacity,
    modules: modular.modules.modules.map(module => ({ id: module.module_id, name: module.name, purpose: module.purpose, status: module.lifecycle_status, notes: module.notes })),
    formats: modular.point_formats.formats.map(format => ({
      id: format.format_id,
      name: format.format_id === "FMT-CUSTOM" ? "Собрать вручную" : format.name,
      canonicalName: format.name,
      purpose: format.purpose,
      status: format.lifecycle_status,
      manualSelection: format.manual_selection,
      requiredModules: format.required_modules,
      optionalModules: format.optional_modules,
      conditionalModules: format.conditional_modules,
      excludedModules: format.excluded_modules,
      exclusionMode: format.exclusion_mode,
      notes: format.notes,
    })),
    moduleItems: modular.module_items.links.map(link => ({
      moduleId: link.module_id,
      itemId: link.item_id,
      defaultRequirement: link.default_requirement,
      quantityRuleType: link.quantity_rule_type,
      quantityRuleValue: link.quantity_rule_value,
      minimumQuantity: link.minimum_quantity,
      aggregationRule: link.aggregation_rule,
      condition: link.condition,
      notes: link.notes,
    })),
    configurationTemplate: modular.configurations.configurations.find(configuration => configuration.configuration_id === "CFG-TEMPLATE-001") ?? null,
    pilotConfiguration: modular.configurations.configurations.find(configuration => configuration.configuration_id === "CFG-PILOT-001") ?? null,
    pilotEconomics: pilotAssumptions,
    overrides: modular.configuration_overrides.overrides,
    items: register.equipment.map(item => {
      const price = researchByItem.get(item.item_id);
      const scenarios = Object.fromEntries(PRICE_SCENARIOS.map(scenario => {
        const value = price?.scenarios[scenario] ?? null;
        return [scenario, value ? {
          supplierName: value.supplier_name,
          productName: value.product_name,
          sourceUrl: value.source_url,
          unitPriceRub: value.observed_unit_price_rub,
          quantity: value.quantity,
          quantityBasis: value.quantity_basis,
          lineTotalRub: value.line_total_rub,
          availabilityStatus: value.availability_status,
          checkedAt: value.checked_at,
          confidence: value.confidence,
          notes: value.notes,
          sourceId: value.source_id,
        } : null];
      }));
      return {
        id: item.item_id,
        sourceModuleId: item.module_id,
        linkedModuleIds: (linksByItem.get(item.item_id) ?? []).map(link => link.module_id),
        name: item.name,
        category: item.category,
        subcategory: item.subcategory,
        recordType: item.record_type,
        parentItemId: item.parent_item_id,
        childItemIds: childrenByParent.get(item.item_id) ?? [],
        inclusionStatus: item.inclusion_status,
        requirement: item.requirement,
        lifecycleStatus: item.lifecycle_status,
        unit: item.unit,
        sourceQuantity: item.source_quantity,
        specification: item.specification,
        openParameters: item.open_parameters,
        premisesDependency: item.premises_dependency,
        procurementMode: item.procurement_mode,
        powerKw: item.power_kw,
        voltage: item.voltage,
        waterRequired: item.water_required,
        drainageRequired: item.drainage_required,
        gasRequired: item.gas_required,
        extractionRequired: item.extraction_required,
        dimensions: item.dimensions,
        serviceClearance: item.service_clearance,
        quoteStatus: item.quote_status,
        priceDate: item.price_date,
        supplier: item.supplier_name ?? item.supplier,
        sourceUrl: item.source_url ?? null,
        availabilityStatus: item.availability_status ?? null,
        confidence: item.confidence ?? null,
        priceNotes: item.price_notes ?? null,
        notes: item.notes,
        sourceId: item.source_id,
        priceResearch: price ? { valuationStatus: price.valuation_status, quoteStatus: price.quote_status, highRisk: price.high_risk, riskReason: price.risk_reason, notes: price.notes } : null,
        scenarios,
      };
    }),
    missingSections: register.missing_sections.map(section => ({ id: section.section_id, name: section.name, status: section.status, dependencies: section.dependencies, notes: section.notes })),
    documents: localDocuments,
    timeline: events.slice(-8).map(event => ({ id: event.event_id, timestamp: event.timestamp, status: event.lifecycle_status, action: event.action, decisionId: event.decision_id, changeSetId: event.change_set_id, summary: event.summary })),
  };
}

function serializedSnapshot() { return `${JSON.stringify(buildWebSnapshot(), null, 2)}\n`; }

export function writeWebSnapshot() {
  const content = serializedSnapshot();
  fs.mkdirSync(path.dirname(WEB_SNAPSHOT_PATH), { recursive: true });
  fs.writeFileSync(WEB_SNAPSHOT_PATH, content);
  const result = { path: path.relative(projectRoot, WEB_SNAPSHOT_PATH).replaceAll(path.sep, "/"), sha256: sha256(content), bytes: Buffer.byteLength(content) };
  console.log(JSON.stringify(result, null, 2));
  return result;
}

export function checkWebSnapshot() {
  if (!fs.existsSync(WEB_SNAPSHOT_PATH)) throw new Error("CAPEX web snapshot is missing. Run npm run capex:web:sync.");
  const expected = serializedSnapshot();
  const actual = fs.readFileSync(WEB_SNAPSHOT_PATH, "utf8");
  if (actual !== expected) throw new Error("CAPEX web snapshot is stale. Run npm run capex:web:sync and review the generated diff.");
  const result = { validation: "OK", path: path.relative(projectRoot, WEB_SNAPSHOT_PATH).replaceAll(path.sep, "/"), sha256: sha256(actual), source_bundle_sha256: buildWebSnapshot().meta.sourceBundleSha256 };
  console.log(JSON.stringify(result, null, 2));
  return result;
}
