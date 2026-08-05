import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import {
  CAPEX_PRICE_APPROVED_PAYLOAD_PATH,
  CAPEX_PRICE_CHANGE_ID,
  CAPEX_PRICE_ITERATION_ID,
  PRICE_SCENARIOS,
  priceSourceRegistryEntries,
  readPriceResearch,
  uniquePriceQuotes,
  validatePriceResearch,
} from "../src/capex/price-research.js";
import { previewPriceReverse } from "../src/capex/price-workflow.js";
import {
  REMAINING_PRICE_DECISION_ID,
  REMAINING_PRICE_ITERATION_ID,
  REMAINING_PRICE_PAYLOAD_PATH,
} from "../src/capex/remaining-price-workflow.js";
import { CAPEX_REGISTER_SOURCE_SHA256, readRegister, sha256 } from "../src/capex/register.js";

const platform = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const project = path.resolve(platform, "..");
const research = readPriceResearch();
const register = readRegister();

test("preliminary research covers exactly the 51 eligible pilot procurement records", () => {
  assert.deepEqual(validatePriceResearch(research, register), []);
  assert.equal(research.document.status, "research");
  assert.equal(research.document.decision_id, REMAINING_PRICE_DECISION_ID);
  assert.equal(research.document.iteration_id, REMAINING_PRICE_ITERATION_ID);
  assert.equal(research.document.version, "0.4");
  assert.deepEqual(research.scope.included_modules, ["MOD-PREP", "MOD-RETAIL-HOT", "MOD-BAR", "MOD-GROW", "MOD-POS", "MOD-KDS", "MOD-WASH"]);
  assert.equal(research.summary.eligible_procurement_record_count, 51);
  assert.equal(research.summary.priced_record_count, 51);
  assert.equal(research.summary.unpriced_record_count, 0);
  assert.equal(research.summary.quote_required_count, 27);
  assert.deepEqual(research.summary.totals_rub, { minimum: 4085990.33, base: 5488047.33, scale_ready: 6915980.79 });
  const oven = research.items.find(item => item.item_id === "CAPEX-01-009")!;
  assert.deepEqual(PRICE_SCENARIOS.map(scenario => oven.scenarios[scenario]?.quantity), [1, 1, 1]);
  assert.deepEqual(PRICE_SCENARIOS.map(scenario => oven.scenarios[scenario]?.line_total_rub), [300372, 436564, 596030]);
  assert.deepEqual(research.items.filter(item => item.valuation_status !== "priced").map(item => item.item_id), []);
  for (const itemId of ["CAPEX-01-001", "CAPEX-01-002", "CAPEX-01-012", "CAPEX-02-001", "CAPEX-02-002", "CAPEX-02-003", "CAPEX-02-054", "CAPEX-02-055"]) {
    assert.equal(research.items.find(item => item.item_id === itemId)?.quote_status, "quote_required", itemId);
  }
});

test("every stored price has three dated sources and non-purchasable records remain unpriced", () => {
  const priced = register.equipment.filter(item => item.price_base !== null);
  assert.equal(priced.length, 51);
  for (const item of priced) {
    assert.equal(item.currency, "RUB");
    assert.match(item.price_date ?? "", /^2026-08-0[1235]$/);
    assert.match(item.checked_at ?? "", /^2026-08-0[135]T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    assert.equal(Boolean(item.source_url?.startsWith("https://") || item.price_source_type === "owner_approved_research_estimate"), true, item.item_id);
    assert.ok(item.price_min_source_id);
    assert.ok(item.price_base_source_id);
    assert.ok(item.price_max_source_id);
  }
  const forbidden = register.equipment.filter(item => item.item_id.startsWith("CAPEX-05-") || item.inclusion_status === "included_in_parent" || ["component", "engineering_connection", "open_question"].includes(item.record_type));
  assert.equal(forbidden.every(item => item.price_min === null && item.price_base === null && item.price_max === null), true);
  assert.equal(forbidden.filter(item => item.inclusion_status === "included_in_parent" || item.record_type === "component").every(item => item.quote_status === "included_in_parent"), true);
});

test("scenario totals equal source-card unit price multiplied by the research quantity", () => {
  for (const item of research.items.filter(item => item.valuation_status === "priced")) {
    for (const scenario of PRICE_SCENARIOS) {
      const value = item.scenarios[scenario]!;
      assert.equal(value.line_total_rub, Math.round(value.observed_unit_price_rub * value.quantity * 100) / 100, `${item.item_id}.${scenario}`);
    }
  }
  assert.deepEqual(research.summary.module_totals_rub["MOD-PREP"], { minimum: 2051324, base: 3094715, scale_ready: 3877428 });
  assert.deepEqual(research.summary.module_totals_rub["MOD-RETAIL-HOT"], { minimum: 875016, base: 1008877, scale_ready: 1190497 });
  assert.deepEqual(research.summary.module_totals_rub["MOD-BAR"], { minimum: 405749, base: 537354, scale_ready: 753154.46 });
  assert.deepEqual(research.summary.module_totals_rub["MOD-GROW"], { minimum: 238000, base: 258000, scale_ready: 387000 });
  assert.deepEqual(research.summary.module_totals_rub["POS/KDS"], { minimum: 211800, base: 285000, scale_ready: 403800 });
  assert.deepEqual(research.summary.module_totals_rub["MOD-WASH"], { minimum: 304101.33, base: 304101.33, scale_ready: 304101.33 });
});

test("supplier cards and owner-approved estimates are uniquely registered with honest source locations", () => {
  const quotes = uniquePriceQuotes(research);
  const entries = priceSourceRegistryEntries(research);
  assert.equal(quotes.length, 130);
  assert.equal(entries.length, 130);
  assert.equal(new Set(entries.map(item => item.id)).size, 130);
  assert.equal(entries.every(item => (item.location.startsWith("https://") || item.location === REMAINING_PRICE_PAYLOAD_PATH) && /^2026-08-0[135]T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(item.accessed_at)), true);
  const registered = YAML.parse(fs.readFileSync(path.join(platform, "registry", "sources.yaml"), "utf8")).sources as Array<{ id: string }>;
  const registeredIds = new Set(registered.map(item => item.id));
  assert.equal(entries.every(item => registeredIds.has(item.id)), true);

  const payload = path.resolve(project, CAPEX_PRICE_APPROVED_PAYLOAD_PATH);
  const payloadHash = sha256(fs.readFileSync(payload));
  const proposal = YAML.parse(fs.readFileSync(path.join(platform, "changes", "proposals", "PROP-CAPEX-PRICE-RESEARCH-2026-08-02-01.yaml"), "utf8"));
  const manifest = YAML.parse(fs.readFileSync(path.join(platform, "changes", "iterations", `${CAPEX_PRICE_ITERATION_ID}.yaml`), "utf8"));
  const change = YAML.parse(fs.readFileSync(path.join(platform, "changes", `${CAPEX_PRICE_CHANGE_ID}-capex-price-research.yaml`), "utf8"));
  assert.equal(payloadHash, "e1fff4414ce1e6769f8822900ba6153efe4e78520854d92f0a30f932237da0ff");
  assert.equal(proposal.approved_payload_sha256, payloadHash);
  assert.equal(manifest.approved_payload_sha256, payloadHash);
  assert.equal(change.approved_payload_sha256, payloadHash);
  assert.equal(sha256(fs.readFileSync(path.resolve(project, REMAINING_PRICE_PAYLOAD_PATH))), "123b291763b8571d36a5650d9b49d8159839834b574895e666ed943f4089f6d1");
});

test("source CAPEX Markdown is unchanged and reverse preview restores the pre-price file hash", () => {
  const source = fs.readFileSync(path.join(platform, "working", "capex-equipment-specification.md"));
  assert.equal(crypto.createHash("sha256").update(source).digest("hex"), CAPEX_REGISTER_SOURCE_SHA256);
  const receipt = path.join(platform, "changelog", "iteration-receipts", `${CAPEX_PRICE_ITERATION_ID}.yaml`);
  const originalLog = console.log;
  console.log = () => undefined;
  try {
    const reverse = previewPriceReverse(receipt, "CHG-ROLLBACK-PRICE-TEST", "DEC-ROLLBACK-PRICE-TEST");
    assert.equal(reverse.restores_original_hash, true);
    assert.equal(reverse.apply_allowed, false);
    assert.equal(reverse.reverse_change_set.status, "proposed");
    assert.equal(reverse.reverse_change_set.rollback_of, CAPEX_PRICE_CHANGE_ID);
  } finally {
    console.log = originalLog;
  }
});

test("price artifacts contain neither secret-shaped keys nor an approved final CAPEX", () => {
  for (const relative of [
    "working/capex-price-research.yaml",
    "working/capex-equipment-register.yaml",
    `changelog/iteration-receipts/${CAPEX_PRICE_ITERATION_ID}.yaml`,
    `changelog/payloads/${CAPEX_PRICE_ITERATION_ID}-approved.yaml`,
  ]) {
    const text = fs.readFileSync(path.join(platform, relative), "utf8");
    assert.doesNotMatch(text, /refresh_token|client_secret|access_token/i, relative);
    assert.doesNotMatch(text, /status:\s*approved[\s\S]{0,160}итоговый CAPEX/i, relative);
  }
});
