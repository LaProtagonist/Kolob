import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { platformRoot, writeSecretJson } from "../google/config.js";
import { loadRegistry, readYaml, writeYaml } from "../governance/registry.js";
import { blobAt } from "../governance/util.js";
import { validateInvestorStartModel } from "../investor/start-model.js";
import { buildEquipmentBom, equipmentBomCsv, readModularSources, serializeModularSource, validateModularSources } from "./modular.js";
import { applyPriceResearch, readPriceResearch, recalculatePriceSummary, serializePriceResearch, validatePriceResearch, type CapexPriceResearch, type PriceResearchItem, type PriceScenario } from "./price-research.js";
import { equipmentCsv, readRegister, serializeRegister, sha256, validateRegister, type CapexRegister } from "./register.js";

export const REMAINING_PRICE_ITERATION_ID = "ITR-CAPEX-REMAINING-PRICES-2026-08-05-01";
export const REMAINING_PRICE_PROPOSAL_ID = "PROP-CAPEX-REMAINING-PRICES-2026-08-05-01";
export const REMAINING_PRICE_DECISION_ID = "DEC-015";
export const REMAINING_PRICE_DECISION_CHANGE_ID = "CHG-029";
export const REMAINING_PRICE_CHANGE_ID = "CHG-030";
export const REMAINING_PRICE_SOURCE_ID = "SRC-CAPEX-REMAINING-PRICE-IMPLEMENTATION-BRIEF";
export const REMAINING_PRICE_PAYLOAD_PATH = `docs-platform/changelog/payloads/${REMAINING_PRICE_ITERATION_ID}-approved.yaml`;
export const REMAINING_PRICE_RECEIPT_PATH = `docs-platform/changelog/iteration-receipts/${REMAINING_PRICE_ITERATION_ID}.yaml`;
export const REMAINING_PRICE_GOOGLE_RECEIPT_PATH = "docs-platform/changelog/google-sync/2026-08-05-DOC-CAPEX-EQUIPMENT-REGISTER-REMAINING-PRICES.yaml";

const projectRoot = path.resolve(platformRoot, "..");
const payloadFile = path.join(projectRoot, REMAINING_PRICE_PAYLOAD_PATH);
const proposalFile = path.join(platformRoot, "changes", "proposals", `${REMAINING_PRICE_PROPOSAL_ID}.yaml`);
const iterationFile = path.join(platformRoot, "changes", "iterations", `${REMAINING_PRICE_ITERATION_ID}.yaml`);
const decisionChangeFile = path.join(platformRoot, "changes", `${REMAINING_PRICE_DECISION_CHANGE_ID}-capex-remaining-prices-decision.yaml`);
const mainChangeFile = path.join(platformRoot, "changes", `${REMAINING_PRICE_CHANGE_ID}-capex-remaining-prices.yaml`);
const runtimePreviewFile = path.join(platformRoot, ".runtime", "capex-remaining-prices-preview.json");
const receiptFile = path.join(projectRoot, REMAINING_PRICE_RECEIPT_PATH);
const rollbackRoot = path.join(platformRoot, "changelog", "rollback-payloads", REMAINING_PRICE_ITERATION_ID);
const rollbackManifestFile = path.join(rollbackRoot, "manifest.yaml");

const canonicalTargets = [
  "docs-platform/working/capex-equipment-register.yaml",
  "docs-platform/working/capex-equipment-register.csv",
  "docs-platform/working/capex-price-research.yaml",
  "docs-platform/working/capex-module-items.yaml",
  "docs-platform/working/investor-start-model.yaml",
  "docs-platform/working/configurations/CFG-PILOT-001/equipment-bom.yaml",
  "docs-platform/working/configurations/CFG-PILOT-001/equipment-bom.csv",
] as const;

const implementationTargets = [
  "docs-platform/app/package.json",
  "docs-platform/app/scripts/run-tests.cjs",
  "docs-platform/app/src/capex/remaining-price-workflow.ts",
  "docs-platform/app/src/capex/price-research.ts",
  "docs-platform/app/src/capex/register.ts",
  "docs-platform/app/src/capex/modular.ts",
  "docs-platform/app/src/cli.ts",
  "docs-platform/app/src/governance/git-workflow.ts",
  "docs-platform/app/src/google/capex-register-publisher.ts",
  "docs-platform/app/src/investor/start-model.ts",
  "docs-platform/schemas/capex-price-research.schema.json",
  "docs-platform/schemas/capex-equipment-register.schema.json",
  "src/lib/capex-runtime.ts",
  "src/lib/launch-budget.ts",
  "src/components/LaunchBudget.tsx",
  "scripts/test-site.cjs",
  "docs-platform/app/test/capex-equipment-register.test.ts",
  "docs-platform/app/test/capex-price-research.test.ts",
  "docs-platform/app/test/capex-remaining-prices.test.ts",
  "docs-platform/app/test/capex-sheet-publisher.test.ts",
  "docs-platform/app/test/capex-web-configurator.test.ts",
  "docs-platform/app/test/capex-modular-configurator.test.ts",
  "docs-platform/app/test/investor-start-model.test.ts",
  "src/content/capex-configurator-data.json",
] as const;

type ScenarioPayload = {
  source_id: string;
  product_name: string;
  specification: string;
  quantity: number;
  unit_price_rub: number;
  line_total_rub: number;
};

type ItemPayload = {
  item_id: string;
  canonical_name: string;
  module_id: PriceResearchItem["module_id"];
  quote_status: "quote_required";
  confidence: "high" | "medium" | "low";
  high_risk: boolean;
  source_type: "owner_approved_research_estimate";
  supplier_name: string;
  source_url: string | null;
  source_location: string;
  availability_status: string;
  price_includes_vat: boolean | null;
  delivery_included: boolean | null;
  risk_reason: string;
  notes: string;
  scenarios: Record<PriceScenario, ScenarioPayload>;
};

type BeforeSummary = Pick<CapexPriceResearch["summary"],
  "priced_record_count" | "unpriced_record_count" | "quote_required_count" | "totals_rub" | "module_totals_rub"
>;

type ApprovedPayload = {
  iteration_id: string;
  proposal_id: string;
  decision_id: string;
  change_set_id: string;
  status: "approved";
  approved_at: string;
  checked_at: string;
  currency: "RUB";
  expected_before: Record<string, string>;
  before_summary: BeforeSummary;
  item_updates: ItemPayload[];
  module_item_updates: Array<Record<string, unknown> & { module_id: string; item_id: string }>;
  launch_budget_updates: { equipment_exclusion: Record<string, unknown> & { item_id: string } };
  seating_label_updates: Array<{ id: string; before: string; after: string; square_metres_per_seat: number; aria_label: string }>;
};

function absolute(relativePath: string) {
  const result = path.resolve(projectRoot, relativePath);
  if (!result.startsWith(`${projectRoot}${path.sep}`)) throw new Error(`Path outside project: ${relativePath}.`);
  return result;
}

function fileHash(relativePath: string) {
  const file = absolute(relativePath);
  return fs.existsSync(file) ? sha256(fs.readFileSync(file)) : null;
}

function atomicWrite(file: string, content: string) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temporary, content);
  fs.renameSync(temporary, file);
}

function writeOnceOrSame(file: string, content: string) {
  if (fs.existsSync(file) && fs.readFileSync(file, "utf8") !== content) throw new Error(`Governed artifact already exists with different content: ${path.relative(projectRoot, file)}.`);
  if (!fs.existsSync(file)) atomicWrite(file, content);
}

function loadApprovedPayload() {
  if (!fs.existsSync(payloadFile)) throw new Error(`Approved payload is missing: ${REMAINING_PRICE_PAYLOAD_PATH}.`);
  const serialized = fs.readFileSync(payloadFile, "utf8");
  const payload = YAML.parse(serialized) as ApprovedPayload;
  if (payload.iteration_id !== REMAINING_PRICE_ITERATION_ID || payload.proposal_id !== REMAINING_PRICE_PROPOSAL_ID || payload.decision_id !== REMAINING_PRICE_DECISION_ID || payload.change_set_id !== REMAINING_PRICE_CHANGE_ID || payload.status !== "approved") {
    throw new Error("Approved remaining-price payload identifiers are invalid.");
  }
  if (payload.item_updates.length !== 8 || new Set(payload.item_updates.map(item => item.item_id)).size !== 8) throw new Error("Approved payload must contain exactly eight unique item updates.");
  for (const item of payload.item_updates) for (const [scenario, value] of Object.entries(item.scenarios)) {
    if (value.line_total_rub !== value.unit_price_rub * value.quantity) throw new Error(`${item.item_id}.${scenario}: approved line total differs from unit price × quantity.`);
  }
  return { payload, serialized, sha256: sha256(serialized) };
}

function priceSourceEntries(payload: ApprovedPayload) {
  return payload.item_updates.flatMap(item => Object.entries(item.scenarios).map(([scenario, value]) => ({
    id: value.source_id,
    title: `${value.product_name} · ${scenario}`,
    type: item.source_type,
    location: item.source_url ?? item.source_location,
    publisher: item.supplier_name === "Не определён" ? "project owner" : item.supplier_name,
    publication_date: null,
    accessed_at: payload.checked_at,
    reliability: item.confidence,
    notes: [
      `Research-ориентир из утверждённого payload ${REMAINING_PRICE_ITERATION_ID}.`,
      `Цена единицы: ${value.unit_price_rub} RUB; количество: ${value.quantity}; сумма строки: ${value.line_total_rub} RUB.`,
      `Статус: quote_required. Наличие: ${item.availability_status}.`,
      item.source_url ? `Переданная владельцем техническая ссылка: ${item.source_url}.` : "Точная товарная карточка отсутствует; фиктивный URL не создавался.",
      value.specification,
      item.notes,
    ].join(" "),
  })));
}

function artifacts(payload: ApprovedPayload, payloadSha256: string) {
  const source = {
    id: REMAINING_PRICE_SOURCE_ID,
    title: "Задание на реализацию оставшихся research-цен CAPEX",
    type: "instruction",
    location: "User instruction, 2026-08-05",
    publisher: "project owner",
    publication_date: "2026-08-05",
    accessed_at: "2026-08-05",
    reliability: "primary",
    notes: "Содержит точные цены восьми существующих позиций, условие alcohol_enabled, запрет двойного учёта вытяжного зонта и новые подписи плотности. Интернет-исследование прямо запрещено.",
  };
  const decision = {
    id: REMAINING_PRICE_DECISION_ID,
    title: "Добавить утверждённые research-цены оставшихся позиций CAPEX",
    status: "approved",
    decision: "Добавить точные research-ориентиры восьми существующих позиций, сохранить quote_required, включать CAPEX-02-054 и CAPEX-02-055 только при alcohol_enabled == true, исключить повторное суммирование CAPEX-01-012 на launch-budget и заменить видимые подписи плотности посадки.",
    rationale: "Прямое задание владельца проекта от 2026-08-05. Значения переносятся без интернет-исследования и не утверждают поставщиков, коммерческие предложения, окончательные цены или итоговый CAPEX.",
    affected_documents: ["DOC-CAPEX-EQUIPMENT-REGISTER", "DOC-CAPEX-PRICE-RESEARCH", "DOC-CAPEX-MODULES", "DOC-INVESTOR-START-MODEL"],
    approved_by: "project owner",
    approved_at: "2026-08-05",
    supersedes: null,
    source_ids: [REMAINING_PRICE_SOURCE_ID],
    updated_at: "2026-08-05",
  };
  const proposal = {
    proposal_id: REMAINING_PRICE_PROPOSAL_ID,
    iteration_id: REMAINING_PRICE_ITERATION_ID,
    status: "proposed",
    created_at: "2026-08-05",
    actor: "project owner",
    source_id: REMAINING_PRICE_SOURCE_ID,
    scope: "Реализовать точный approved payload восьми research-цен, условий BOM, launch-budget exclusion и публичных подписей плотности без исследования и без изменения прочих цен или оборудования.",
    affected_document_ids: decision.affected_documents,
    affected_item_ids: payload.item_updates.map(item => item.item_id),
    approved_payload_path: REMAINING_PRICE_PAYLOAD_PATH,
    approved_payload_sha256: payloadSha256,
    boundaries: { approved: payload.item_updates.map(item => item.item_id), not_approved: ["новые позиции", "новые рыночные данные", "окончательный CAPEX"] },
  };
  const manifest = {
    schema_version: 1,
    iteration_id: REMAINING_PRICE_ITERATION_ID,
    proposal_id: REMAINING_PRICE_PROPOSAL_ID,
    decision_id: REMAINING_PRICE_DECISION_ID,
    change_set_id: REMAINING_PRICE_CHANGE_ID,
    status: "approved",
    approved_by: "project owner",
    approved_at: "2026-08-05",
    actor: "project owner",
    scope: proposal.scope,
    approved_payload_path: REMAINING_PRICE_PAYLOAD_PATH,
    approved_payload_sha256: payloadSha256,
    apply_contract: { payload_identity: "exact_structured_payload_sha256", canonical_targets: canonicalTargets, derived_targets: ["src/content/capex-configurator-data.json", "/capex-configurator", "/launch-budget"], google_target: "03 — CAPEX — Реестр оснащения пилотного объекта" },
    rollback_contract: { mode: "governed_reverse_change_set", rollback_payload: `docs-platform/changelog/rollback-payloads/${REMAINING_PRICE_ITERATION_ID}/manifest.yaml`, preserves_history: true, git_reset_forbidden: true },
  };
  const decisionChange = {
    change_id: REMAINING_PRICE_DECISION_CHANGE_ID,
    title: "Зафиксировать решение по оставшимся research-ценам CAPEX",
    status: "approved",
    created_at: "2026-08-05",
    decision_id: "DEC-001",
    iteration_id: REMAINING_PRICE_ITERATION_ID,
    proposal_id: REMAINING_PRICE_PROPOSAL_ID,
    approved_payload_path: REMAINING_PRICE_PAYLOAD_PATH,
    approved_payload_sha256: payloadSha256,
    operations: [{ type: "add", entity: "sources", value: source }, { type: "add", entity: "decisions", value: decision }],
  };
  const mainChange = {
    change_id: REMAINING_PRICE_CHANGE_ID,
    title: "Применить research-цены восьми позиций CAPEX",
    status: "approved",
    created_at: "2026-08-05",
    decision_id: REMAINING_PRICE_DECISION_ID,
    iteration_id: REMAINING_PRICE_ITERATION_ID,
    proposal_id: REMAINING_PRICE_PROPOSAL_ID,
    approved_payload_path: REMAINING_PRICE_PAYLOAD_PATH,
    approved_payload_sha256: payloadSha256,
    operations: [
      ...priceSourceEntries(payload).map(value => ({ type: "add", entity: "sources", value })),
      { type: "update", entity: "documents", id: "DOC-CAPEX-EQUIPMENT-REGISTER", value: { updated_at: "2026-08-05" } },
      { type: "update", entity: "documents", id: "DOC-CAPEX-PRICE-RESEARCH", value: { version: "0.4", updated_at: "2026-08-05" } },
      { type: "update", entity: "documents", id: "DOC-CAPEX-MODULES", value: { updated_at: "2026-08-05" } },
      { type: "update", entity: "documents", id: "DOC-INVESTOR-START-MODEL", value: { updated_at: "2026-08-05" } },
    ],
  };
  return { proposal, manifest, decisionChange, mainChange };
}

function captureRollbackTargets() {
  const previous = fs.existsSync(rollbackManifestFile) ? readYaml(rollbackManifestFile) as any : null;
  const existingTargets = new Map<string, any>((previous?.targets ?? []).map((target: any) => [target.path, target]));
  const targets = [...new Set([...canonicalTargets, ...implementationTargets])].map(relativePath => {
    const existing = existingTargets.get(relativePath);
    if (existing) return existing;
    const before = blobAt("HEAD", relativePath);
    const existed = before !== null;
    const destination = path.join(rollbackRoot, "files", relativePath);
    if (existed) {
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.writeFileSync(destination, before);
    }
    return { path: relativePath, existed, before_sha256: before ? sha256(before) : null, rollback_payload_path: existed ? path.relative(projectRoot, destination).replaceAll(path.sep, "/") : null };
  });
  writeYaml(rollbackManifestFile, {
    schema_version: 1,
    iteration_id: REMAINING_PRICE_ITERATION_ID,
    source_change_set: REMAINING_PRICE_CHANGE_ID,
    captured_before_apply: true,
    targets,
    registry_reverse_receipts: [`docs-platform/changelog/change-receipts/${REMAINING_PRICE_CHANGE_ID}.yaml`, `docs-platform/changelog/change-receipts/${REMAINING_PRICE_DECISION_CHANGE_ID}.yaml`],
    derived_refresh: { command: "npm run capex:web:sync", target: "src/content/capex-configurator-data.json" },
    reverse_operation_order: ["restore file targets", "refresh deterministic snapshot", "apply approved registry reverse change set", "validate", "verify"],
    preserves_history: true,
    git_reset_forbidden: true,
  });
}

export function writeRemainingPriceArtifacts() {
  const approved = loadApprovedPayload();
  const built = artifacts(approved.payload, approved.sha256);
  writeOnceOrSame(proposalFile, YAML.stringify(built.proposal, { lineWidth: 0 }));
  writeOnceOrSame(iterationFile, YAML.stringify(built.manifest, { lineWidth: 0 }));
  writeOnceOrSame(decisionChangeFile, YAML.stringify(built.decisionChange, { lineWidth: 0 }));
  writeOnceOrSame(mainChangeFile, YAML.stringify(built.mainChange, { lineWidth: 0 }));
  captureRollbackTargets();
  const result = { payload: REMAINING_PRICE_PAYLOAD_PATH, sha256: approved.sha256, proposal: path.relative(projectRoot, proposalFile), manifest: path.relative(projectRoot, iterationFile), decision_change: path.relative(projectRoot, decisionChangeFile), change_set: path.relative(projectRoot, mainChangeFile), rollback_payload: path.relative(projectRoot, rollbackManifestFile) };
  console.log(JSON.stringify(result, null, 2));
  return result;
}

function verifyBefore(payload: ApprovedPayload) {
  const mismatches = Object.entries(payload.expected_before).filter(([relativePath, expected]) => fileHash(relativePath) !== expected);
  if (mismatches.length) throw new Error(`Canonical before-state mismatch: ${mismatches.map(([file, expected]) => `${file} expected=${expected} actual=${fileHash(file)}`).join("; ")}.`);
}

function transformed(payload: ApprovedPayload) {
  const register = readRegister();
  const research = readPriceResearch();
  const modular = readModularSources();
  const investorPath = absolute("docs-platform/working/investor-start-model.yaml");
  const investor = YAML.parse(fs.readFileSync(investorPath, "utf8"));
  const currentBeforeSummary: BeforeSummary = {
    priced_record_count: research.summary.priced_record_count,
    unpriced_record_count: research.summary.unpriced_record_count,
    quote_required_count: research.summary.quote_required_count,
    totals_rub: research.summary.totals_rub,
    module_totals_rub: Object.fromEntries(Object.keys(payload.before_summary.module_totals_rub).map(moduleId => [
      moduleId,
      research.summary.module_totals_rub[moduleId],
    ])),
  };
  if (JSON.stringify(currentBeforeSummary) !== JSON.stringify(payload.before_summary)) throw new Error("Current price summary differs from the approved before-state.");
  const updates = new Map(payload.item_updates.map(item => [item.item_id, item]));
  for (const [itemId, update] of updates) {
    const registerItem = register.equipment.find(item => item.item_id === itemId);
    const researchItem = research.items.find(item => item.item_id === itemId);
    if (!registerItem || !researchItem) throw new Error(`Missing approved item ${itemId}.`);
    if (registerItem.name !== update.canonical_name) throw new Error(`${itemId}: canonical name differs from approved payload.`);
    if (researchItem.valuation_status !== "quote_required" || Object.values(researchItem.scenarios).some(Boolean)) throw new Error(`${itemId}: expected an unpriced quote_required before-state.`);
    researchItem.valuation_status = "priced";
    researchItem.quote_status = "quote_required";
    researchItem.high_risk = update.high_risk;
    researchItem.risk_reason = update.risk_reason;
    researchItem.notes = update.notes;
    const scenarioValue = (scenario: PriceScenario) => {
      const value = update.scenarios[scenario];
      return {
        source_id: value.source_id,
        source_type: update.source_type,
        source_location: update.source_location,
        supplier_name: update.supplier_name,
        product_name: value.product_name,
        source_url: update.source_url,
        additional_urls: [],
        observed_unit_price_rub: value.unit_price_rub,
        availability_status: update.availability_status,
        checked_at: payload.checked_at,
        price_includes_vat: update.price_includes_vat,
        delivery_included: update.delivery_included,
        confidence: update.confidence,
        notes: `${value.specification} ${update.notes}`,
        quantity: value.quantity,
        quantity_basis: "research_assumption" as const,
        line_total_rub: value.line_total_rub,
      };
    };
    researchItem.scenarios = {
      minimum: scenarioValue("minimum"),
      base: scenarioValue("base"),
      scale_ready: scenarioValue("scale_ready"),
    };
    registerItem.quantity_min = update.scenarios.minimum.quantity;
    registerItem.quantity_base = update.scenarios.base.quantity;
    registerItem.quantity_scale_ready = update.scenarios.scale_ready.quantity;
  }
  research.document.version = "0.4";
  research.document.decision_id = payload.decision_id;
  research.document.iteration_id = payload.iteration_id;
  research.document.proposal_id = payload.proposal_id;
  research.document.checked_at = payload.checked_at;
  research.document.source_register_before_sha256 = payload.expected_before["docs-platform/working/capex-equipment-register.yaml"];
  research.document.warning = "Цены имеют статус research и quote_required; они перенесены из утверждённого владельцем payload без нового интернет-исследования и не являются коммерческими предложениями или окончательным CAPEX.";
  research.summary = recalculatePriceSummary(research.items);
  const pricedRegister = applyPriceResearch(register, research);
  pricedRegister.document.decision_id = payload.decision_id;
  pricedRegister.document.iteration_id = payload.iteration_id;
  pricedRegister.document.proposal_id = payload.proposal_id;
  pricedRegister.document.price_research_date = payload.approved_at;
  pricedRegister.document.priced_record_count = research.summary.priced_record_count;
  pricedRegister.document.unpriced_procurement_record_count = research.summary.unpriced_record_count;

  modular.module_items.document.decision_id = payload.decision_id;
  modular.module_items.document.iteration_id = payload.iteration_id;
  modular.module_items.document.proposal_id = payload.proposal_id;
  for (const update of payload.module_item_updates) {
    const link = modular.module_items.links.find(item => item.module_id === update.module_id && item.item_id === update.item_id);
    if (!link) throw new Error(`Missing module-item link ${update.module_id}/${update.item_id}.`);
    Object.assign(link, update);
  }

  investor.document.decision_id = payload.decision_id;
  investor.document.iteration_id = payload.iteration_id;
  investor.document.proposal_id = payload.proposal_id;
  investor.document.updated_at = payload.approved_at;
  const priceBasis = investor.basis?.documents?.find((item: any) => item.document_id === "DOC-CAPEX-PRICE-RESEARCH");
  if (priceBasis) priceBasis.version = "0.4";
  const exclusion = payload.launch_budget_updates.equipment_exclusion;
  const exclusions = investor.point_configuration.equipment_exclusions as Array<Record<string, unknown>>;
  const existingExclusion = exclusions.find(item => item.item_id === exclusion.item_id);
  if (existingExclusion) Object.assign(existingExclusion, exclusion);
  else exclusions.push(exclusion);
  for (const update of payload.seating_label_updates) {
    const profile = investor.seating.profiles.find((item: any) => item.id === update.id);
    if (!profile || profile.label !== update.before || profile.square_metres_per_seat !== update.square_metres_per_seat) throw new Error(`Seating profile ${update.id} differs from approved before-state.`);
    profile.label = update.after;
    profile.aria_label = update.aria_label;
  }
  return { register: pricedRegister, research, modular, investor };
}

function computePreview() {
  const approved = loadApprovedPayload();
  verifyBefore(approved.payload);
  const next = transformed(approved.payload);
  const errors = [
    ...validateRegister(next.register),
    ...validatePriceResearch(next.research, next.register),
    ...validateModularSources(next.register, next.modular),
  ];
  if (errors.length) throw new Error(errors.join("\n"));
  const after = {
    "docs-platform/working/capex-equipment-register.yaml": sha256(serializeRegister(next.register)),
    "docs-platform/working/capex-equipment-register.csv": sha256(equipmentCsv(next.register)),
    "docs-platform/working/capex-price-research.yaml": sha256(serializePriceResearch(next.research)),
    "docs-platform/working/capex-module-items.yaml": sha256(serializeModularSource(next.modular.module_items)),
    "docs-platform/working/investor-start-model.yaml": sha256(YAML.stringify(next.investor, { lineWidth: 0 })),
  };
  return {
    iteration_id: REMAINING_PRICE_ITERATION_ID,
    proposal_id: REMAINING_PRICE_PROPOSAL_ID,
    decision_id: REMAINING_PRICE_DECISION_ID,
    change_set_id: REMAINING_PRICE_CHANGE_ID,
    approved_payload: { path: REMAINING_PRICE_PAYLOAD_PATH, sha256: approved.sha256 },
    before: approved.payload.expected_before,
    after,
    before_summary: approved.payload.before_summary,
    after_summary: next.research.summary,
    item_ids: approved.payload.item_updates.map(item => item.item_id),
    writes: false,
    validation: "passed",
  };
}

export function previewRemainingPriceIteration() {
  const preview = computePreview();
  writeSecretJson(runtimePreviewFile, preview);
  console.log(JSON.stringify(preview, null, 2));
  return preview;
}

export function applyRemainingPriceIteration(options: { apply: boolean; decisionId: string }) {
  if (!options.apply || options.decisionId !== REMAINING_PRICE_DECISION_ID) throw new Error(`Apply requires --apply --decision ${REMAINING_PRICE_DECISION_ID}.`);
  const registry = loadRegistry();
  if (!registry.decisions.some(item => item.id === REMAINING_PRICE_DECISION_ID && item.status === "approved")) throw new Error(`${REMAINING_PRICE_DECISION_ID} is not approved.`);
  if (!fs.existsSync(runtimePreviewFile)) throw new Error("Remaining-price preview is missing.");
  if (fs.existsSync(receiptFile)) throw new Error("Remaining-price iteration was already applied.");
  const saved = JSON.parse(fs.readFileSync(runtimePreviewFile, "utf8"));
  const current = computePreview();
  if (JSON.stringify(saved) !== JSON.stringify(current)) throw new Error("Approved payload or target state changed after preview.");
  if (!fs.existsSync(rollbackManifestFile)) throw new Error("Rollback payload was not captured before implementation changes.");
  const approved = loadApprovedPayload();
  const next = transformed(approved.payload);
  const targetContents = new Map<string, string>([
    ["docs-platform/working/capex-equipment-register.yaml", serializeRegister(next.register)],
    ["docs-platform/working/capex-equipment-register.csv", equipmentCsv(next.register)],
    ["docs-platform/working/capex-price-research.yaml", serializePriceResearch(next.research)],
    ["docs-platform/working/capex-module-items.yaml", serializeModularSource(next.modular.module_items)],
    ["docs-platform/working/investor-start-model.yaml", YAML.stringify(next.investor, { lineWidth: 0 })],
  ]);
  for (const [relativePath, content] of targetContents) atomicWrite(absolute(relativePath), content);
  const bom = buildEquipmentBom("CFG-PILOT-001", next.register, next.modular);
  atomicWrite(absolute("docs-platform/working/configurations/CFG-PILOT-001/equipment-bom.yaml"), YAML.stringify(bom, { lineWidth: 0 }));
  atomicWrite(absolute("docs-platform/working/configurations/CFG-PILOT-001/equipment-bom.csv"), equipmentBomCsv(bom));
  const validation = [
    ...validateRegister(readRegister()),
    ...validatePriceResearch(readPriceResearch(), readRegister()),
    ...validateModularSources(readRegister(), readModularSources()),
    ...validateInvestorStartModel(),
  ];
  if (validation.length) throw new Error(validation.join("\n"));
  const afterFiles = [...targetContents.keys(), "docs-platform/working/configurations/CFG-PILOT-001/equipment-bom.yaml", "docs-platform/working/configurations/CFG-PILOT-001/equipment-bom.csv"].map(relativePath => ({ path: relativePath, sha256: fileHash(relativePath) }));
  const receipt = {
    receipt_version: 1,
    iteration_id: REMAINING_PRICE_ITERATION_ID,
    proposal_id: REMAINING_PRICE_PROPOSAL_ID,
    decision_id: REMAINING_PRICE_DECISION_ID,
    change_set_id: REMAINING_PRICE_CHANGE_ID,
    status: "applied",
    applied_at: new Date().toISOString(),
    actor: "Codex",
    tool: "docs-platform capex:remaining-prices:apply",
    approved_payload: current.approved_payload,
    before_files: Object.entries(approved.payload.expected_before).map(([relativePath, hash]) => ({ path: relativePath, sha256: hash })),
    after_files: afterFiles,
    before_summary: approved.payload.before_summary,
    after_summary: next.research.summary,
    item_ids: approved.payload.item_updates.map(item => item.item_id),
    validation_result: "passed",
    git_commit_hash: null,
    google_sync_receipt: null,
    deployment_receipt: null,
    rollback: { mode: "governed_reverse_change_set", rollback_payload: path.relative(projectRoot, rollbackManifestFile).replaceAll(path.sep, "/"), preview_command: `npm run capex:remaining-prices:reverse:preview -- ../changelog/iteration-receipts/${REMAINING_PRICE_ITERATION_ID}.yaml --change-id CHG-ROLLBACK-XXX --decision DEC-ROLLBACK-XXX`, preserves_history: true, git_reset_forbidden: true },
  };
  writeYaml(receiptFile, receipt);
  console.log(JSON.stringify({ apply: "OK", receipt: REMAINING_PRICE_RECEIPT_PATH, after_summary: next.research.summary }, null, 2));
  return receipt;
}

export function previewRemainingPriceReverse(receiptPath = receiptFile, changeId = "CHG-ROLLBACK-CAPEX-REMAINING-PRICES", decisionId = "DEC-ROLLBACK-CAPEX-REMAINING-PRICES") {
  const receipt = readYaml(path.resolve(receiptPath));
  const manifest = readYaml(rollbackManifestFile);
  const targets = manifest.targets as Array<{ path: string; existed: boolean; before_sha256: string | null; rollback_payload_path: string | null }>;
  const operations = targets.map(target => ({
    type: target.existed ? "restore_file" : "remove_generated_file",
    path: target.path,
    payload_path: target.rollback_payload_path,
    expected_current_sha256: fileHash(target.path),
    restored_sha256: target.before_sha256,
  }));
  const result = {
    reverse_change_set: { change_id: changeId, decision_id: decisionId, status: "proposed", rollback_of: REMAINING_PRICE_CHANGE_ID, iteration_id: `${REMAINING_PRICE_ITERATION_ID}-ROLLBACK`, operations },
    source_receipt: path.relative(projectRoot, path.resolve(receiptPath)).replaceAll(path.sep, "/"),
    approved_payload_sha256: receipt.approved_payload.sha256,
    restores_original_hash: operations.every(operation => operation.type === "remove_generated_file" || Boolean(operation.payload_path && fs.existsSync(absolute(operation.payload_path)) && fileHash(operation.payload_path) === operation.restored_sha256)),
    apply_allowed: false,
    history_preserved: true,
    git_reset_used: false,
  };
  console.log(YAML.stringify(result, { lineWidth: 0 }));
  return result;
}
