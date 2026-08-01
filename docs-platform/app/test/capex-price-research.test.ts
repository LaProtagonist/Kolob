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
  CAPEX_PRICE_DECISION_ID,
  CAPEX_PRICE_ITERATION_ID,
  PRICE_SCENARIOS,
  priceSourceRegistryEntries,
  readPriceResearch,
  uniquePriceQuotes,
  validatePriceResearch,
} from "../src/capex/price-research.js";
import { previewPriceReverse } from "../src/capex/price-workflow.js";
import { CAPEX_REGISTER_SOURCE_SHA256, readRegister, sha256 } from "../src/capex/register.js";

const platform = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const project = path.resolve(platform, "..");
const research = readPriceResearch();
const register = readRegister();

test("preliminary research covers exactly the 47 eligible food-side procurement records", () => {
  assert.deepEqual(validatePriceResearch(research, register), []);
  assert.equal(research.document.status, "research");
  assert.equal(research.document.decision_id, CAPEX_PRICE_DECISION_ID);
  assert.deepEqual(research.scope.included_modules, ["MOD-PREP", "MOD-RETAIL-HOT", "MOD-BAR", "MOD-GROW", "MOD-POS", "MOD-KDS"]);
  assert.equal(research.summary.eligible_procurement_record_count, 47);
  assert.equal(research.summary.priced_record_count, 39);
  assert.equal(research.summary.unpriced_record_count, 8);
  assert.equal(research.summary.quote_required_count, 23);
  assert.deepEqual(research.summary.totals_rub, { minimum: 2327130, base: 3531329, scale_ready: 4940051.46 });
  assert.deepEqual(research.items.filter(item => item.valuation_status === "quote_required").map(item => item.item_id), [
    "CAPEX-01-001", "CAPEX-01-002", "CAPEX-01-012", "CAPEX-02-001", "CAPEX-02-002", "CAPEX-02-003", "CAPEX-02-054", "CAPEX-02-055",
  ]);
});

test("every stored price has three dated sources and non-purchasable records remain unpriced", () => {
  const priced = register.equipment.filter(item => item.price_base !== null);
  assert.equal(priced.length, 39);
  for (const item of priced) {
    assert.equal(item.currency, "RUB");
    assert.equal(item.price_date, "2026-08-02");
    assert.match(item.checked_at ?? "", /^2026-08-01T22:19:05\.000Z$/);
    assert.match(item.source_url ?? "", /^https:\/\//);
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
  assert.deepEqual(research.summary.module_totals_rub["MOD-PREP"], { minimum: 1452327, base: 2378500, scale_ready: 3260891 });
  assert.deepEqual(research.summary.module_totals_rub["MOD-RETAIL-HOT"], { minimum: 215756, base: 309117, scale_ready: 420737 });
  assert.deepEqual(research.summary.module_totals_rub["MOD-BAR"], { minimum: 209247, base: 300712, scale_ready: 467623.46 });
  assert.deepEqual(research.summary.module_totals_rub["MOD-GROW"], { minimum: 238000, base: 258000, scale_ready: 387000 });
  assert.deepEqual(research.summary.module_totals_rub["POS/KDS"], { minimum: 211800, base: 285000, scale_ready: 403800 });
});

test("supplier cards are uniquely registered with HTTPS locations and the approved payload hash is immutable", () => {
  const quotes = uniquePriceQuotes(research);
  const entries = priceSourceRegistryEntries(research);
  assert.equal(quotes.length, 102);
  assert.equal(entries.length, 102);
  assert.equal(new Set(entries.map(item => item.id)).size, 102);
  assert.equal(entries.every(item => item.location.startsWith("https://") && item.accessed_at === "2026-08-01T22:19:05.000Z"), true);
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
