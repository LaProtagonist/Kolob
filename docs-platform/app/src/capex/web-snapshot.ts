import fs from "node:fs";
import path from "node:path";
import { Ajv2020 } from "ajv/dist/2020.js";
import YAML from "yaml";
import { platformRoot } from "../google/config.js";
import { effectiveOccurredAt, effectiveType, isV2, readTimelineEvents } from "../governance/timeline.js";
import { buildContentStateManifest, changedContentSources, sourceHashMap, type ContentStateManifest } from "./content-state.js";
import { capexGovernanceProjectionIsCurrent } from "./governance-projection.js";
import { buildEquipmentBom, readModularSources } from "./modular.js";
import { readRegister, sha256 } from "./register.js";
import { PRICE_SCENARIOS, readPriceResearch, recalculatePriceSummary } from "./price-research.js";

const projectRoot = path.resolve(platformRoot, "..");
export const WEB_SNAPSHOT_PATH = path.join(projectRoot, "src", "content", "capex-configurator-data.json");

function readYaml(relativePath: string) { return YAML.parse(fs.readFileSync(path.join(projectRoot, relativePath), "utf8")); }
function googleLink(id: string, type: string) {
  if (type === "spreadsheet") return `https://docs.google.com/spreadsheets/d/${id}/preview`;
  return `https://docs.google.com/document/d/${id}/preview`;
}
function snapshotEventPrefix(events: ReturnType<typeof readTimelineEvents>, decisionId: string) {
  let lastVerified = -1;
  for (let index = events.length - 1; index >= 0; index -= 1) {
    if (events[index].decision_id === decisionId && effectiveType(events[index]) === "verified") { lastVerified = index; break; }
  }
  return lastVerified >= 0 ? events.slice(0, lastVerified + 1) : events;
}

export function buildWebSnapshot() {
  const contentState = buildContentStateManifest(projectRoot);
  const sourceHashes = sourceHashMap(contentState);
  const register = readRegister();
  const research = readPriceResearch();
  const modular = readModularSources();
  const pilotAssumptions = readYaml("docs-platform/working/pilot-capex-assumptions.yaml");
  const investorStartModel = readYaml("docs-platform/working/investor-start-model.yaml");
  const documents = (readYaml("docs-platform/registry/documents.yaml")?.documents ?? []) as Array<Record<string, unknown>>;
  const events = readTimelineEvents();
  const contentEvents = snapshotEventPrefix(events, register.document.decision_id);
  const currentEvent = [...contentEvents].reverse().find(event => event.decision_id === register.document.decision_id && effectiveType(event) === "verified") ?? null;
  const generatedAt = currentEvent ? effectiveOccurredAt(currentEvent) : research.document.checked_at;
  const researchByItem = new Map(research.items.map(item => [item.item_id, item]));
  // Preserve the existing scenario-total contract. Profile-specific additions
  // are priced in their generated BOM, not implicitly in the legacy scenarios.
  const legacyItemIds = new Set(register.equipment.filter(item => !item.composition_profile).map(item => item.item_id));
  const legacyScenarioTotals = recalculatePriceSummary(research.items.filter(item => legacyItemIds.has(item.item_id))).totals_rub;
  const linksByItem = new Map<string, typeof modular.module_items.links>();
  for (const link of modular.module_items.links) linksByItem.set(link.item_id, [...(linksByItem.get(link.item_id) ?? []), link]);
  const childrenByParent = new Map<string, string[]>();
  for (const item of register.equipment) if (item.parent_item_id) childrenByParent.set(item.parent_item_id, [...(childrenByParent.get(item.parent_item_id) ?? []), item.item_id]);
  const procurement = register.equipment.filter(item => ["standalone", "purchased_separately"].includes(item.inclusion_status) && !["component", "engineering_connection", "open_question"].includes(item.record_type));

  const localDocuments = [
    { id: "DOC-FOUNDATION", title: "Foundation", statusLabel: "Утверждён", googleType: "document", googleFallbackId: null },
    { id: "DOC-BUSINESS-MODEL-ARCHITECTURE", title: "Business Model Architecture", statusLabel: "Утверждён", googleType: "document", googleFallbackId: null },
    { id: "DOC-CAPEX-EQUIPMENT-SPECIFICATION", title: "CAPEX Specification", statusLabel: "Исследование", googleType: "document", googleFallbackId: null },
    { id: "DOC-CAPEX-EQUIPMENT-REGISTER", title: "CAPEX Equipment Register", statusLabel: "Исследование", googleType: "spreadsheet", googleFallbackId: null },
    { id: "DOC-CAPEX-PRICE-RESEARCH", title: "CAPEX Price Research", statusLabel: "Исследование", googleType: "spreadsheet", googleFallbackId: "DOC-CAPEX-EQUIPMENT-REGISTER" },
  ].map(({ id, title, statusLabel, googleType, googleFallbackId }) => {
    const entry = documents.find(item => item.id === id);
    const fallbackEntry = googleFallbackId ? documents.find(item => item.id === googleFallbackId) : null;
    const googleId = typeof entry?.google_file_id === "string" ? entry.google_file_id : typeof fallbackEntry?.google_file_id === "string" ? fallbackEntry.google_file_id : null;
    return {
      id,
      title,
      version: entry?.version ?? null,
      updatedAt: entry?.updated_at ?? null,
      status: entry?.status ?? "not_created",
      statusLabel,
      exists: Boolean(entry),
      localPath: entry?.local_path ?? null,
      googleUrl: googleId ? googleLink(googleId, googleType) : null,
      googleSourceDocumentId: typeof entry?.google_file_id === "string" ? id : googleId ? googleFallbackId : null,
    };
  });
  localDocuments.push(
    { id: "DOC-FINANCIAL-MODEL", title: "Финансовая модель", version: null, updatedAt: null, status: "not_created", statusLabel: "Не создана", exists: false, localPath: null, googleUrl: null, googleSourceDocumentId: null },
    { id: "DOC-INVESTMENT-MEMO", title: "Инвестиционный меморандум", version: null, updatedAt: null, status: "not_created", statusLabel: "Не создан", exists: false, localPath: null, googleUrl: null, googleSourceDocumentId: null },
  );

  return {
    meta: {
      schemaVersion: contentState.snapshot_schema_version,
      project: "Колобочная",
      title: "CAPEX-конфигуратор",
      status: "research",
      statusLabel: "Исследование",
      dataVersion: `${register.document.version}+${register.document.decision_id}`,
      generatedAt,
      priceCheckedAt: research.document.checked_at,
      currency: research.document.currency,
      decisionId: register.document.decision_id,
      changeSetId: currentEvent?.change_set_id ?? null,
      iterationId: register.document.iteration_id,
      approvedPayloadSha256: currentEvent ? (isV2(currentEvent) ? currentEvent.approved_payload_sha256 : currentEvent.approved_payload.sha256) : null,
      gitBaselineCommit: "не зафиксирован",
      warning: "В сумму включены только оценённые позиции выбранной комплектации оборудования. Инженерные работы, подготовка помещения, монтаж, расходы запуска, первоначальный запас, оборотный капитал и резерв бюджета пока не рассчитаны.",
      contentState,
      contentStateSha256: contentState.content_state_sha256,
      sourceHashes,
      sourceBundleSha256: contentState.content_state_sha256,
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
      scenarioTotalsRub: legacyScenarioTotals,
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
      defaultConfiguration: format.composition ? modular.configurations.configurations.find(configuration => configuration.format_id === format.format_id && configuration.composition_profile === format.composition!.id) ?? null : null,
      composition: format.composition ? { ...format.composition, bom: buildEquipmentBom(modular.configurations.configurations.find(configuration => configuration.format_id === format.format_id && configuration.composition_profile === format.composition!.id)!.configuration_id, register, modular) } : null,
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
    investorStartModel: {
      ...investorStartModel,
      source_sha256: sha256(fs.readFileSync(path.join(projectRoot, "docs-platform/working/investor-start-model.yaml"))),
    },
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
        costKind: item.cost_kind ?? "equipment",
        cashReserveRub: item.cash_reserve_rub ?? null,
        compositionProfile: item.composition_profile ?? null,
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
    timeline: contentEvents.slice(-8).map(event => ({ id: event.event_id, timestamp: effectiveOccurredAt(event), status: effectiveType(event), action: isV2(event) ? event.event_type : event.action, decisionId: event.decision_id, changeSetId: event.change_set_id, summary: event.summary })),
  };
}

function serializedSnapshot() { return `${JSON.stringify(buildWebSnapshot(), null, 2)}\n`; }

function validateSnapshotSchema(value: unknown): string[] {
  const schema = JSON.parse(fs.readFileSync(path.join(projectRoot, "docs-platform/schemas/capex-web-snapshot.schema.json"), "utf8"));
  const validate = new Ajv2020({ allErrors: true, strict: false }).compile(schema);
  return validate(value) ? [] : (validate.errors ?? []).map(error => `${error.instancePath || "/"} ${error.message}`);
}

function storedManifest(value: any): ContentStateManifest | null {
  const manifest = value?.meta?.contentState;
  return manifest && Array.isArray(manifest.source_files) && typeof manifest.content_state_sha256 === "string" ? manifest as ContentStateManifest : null;
}

function staleDiagnostic(stored: any, current: ContentStateManifest): string {
  const previous = storedManifest(stored);
  if (!previous) return "Snapshot stale because:\n- stored snapshot has no content_state_sha256 manifest\n- expected hash: missing\n- actual hash: " + current.content_state_sha256;
  const changes = changedContentSources(previous, current);
  return [
    "Snapshot stale because:",
    ...changes.flatMap(change => [`- ${change.path}`, `  expected hash: ${change.expected ?? "missing"}`, `  actual hash: ${change.actual ?? "missing"}`]),
    `- expected content_state_sha256: ${previous.content_state_sha256}`,
    `- actual content_state_sha256: ${current.content_state_sha256}`,
  ].join("\n");
}

export function writeWebSnapshot() {
  const content = serializedSnapshot();
  const parsed = JSON.parse(content);
  const schemaErrors = validateSnapshotSchema(parsed);
  if (schemaErrors.length) throw new Error(`CAPEX web snapshot schema failed:\n${schemaErrors.join("\n")}`);
  fs.mkdirSync(path.dirname(WEB_SNAPSHOT_PATH), { recursive: true });
  fs.writeFileSync(WEB_SNAPSHOT_PATH, content);
  const result = { path: path.relative(projectRoot, WEB_SNAPSHOT_PATH).replaceAll(path.sep, "/"), sha256: sha256(content), bytes: Buffer.byteLength(content) };
  console.log(JSON.stringify(result, null, 2));
  return result;
}

export function checkWebSnapshot() {
  if (!fs.existsSync(WEB_SNAPSHOT_PATH)) throw new Error("CAPEX web snapshot is missing. Run npm run capex:web:sync.");
  const currentManifest = buildContentStateManifest(projectRoot);
  const actual = fs.readFileSync(WEB_SNAPSHOT_PATH, "utf8");
  const stored = JSON.parse(actual);
  if (stored?.meta?.contentStateSha256 !== currentManifest.content_state_sha256) {
    throw new Error(`${staleDiagnostic(stored, currentManifest)}\nRun npm run capex:web:sync and review the generated diff.`);
  }
  const schemaErrors = validateSnapshotSchema(stored);
  if (schemaErrors.length) throw new Error(`CAPEX web snapshot schema failed:\n${schemaErrors.join("\n")}`);
  const expected = serializedSnapshot();
  if (actual !== expected) throw new Error("CAPEX web snapshot content differs despite an identical content_state_sha256; generator output is not deterministic.");
  console.log("Content snapshot is current.");
  if (!capexGovernanceProjectionIsCurrent()) console.log("Governance state changed without content changes.");
  const result = { validation: "OK", path: path.relative(projectRoot, WEB_SNAPSHOT_PATH).replaceAll(path.sep, "/"), sha256: sha256(actual), content_state_sha256: currentManifest.content_state_sha256, source_bundle_sha256: currentManifest.content_state_sha256 };
  console.log(JSON.stringify(result, null, 2));
  return result;
}
