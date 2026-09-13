/* Read-only source extraction. --write only writes the NEW Control reference snapshot.
 * --check compares exact source hashes/values without modifying canonical data. */
const fs = require("node:fs");
const crypto = require("node:crypto");
const path = require("node:path");
const YAML = require("../docs-platform/app/node_modules/yaml");
const root = path.resolve(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const yaml = (p) => YAML.parse(read(p));
const f = yaml("docs-platform/working/financial-model.yaml");
const r = yaml("docs-platform/working/revenue-model.yaml");
const pilot = yaml("docs-platform/working/pilot-capex-assumptions.yaml");
const projection = JSON.parse(
  read("docs-platform/generated/financial-model-projection.json"),
);
const sources = [
  [
    "financial",
    "Финансовая модель",
    "docs-platform/working/financial-model.yaml",
  ],
  [
    "revenue",
    "Модель объёма продаж",
    "docs-platform/working/revenue-model.yaml",
  ],
  [
    "register",
    "Реестр оборудования",
    "docs-platform/working/capex-equipment-register.yaml",
  ],
  [
    "specification",
    "Спецификация оборудования",
    "docs-platform/working/capex-equipment-specification.md",
  ],
  [
    "start",
    "Стартовая инвестиционная модель",
    "docs-platform/working/investor-start-model.yaml",
  ],
  [
    "network",
    "Допущения развития сети",
    "docs-platform/working/network-planning-assumptions.yaml",
  ],
  [
    "franchise",
    "Параметры франшизы",
    "docs-platform/working/franchise-platform-parameters.yaml",
  ],
  [
    "petrogradka",
    "Сценарий готового производства",
    "docs-platform/scenarios/petrogradka-ready-production-base.yaml",
  ],
  [
    "v01",
    "Задание и рабочий сценарий v0.1",
    "docs-platform/working/franchise-model-v0.1.json",
  ],
  [
    "pilot",
    "Ранние допущения пилотного объекта",
    "docs-platform/working/pilot-capex-assumptions.yaml",
  ],
  [
    "projection",
    "Расчёт старой финансовой модели",
    "docs-platform/generated/financial-model-projection.json",
  ],
  [
    "assumptions",
    "Реестр допущений",
    "docs-platform/registry/assumptions.yaml",
  ],
].map(([id, title, path]) => ({
  id,
  title,
  path,
  sha256: crypto.createHash("sha256").update(read(path)).digest("hex"),
}));
const entry = (id) => f.opex.entries.find((e) => e.id === id);
const values = {},
  provenance = {};
function add(id, value, source, selector, assumptionId, note = "") {
  values[id] = value;
  provenance[id] = {
    source,
    selector,
    assumptionId: assumptionId || null,
    note,
  };
}
add(
  "rent",
  entry("RENT").amount_rub,
  "financial",
  "opex.entries[RENT].amount_rub",
  "ASM-FINANCIAL-OPEX",
  "Ранний ориентир совмещённого объекта; цена нового помещения не подтверждена.",
);
add(
  "deposit",
  f.real_estate.scenarios.rent.security_deposit_months,
  "financial",
  "real_estate.scenarios.rent.security_deposit_months",
  "ASM-FINANCIAL-REAL-ESTATE",
);
add(
  "equipment",
  projection.launch_capital.equipment_rub,
  "projection",
  "launch_capital.equipment_rub",
  "ASM-FINANCIAL-CAPEX-CONFIG",
  "Старая комплектация; новый состав рассчитывается из выбранных позиций.",
);
add(
  "furniture",
  projection.launch_capital.furniture_rub,
  "projection",
  "launch_capital.furniture_rub",
  "ASM-INVESTOR-START-FURNITURE",
  "Стоимость старой конфигурации на 50 мест, не автоматический результат площади нового узла.",
);
for (const [id, key] of Object.entries({
  video: "video_surveillance_rub",
  alarm: "alarm_rub",
  launch: "launch_marketing_rub",
  uniforms: "initial_uniform_rub",
  inventory: "initial_inventory_rub",
}))
  add(
    id,
    f.launch_investment[key],
    "financial",
    `launch_investment.${key}`,
    null,
  );
add(
  "utilities",
  entry("UTILITIES").amount_rub,
  "financial",
  "opex.entries[UTILITIES].amount_rub",
  "ASM-FINANCIAL-OPEX",
);
add(
  "recurring",
  pilot.software.amount_rub_per_year / 12,
  "pilot",
  "software.amount_rub_per_year / 12",
  "ASM-PILOT-SOFTWARE",
  "120 тыс. ₽/год — ранняя исследовательская оценка; не полная стоимость новой платформы.",
);
for (const id of ["own_check", "franchise_check"])
  add(
    id,
    r.product_model.average_check_rub,
    "revenue",
    "product_model.average_check_rub",
    "ASM-REVENUE-AVERAGE-CHECK",
  );
add(
  "raw",
  f.food_cost.protected_formula.raw_materials_rate,
  "financial",
  "food_cost.protected_formula.raw_materials_rate",
  "ASM-FINANCIAL-FOOD-COST",
);
add(
  "waste",
  f.food_cost.waste.default_rate,
  "financial",
  "food_cost.waste.default_rate",
  "ASM-FINANCIAL-FOOD-COST",
  "Доля стоимости сырья, не доля выручки.",
);
add(
  "packaging",
  f.packaging.baseline_monthly_rub /
    (f.packaging.baseline_checks_per_day * f.model.days_per_month),
  "financial",
  "packaging.baseline_monthly_rub / (packaging.baseline_checks_per_day × model.days_per_month)",
  "ASM-FINANCIAL-FOOD-COST",
);
add(
  "own_acquiring",
  entry("ACQUIRING").rate_of_gross_revenue,
  "financial",
  "opex.entries[ACQUIRING].rate_of_gross_revenue",
  "ASM-FINANCIAL-OPEX",
  "В старом источнике база — выручка до косвенных налогов. Здесь справочный расчёт при их отсутствии; преобразование валовой выручки требует уточнения.",
);
add(
  "own_household_per_check",
  entry("HOUSEHOLD").variable_amount_rub /
    (entry("HOUSEHOLD").baseline_checks_per_day * f.model.days_per_month),
  "financial",
  "opex.entries[HOUSEHOLD].variable_amount_rub / (baseline_checks_per_day × model.days_per_month)",
  "ASM-FINANCIAL-OPEX",
  "Только переменная часть; постоянная часть задаётся отдельно.",
);
add(
  "own_marketing_rate",
  entry("MARKETING").rate_of_net_revenue,
  "financial",
  "opex.entries[MARKETING].rate_of_net_revenue",
  "ASM-FINANCIAL-OPEX",
  "Переменная часть для собственной точки. Центральные 150 тыс. ₽/мес. не прибавляются повторно.",
);
add(
  "own_service_rate",
  entry("EQUIPMENT_SERVICE").amount_rub /
    projection.launch_capital.equipment_rub,
  "financial",
  "opex.entries[EQUIPMENT_SERVICE].amount_rub / legacy equipment",
  "ASM-FINANCIAL-OPEX",
  "Месячный сервис пропорционально оборудованию торговой функции; методика старого сетевого расчёта.",
);
add(
  "tax_profit",
  f.tax.scenarios.base.usn_income_less_expenses_rate,
  "financial",
  "tax.scenarios.base.usn_income_less_expenses_rate",
  "ASM-FINANCIAL-TAX-PROXY",
);
add(
  "tax_sales",
  f.tax.scenarios.base.minimum_usn_income_rate,
  "financial",
  "tax.scenarios.base.minimum_usn_income_rate",
  "ASM-FINANCIAL-TAX-PROXY",
);
add(
  "maintenance_rate",
  f.maintenance_capex.annual_rate,
  "financial",
  "maintenance_capex.annual_rate",
  null,
  "Оборудование и мебель; новые цифровые активы и расходы расширения требуют отдельной оценки.",
);
const assumptionIds = new Set(
  yaml("docs-platform/registry/assumptions.yaml").assumptions.map((a) => a.id),
);
for (const p of Object.values(provenance))
  if (p.assumptionId && !assumptionIds.has(p.assumptionId))
    throw Error("Unknown assumption ID: " + p.assumptionId);
const target = "docs-platform/generated/franchise-model-reference-data.json";
const snapshot = {
  schemaVersion: 1,
  status: "research",
  sources,
  values,
  provenance,
  ramp: f.model.ramp_up_profile,
  seasonality: f.model.seasonality_profile,
  temporalSource: {
    source: "financial",
    rampSelector: "model.ramp_up_profile",
    seasonalitySelector: "model.seasonality_profile",
    note: "Профиль находится в Financial Model, использующей Revenue Model. Это справочный перенос; исходники не меняются.",
  },
};
const output = JSON.stringify(snapshot, null, 2) + "\n";
if (process.argv.includes("--write")) {
  fs.writeFileSync(path.join(root, target), output);
  console.log(
    "New Control reference snapshot written; canonical sources unchanged.",
  );
} else {
  if (read(target) !== output)
    throw Error("Franchise reference snapshot differs from canonical sources");
  console.log(
    `Franchise references: PASS (${sources.length} sources, ${Object.keys(values).length} values)`,
  );
}
