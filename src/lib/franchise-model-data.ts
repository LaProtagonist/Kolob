import ref from "../../docs-platform/generated/franchise-model-reference-data.json";
import config from "../../docs-platform/working/franchise-model-v0.2.json";
import type {
  Scenario,
  Parameter,
  DataState,
  IntegrationSettings,
  Point,
} from "./franchise-model-types";
import { defaultBom, equipmentBom } from "./franchise-model-bom";
import { calculateManagementTax } from "./financial-core";
import { monthlyMaintenanceCapex } from "./financial-assets";
export const referenceData = ref;
export const referenceValues = ref.values as Record<string, number>;
export const referenceProvenance = ref.provenance as Record<
  string,
  {
    source: string;
    selector: string;
    assumptionId: string | null;
    note: string;
  }
>;
export const sourceById = (id: string) => ref.sources.find((s) => s.id === id);
export const v02Config = config;
const extra = (
  id: string,
  label: string,
  value: number | null,
  unit: string,
  group: string,
  note: string,
  status: Parameter["status"] = "WORKING",
): Parameter => ({
  id,
  label,
  value,
  unit,
  group,
  note,
  status,
  assumptionId: `ASM-FRANCHISE-MODEL-V02-${id.replaceAll("_", "-").toUpperCase()}`,
  source: "Задание владельца: модель сети и франшизы, версия 0.2",
  kind: unit === "%" ? "percent" : "number",
  min: 0,
  max: unit === "%" ? 1 : null,
  presets: [],
  required: false,
});
export const integrationParameters: Parameter[] = [
  extra(
    "own_acquiring",
    "Эквайринг",
    referenceValues.own_acquiring,
    "%",
    "own_ops",
    "Справочная ставка из старой модели; используется при отсутствии косвенных налогов.",
    "REFERENCE",
  ),
  extra(
    "own_household_per_check",
    "Хозяйственные расходы на чек",
    referenceValues.own_household_per_check,
    "₽/чек",
    "own_ops",
    "Переменная часть старой формулы: 50 тыс. ₽ при 9 тыс. чеков в месяц.",
    "REFERENCE",
  ),
  extra(
    "own_household_fixed",
    "Постоянные хозяйственные расходы точки",
    null,
    "₽/мес.",
    "own_ops",
    "Старая сумма для совмещённого объекта не переносится на компактную точку автоматически.",
    "MISSING",
  ),
  extra(
    "own_service_rate",
    "Сервис оборудования: доля стоимости в месяц",
    referenceValues.own_service_rate,
    "%",
    "own_ops",
    "Старые 100 тыс. ₽ пропорционально стоимости оборудования торговой функции; не поддерживающие инвестиции.",
    "REFERENCE",
  ),
  extra(
    "own_utilities",
    "Коммунальные расходы отдельной точки",
    null,
    "₽/мес.",
    "own_ops",
    "Встроенная точка использует уже учтённые коммунальные расходы узла.",
    "MISSING",
  ),
  extra(
    "own_marketing_rate",
    "Локальный переменный маркетинг",
    referenceValues.own_marketing_rate,
    "%",
    "own_ops",
    "Переменная часть старой формулы. Центральный фиксированный маркетинг уже включён в расходы узла.",
    "REFERENCE",
  ),
  extra(
    "own_admin",
    "Административные расходы отдельной точки",
    null,
    "₽/мес.",
    "own_ops",
    "Для встроенной точки центральная функция уже учтена в накладных расходах узла; для отдельной нужна оценка.",
    "MISSING",
  ),
  extra(
    "own_other",
    "Другие расходы точки",
    0,
    "₽/мес.",
    "own_ops",
    "Рабочая настройка: дополнительные статьи пока не добавлены.",
  ),
  extra(
    "maintenance_extra",
    "Поддержание новых цифровых активов",
    null,
    "₽/мес.",
    "investor",
    "Справочная формула оборудования и мебели не покрывает разработку платформы и вычислительную инфраструктуру.",
    "MISSING",
  ),
  extra(
    "maintenance_growth",
    "Поддержание активов расширения",
    null,
    "₽/мес.",
    "investor",
    "Применяется при инвестициях в расширение/отдельные собственные точки: состав и срок службы активов требуют оценки.",
    "MISSING",
  ),
];
export function defaultIntegration(): IntegrationSettings {
  return {
    version: 2,
    equipmentMode: "bom",
    nodeBom: defaultBom("node"),
    franchiseBom: defaultBom("franchise"),
    bar: false,
    grow: false,
    taxMode: "reference",
    maintenanceMode: "reference",
    ownOpexMode: "structured",
    seasonality: true,
    calendarStartMonth: 1,
  };
}
export function externalOwnNeeded(s: Scenario) {
  const own = s.rollout.filter(
    (p) => p.active && p.type === "OWN" && p.month <= (s.inputs.horizon ?? 60),
  );
  return s.inputs.embedded !== 1 || own.length > 1;
}
export function notApplicable(s: Scenario, id: string): string | null {
  if (
    [
      "own_external_rent",
      "own_growth_capex",
      "own_utilities",
      "own_admin",
    ].includes(id) &&
    !externalOwnNeeded(s)
  )
    return "Торговая функция встроена в первый узел; отдельное помещение не используется.";
  if (id === "post_cap_share" && s.inputs.equity === 0)
    return "Долевое участие после предела выплат выключено.";
  if (s.integration) {
    if (id === "own_local" && s.integration.ownOpexMode === "structured")
      return "Расходы рассчитываются по отдельным статьям.";
    if (id === "maintenance" && s.integration.maintenanceMode === "reference")
      return "Используется справочная формула поддержания активов.";
    if (
      id === "maintenance_extra" &&
      ((s.inputs.software_v1 ?? 0) + (s.inputs.computing ?? 0) === 0 ||
        s.integration.maintenanceMode !== "reference")
    )
      return "Новые цифровые активы отсутствуют либо используется общий ручной бюджет.";
    if (
      id === "maintenance_growth" &&
      (s.integration.maintenanceMode !== "reference" ||
        (!s.expansions.some((e) => e.month <= (s.inputs.horizon ?? 60)) &&
          !externalOwnNeeded(s)))
    )
      return "Инвестиции в расширение или отдельные собственные объекты не заданы.";
  }
  return null;
}
export function inputState(s: Scenario, p: Parameter): DataState {
  const reason = notApplicable(s, p.id);
  if (reason) return { kind: "not_applicable", reason };
  if (p.id === "equipment" && s.integration?.equipmentMode === "bom") {
    const b = equipmentBom(s, "node");
    return b.complete
      ? { kind: "value", value: b.knownTotal, status: "DERIVED" }
      : {
          kind: "missing",
          reason: "Не все выбранные позиции оборудования оценены.",
        };
  }
  const value = s.inputs[p.id] ?? null;
  if (
    value !== null &&
    ["tax_profit", "tax_sales"].includes(p.id) &&
    s.integration?.taxMode === "reference" &&
    !s.edited.includes(p.id)
  )
    return { kind: "value", value, status: "REFERENCE" };
  if (value === null || (p.status === "MISSING" && !s.edited.includes(p.id)))
    return { kind: "missing", reason: p.note || "Требуется значение." };
  return {
    kind: "value",
    value,
    status: s.edited.includes(p.id)
      ? "WORKING"
      : p.status === "MISSING"
        ? "WORKING"
        : p.status === "NOT_APPLICABLE"
          ? "WORKING"
          : p.status,
  };
}
export function effectiveEquipment(s: Scenario) {
  return s.integration?.equipmentMode === "bom"
    ? equipmentBom(s, "node").knownTotal
    : s.inputs.equipment!;
}
export function ownLocalCosts(
  s: Scenario,
  sales: number,
  checks: number,
  embedded: boolean,
) {
  const bom = equipmentBom(s, "node");
  const retailAssets =
    s.integration?.equipmentMode === "manual"
      ? null
      : bom.breakdown
          .filter((b) => ["retail", "bar"].includes(b.group))
          .reduce((a, b) => a + b.amount, 0);
  const rate = (id: string, base: number) =>
    s.inputs[id] == null ? null : base * s.inputs[id];
  const lines = [
    {
      id: "own_acquiring",
      label: "Эквайринг",
      amount: rate("own_acquiring", sales),
    },
    {
      id: "own_household_per_check",
      label: "Хозяйственные расходы: переменная часть",
      amount: rate("own_household_per_check", checks),
    },
    {
      id: "own_household_fixed",
      label: "Постоянные хозяйственные расходы",
      amount: s.inputs.own_household_fixed,
    },
    {
      id: "own_service_rate",
      label: "Сервис оборудования торговой функции",
      amount:
        retailAssets === null ? null : rate("own_service_rate", retailAssets),
    },
    {
      id: "own_utilities",
      label: "Локальные коммунальные расходы",
      amount: embedded ? null : s.inputs.own_utilities,
      notApplicable: embedded,
    },
    {
      id: "own_marketing_rate",
      label: "Локальный переменный маркетинг",
      amount: rate("own_marketing_rate", sales),
    },
    {
      id: "own_admin",
      label: "Локальные административные расходы",
      amount: embedded ? null : s.inputs.own_admin,
      notApplicable: embedded,
    },
    {
      id: "own_other",
      label: "Другие расходы точки",
      amount: s.inputs.own_other,
    },
  ];
  const missing = lines.filter(
    (l) => !l.notApplicable && (l.amount == null || s.inputs[l.id] == null),
  );
  const known = lines.reduce((a, l) => a + (l.amount ?? 0), 0);
  return {
    lines,
    missing,
    known,
    total: missing.length ? null : known,
    retailAssets,
  };
}
export function salesFactor(
  s: Scenario,
  point: Point | undefined,
  month: number | undefined,
) {
  if (!s.integration || month === undefined) return 1;
  const age = month - (point?.month ?? 1) + 1;
  const ramp =
    point?.ramp === "mature"
      ? 1
      : (ref.ramp.find((r) => r.month === Math.min(age, ref.ramp.length))
          ?.ramp_factor ?? 1);
  const calendar = ((s.integration.calendarStartMonth + month - 2) % 12) + 1;
  const season = s.integration.seasonality
    ? ref.seasonality.find((r) => r.month === calendar)!.seasonality_coefficient
    : 1;
  return ramp * season;
}
export function taxReference(
  s: Scenario,
  inflow: number,
  contribution: number,
) {
  if (s.inputs.tax_profit === null || s.inputs.tax_sales === null) return null;
  return calculateManagementTax(inflow, inflow - contribution, {
    regularUsnRate: s.inputs.tax_profit,
    minimumUsnRate: s.inputs.tax_sales,
  }).taxRub;
}
export function maintenanceReference(s: Scenario) {
  const known = monthlyMaintenanceCapex(
    effectiveEquipment(s) + (s.inputs.furniture ?? 0),
    referenceValues.maintenance_rate,
  );
  const extra = notApplicable(s, "maintenance_extra")
    ? 0
    : s.inputs.maintenance_extra;
  const growth = notApplicable(s, "maintenance_growth")
    ? 0
    : s.inputs.maintenance_growth;
  return {
    equipmentAndFurniture: known,
    extra,
    growth,
    known: known + (extra ?? 0) + (growth ?? 0),
    complete: extra !== null && growth !== null,
  };
}
