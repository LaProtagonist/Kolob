/**
 * Physical allocation metadata for the Investor Terminal evolution.
 *
 * This file deliberately contains no prices, quantities, rent, salary or
 * financial formulas. Those remain in the canonical Financial Model, CAPEX
 * register and Investor Start model. The map records only the approved
 * physical meaning and scaling semantics of their stable source IDs.
 */

export const physicalScopes = [
  "production",
  "seating_point",
  "takeaway_point",
  "both_point_formats",
  "shared_network",
  "mixed",
  "unresolved",
] as const;

export type PhysicalScope = (typeof physicalScopes)[number];

export const scalingDrivers = [
  "once",
  "per_point",
  "per_object",
  "per_m2",
  "per_guest_m2",
  "per_seat",
  "per_staff",
  "per_check",
  "revenue_percentage",
  "base_plus_per_m2",
  "base_plus_per_check",
  "power_based",
  "wet_points_based",
  "capacity_based",
  "layout_based",
  "equipment_based",
  "percentage_of_applicable_base",
  "manual",
  "unknown",
] as const;

export type ScalingDriver = (typeof scalingDrivers)[number];

export const allocationStatuses = ["confirmed", "owner_decision", "inferred", "unresolved"] as const;
export type AllocationStatus = (typeof allocationStatuses)[number];

export const allocationReferenceContexts = [
  "canonical_financial_model",
  "integrated_pilot_200m2",
  "future_physical_object_requirement",
] as const;

export type AllocationReferenceContext = (typeof allocationReferenceContexts)[number];

export type AllocationSourceRef =
  | { kind: "equipment_module"; id: string }
  | { kind: "equipment_item"; id: string }
  | { kind: "preparation_category"; id: string }
  | { kind: "financial_model_item"; id: string }
  | { kind: "investor_start_field"; id: string }
  | { kind: "network_planning_item"; id: string }
  | { kind: "capability_requirement"; id: string };

export type PhysicalAllocationRecord = {
  /** Stable metadata ID. It is not a new financial line item. */
  id: string;
  category: "equipment" | "preparation" | "furniture" | "real_estate" | "launch" | "staffing" | "opex" | "cash_flow" | "capability";
  name: string;
  sourceRefs: readonly AllocationSourceRef[];
  physicalScope: PhysicalScope;
  /** Objects that need this category once it is priced/configured separately. */
  appliesTo?: readonly Extract<PhysicalScope, "production" | "seating_point" | "takeaway_point">[];
  scalingDriver: ScalingDriver;
  status: AllocationStatus;
  referenceContext: AllocationReferenceContext;
  /** Integrated-pilot references must never populate a new format default. */
  referenceOnly?: boolean;
  /** A required future capability has no approved priced BOM yet. */
  pricingStatus: "canonical_source" | "not_priced" | "not_applicable";
  note: string;
};

export const financialModelAllocationItemIds = [
  "video_surveillance",
  "alarm",
  "initial_uniform",
  "launch_marketing",
  "initial_inventory",
  "contingency",
  "operating_reserve",
  "prepaid_rent",
  "security_deposit",
  "property",
  "food_cost",
  "waste",
  "packaging",
  "labour",
  "rent",
  "acquiring",
  "aggregator_commission",
  "admin_reserve",
  "marketing",
  "household",
  "utilities",
  "equipment_service",
  "accounting",
  "ventilation_grease",
  "uniform_renewal",
  "music",
  "pest_control",
  "software",
  "medical",
  "security",
  "banking",
  "other_opex",
  "taxes",
  "maintenance_capex",
  "depreciation",
] as const;

export const investorStartAllocationFieldIds = [
  "premises.total_area_m2",
  "premises.monthly_rent_rub",
  "premises.purchase_price_rub",
  "premises.prepayment_months",
  "premises.security_deposit_months",
  "furniture.seats_x_profile",
  "staffing.integrated_reference",
] as const;

export const networkPlanningAllocationItemIds = [
  "LOGISTICS",
  "UNIFORM_PER_ROSTER_EMPLOYEE",
  "INITIAL_INVENTORY_OPERATING_DAYS",
] as const;

/**
 * The single physical-allocation map. A consumer must resolve amounts from the
 * source reference; it must not infer an amount from this metadata.
 */
export const physicalAllocationMap = [
  {
    id: "MOD-PREP",
    category: "equipment",
    name: "Заготовочное производство",
    sourceRefs: [{ kind: "equipment_module", id: "MOD-PREP" }],
    physicalScope: "production",
    scalingDriver: "once",
    status: "confirmed",
    referenceContext: "canonical_financial_model",
    pricingStatus: "canonical_source",
    note: "Включая холод, мороз, подготовительное оборудование и собственные санитарные позиции производства.",
  },
  {
    id: "MOD-GROW",
    category: "equipment",
    name: "Модуль выращивания",
    sourceRefs: [{ kind: "equipment_module", id: "MOD-GROW" }],
    physicalScope: "production",
    scalingDriver: "once",
    status: "confirmed",
    referenceContext: "canonical_financial_model",
    pricingStatus: "canonical_source",
    note: "Общая производственная инфраструктура; не относится к повторяемой торговой точке.",
  },
  {
    id: "CAPEX-04-002",
    category: "equipment",
    name: "Терминал складского и производственного учёта",
    sourceRefs: [{ kind: "equipment_item", id: "CAPEX-04-002" }],
    physicalScope: "production",
    scalingDriver: "once",
    status: "confirmed",
    referenceContext: "canonical_financial_model",
    pricingStatus: "canonical_source",
    note: "Единственный POS-module item, прямо описанный как рабочее место заготовочного цеха.",
  },
  {
    id: "MOD-RETAIL-HOT",
    category: "equipment",
    name: "Торговая кухня и выдача",
    sourceRefs: [{ kind: "equipment_module", id: "MOD-RETAIL-HOT" }],
    physicalScope: "both_point_formats",
    scalingDriver: "per_point",
    status: "confirmed",
    referenceContext: "canonical_financial_model",
    pricingStatus: "canonical_source",
    note: "Повторяемая торговая функция для стационарной точки с посадкой и точки на вынос.",
  },
  {
    id: "CAPEX-04-001",
    category: "equipment",
    name: "POS-терминалы точки",
    sourceRefs: [{ kind: "equipment_item", id: "CAPEX-04-001" }],
    physicalScope: "both_point_formats",
    scalingDriver: "per_point",
    status: "confirmed",
    referenceContext: "canonical_financial_model",
    pricingStatus: "canonical_source",
    note: "Кассовая функция повторяемой торговой точки.",
  },
  {
    id: "CAPEX-04-003",
    category: "equipment",
    name: "KDS-экраны торговой точки",
    sourceRefs: [{ kind: "equipment_item", id: "CAPEX-04-003" }],
    physicalScope: "both_point_formats",
    scalingDriver: "per_point",
    status: "confirmed",
    referenceContext: "canonical_financial_model",
    pricingStatus: "canonical_source",
    note: "Управление заказами на повторяемом рабочем посту.",
  },
  {
    id: "MOD-GUEST",
    category: "equipment",
    name: "Гостевой зал",
    sourceRefs: [{ kind: "equipment_module", id: "MOD-GUEST" }],
    physicalScope: "seating_point",
    scalingDriver: "per_point",
    status: "confirmed",
    referenceContext: "canonical_financial_model",
    pricingStatus: "not_priced",
    note: "Гостевой модуль существует в register, но его детальная отдельная priced-BOM пока не сформирована.",
  },
  {
    id: "FURNITURE-SEATING",
    category: "furniture",
    name: "Мебель посадочного зала",
    sourceRefs: [{ kind: "investor_start_field", id: "furniture.seats_x_profile" }],
    physicalScope: "seating_point",
    scalingDriver: "per_seat",
    status: "confirmed",
    referenceContext: "canonical_financial_model",
    pricingStatus: "canonical_source",
    note: "Существующая модель считает мебель через число посадочных мест и выбранный профиль.",
  },
  {
    id: "MOD-TAKEAWAY",
    category: "equipment",
    name: "Заказ, выдача и самообслуживание",
    sourceRefs: [{ kind: "equipment_module", id: "MOD-TAKEAWAY" }],
    physicalScope: "both_point_formats",
    scalingDriver: "per_point",
    status: "inferred",
    referenceContext: "canonical_financial_model",
    pricingStatus: "not_priced",
    note: "Функции выдачи применимы к обоим форматам, но количественный состав и отдельные цены остаются частичными.",
  },
  {
    id: "MOD-BAR",
    category: "equipment",
    name: "Бар и напитки",
    sourceRefs: [{ kind: "equipment_module", id: "MOD-BAR" }],
    physicalScope: "both_point_formats",
    scalingDriver: "per_point",
    status: "owner_decision",
    referenceContext: "canonical_financial_model",
    pricingStatus: "canonical_source",
    note: "Опциональный модуль конкретной cohort; не является производственной инфраструктурой и не включается по умолчанию.",
  },
  {
    id: "MOD-WASH",
    category: "equipment",
    name: "Профессиональная посудомоечная зона integrated pilot",
    sourceRefs: [{ kind: "equipment_module", id: "MOD-WASH" }],
    physicalScope: "mixed",
    appliesTo: ["production", "seating_point", "takeaway_point"],
    scalingDriver: "manual",
    status: "unresolved",
    referenceContext: "integrated_pilot_200m2",
    referenceOnly: true,
    pricingStatus: "canonical_source",
    note: "Композитная купольная зона pilot не является подтверждённым повторяемым модулем Seating или Takeaway.",
  },
  {
    id: "POINT-WASH-SEATING",
    category: "capability",
    name: "Локальная мойка и cleaning kit точки с посадкой",
    sourceRefs: [
      { kind: "capability_requirement", id: "POINT-WASH-SEATING" },
      { kind: "equipment_item", id: "CAPEX-01-019" },
      { kind: "equipment_item", id: "CAPEX-01-020" },
      { kind: "equipment_item", id: "CAPEX-01-021" },
      { kind: "equipment_item", id: "CAPEX-01-006" },
      { kind: "equipment_item", id: "CAPEX-01-007" },
    ],
    physicalScope: "seating_point",
    scalingDriver: "per_point",
    status: "owner_decision",
    referenceContext: "future_physical_object_requirement",
    pricingStatus: "canonical_source",
    note: "B3 packaged BOM: рабочая мойка, рукомойник, dispensers, стеллаж и сушильный стеллаж из существующего CAPEX register. Вода/канализация остаются в подготовке помещения; тяжёлая купольная мойка не применяется при одноразовой гостевой посуде.",
  },
  {
    id: "POINT-WASH-TAKEAWAY",
    category: "capability",
    name: "Локальная мойка и cleaning kit точки на вынос",
    sourceRefs: [
      { kind: "capability_requirement", id: "POINT-WASH-TAKEAWAY" },
      { kind: "equipment_item", id: "CAPEX-01-019" },
      { kind: "equipment_item", id: "CAPEX-01-020" },
      { kind: "equipment_item", id: "CAPEX-01-021" },
      { kind: "equipment_item", id: "CAPEX-01-006" },
    ],
    physicalScope: "takeaway_point",
    scalingDriver: "per_point",
    status: "owner_decision",
    referenceContext: "future_physical_object_requirement",
    pricingStatus: "canonical_source",
    note: "B3 packaged BOM: рабочая мойка, рукомойник, dispensers и компактный стеллаж из существующего CAPEX register. Вода/канализация остаются в подготовке помещения; отдельный guest-dish flow и купольная мойка не требуются.",
  },
  {
    id: "PREP-BUILDING",
    category: "preparation",
    name: "Общестроительные работы",
    sourceRefs: [{ kind: "preparation_category", id: "PREP-BUILDING" }],
    physicalScope: "mixed",
    appliesTo: ["production", "seating_point", "takeaway_point"],
    scalingDriver: "base_plus_per_m2",
    status: "owner_decision",
    referenceContext: "integrated_pilot_200m2",
    referenceOnly: true,
    pricingStatus: "canonical_source",
    note: "Применимо к каждому стационарному помещению, но нынешняя сумма — только reference единого pilot-объекта.",
  },
  {
    id: "PREP-ELECTRICAL",
    category: "preparation",
    name: "Электрика",
    sourceRefs: [{ kind: "preparation_category", id: "PREP-ELECTRICAL" }],
    physicalScope: "mixed",
    appliesTo: ["production", "seating_point", "takeaway_point"],
    scalingDriver: "power_based",
    status: "owner_decision",
    referenceContext: "integrated_pilot_200m2",
    referenceOnly: true,
    pricingStatus: "canonical_source",
    note: "Планировочный area proxy возможен только в будущем; текущая reference сумма не делится автоматически.",
  },
  {
    id: "PREP-WATER-DRAINAGE",
    category: "preparation",
    name: "Вода и канализация",
    sourceRefs: [{ kind: "preparation_category", id: "PREP-WATER-DRAINAGE" }],
    physicalScope: "mixed",
    appliesTo: ["production", "seating_point", "takeaway_point"],
    scalingDriver: "wet_points_based",
    status: "owner_decision",
    referenceContext: "integrated_pilot_200m2",
    referenceOnly: true,
    pricingStatus: "canonical_source",
    note: "Все три стационарных объекта требуют инфраструктуру, но integrated reference не является суммой на каждый объект.",
  },
  {
    id: "PREP-VENTILATION",
    category: "preparation",
    name: "Вентиляция",
    sourceRefs: [{ kind: "preparation_category", id: "PREP-VENTILATION" }],
    physicalScope: "mixed",
    appliesTo: ["production", "seating_point", "takeaway_point"],
    scalingDriver: "capacity_based",
    status: "owner_decision",
    referenceContext: "integrated_pilot_200m2",
    referenceOnly: true,
    pricingStatus: "canonical_source",
    note: "Production и применимые точки требуют разные решения; расчёт от площади пока не определён.",
  },
  {
    id: "PREP-LIGHTING",
    category: "preparation",
    name: "Освещение",
    sourceRefs: [{ kind: "preparation_category", id: "PREP-LIGHTING" }],
    physicalScope: "mixed",
    appliesTo: ["production", "seating_point", "takeaway_point"],
    scalingDriver: "base_plus_per_m2",
    status: "owner_decision",
    referenceContext: "integrated_pilot_200m2",
    referenceOnly: true,
    pricingStatus: "canonical_source",
    note: "Применимо к каждому объекту; текущая сумма относится к integrated pilot.",
  },
  {
    id: "PREP-GUEST-AREA",
    category: "preparation",
    name: "Подготовка гостевой зоны",
    sourceRefs: [{ kind: "preparation_category", id: "PREP-GUEST-AREA" }],
    physicalScope: "seating_point",
    scalingDriver: "per_guest_m2",
    status: "confirmed",
    referenceContext: "integrated_pilot_200m2",
    referenceOnly: true,
    pricingStatus: "canonical_source",
    note: "Гостевая зона не применяется к takeaway; reference amount не является будущей format default.",
  },
  {
    id: "PREP-BUILT-IN",
    category: "preparation",
    name: "Встроенная мебель, стойки и хранение",
    sourceRefs: [{ kind: "preparation_category", id: "PREP-BUILT-IN" }],
    physicalScope: "mixed",
    appliesTo: ["production", "seating_point", "takeaway_point"],
    scalingDriver: "layout_based",
    status: "owner_decision",
    referenceContext: "integrated_pilot_200m2",
    referenceOnly: true,
    pricingStatus: "canonical_source",
    note: "Зависит от layout и оборудования конкретного объекта; не дублируется в каждом формате из integrated reference.",
  },
  {
    id: "PREP-DESIGN",
    category: "preparation",
    name: "Дизайн и согласования",
    sourceRefs: [{ kind: "preparation_category", id: "PREP-DESIGN" }],
    physicalScope: "mixed",
    appliesTo: ["production", "seating_point", "takeaway_point"],
    scalingDriver: "per_object",
    status: "owner_decision",
    referenceContext: "integrated_pilot_200m2",
    referenceOnly: true,
    pricingStatus: "canonical_source",
    note: "Отдельный объект имеет собственную сложность и согласования; integrated reference не является единым тарифом.",
  },
  {
    id: "PREMISES-AREA",
    category: "real_estate",
    name: "Площадь помещения",
    sourceRefs: [{ kind: "investor_start_field", id: "premises.total_area_m2" }],
    physicalScope: "mixed",
    appliesTo: ["production", "seating_point", "takeaway_point"],
    scalingDriver: "per_object",
    status: "owner_decision",
    referenceContext: "integrated_pilot_200m2",
    referenceOnly: true,
    pricingStatus: "not_applicable",
    note: "Integrated pilot area не наследуется автоматически отдельным производству или торговым форматам.",
  },
  {
    id: "PREMISES-RENT",
    category: "real_estate",
    name: "Аренда помещения",
    sourceRefs: [{ kind: "investor_start_field", id: "premises.monthly_rent_rub" }],
    physicalScope: "mixed",
    appliesTo: ["production", "seating_point", "takeaway_point"],
    scalingDriver: "per_object",
    status: "owner_decision",
    referenceContext: "integrated_pilot_200m2",
    referenceOnly: true,
    pricingStatus: "canonical_source",
    note: "Каждый physical object в будущем имеет свой rent/purchase mode; старая ставка является integrated reference.",
  },
  {
    id: "PREMISES-PURCHASE",
    category: "real_estate",
    name: "Покупка помещения",
    sourceRefs: [{ kind: "investor_start_field", id: "premises.purchase_price_rub" }],
    physicalScope: "mixed",
    appliesTo: ["production", "seating_point", "takeaway_point"],
    scalingDriver: "per_object",
    status: "owner_decision",
    referenceContext: "integrated_pilot_200m2",
    referenceOnly: true,
    pricingStatus: "canonical_source",
    note: "Одна integrated purchase reference не является форматом или сетевым default.",
  },
  {
    id: "PREPAID-RENT",
    category: "launch",
    name: "Предоплата аренды",
    sourceRefs: [
      { kind: "financial_model_item", id: "prepaid_rent" },
      { kind: "investor_start_field", id: "premises.prepayment_months" },
    ],
    physicalScope: "mixed",
    appliesTo: ["production", "seating_point", "takeaway_point"],
    scalingDriver: "per_object",
    status: "owner_decision",
    referenceContext: "integrated_pilot_200m2",
    referenceOnly: true,
    pricingStatus: "canonical_source",
    note: "Зависит от отдельного договора аренды; старая prepayment reference не переносится на cohort.",
  },
  {
    id: "SECURITY-DEPOSIT",
    category: "launch",
    name: "Обеспечительный платёж",
    sourceRefs: [
      { kind: "financial_model_item", id: "security_deposit" },
      { kind: "investor_start_field", id: "premises.security_deposit_months" },
    ],
    physicalScope: "mixed",
    appliesTo: ["production", "seating_point", "takeaway_point"],
    scalingDriver: "per_object",
    status: "owner_decision",
    referenceContext: "integrated_pilot_200m2",
    referenceOnly: true,
    pricingStatus: "canonical_source",
    note: "Зависит от отдельного договора; integrated reference не является group default.",
  },
  {
    id: "VIDEO-SURVEILLANCE",
    category: "launch",
    name: "Видеонаблюдение",
    sourceRefs: [{ kind: "financial_model_item", id: "video_surveillance" }],
    physicalScope: "mixed",
    appliesTo: ["production", "seating_point", "takeaway_point"],
    scalingDriver: "per_object",
    status: "owner_decision",
    referenceContext: "integrated_pilot_200m2",
    referenceOnly: true,
    pricingStatus: "canonical_source",
    note: "Физически объектная статья, но старая сумма относится только к integrated pilot.",
  },
  {
    id: "ALARM",
    category: "launch",
    name: "Охранная сигнализация",
    sourceRefs: [{ kind: "financial_model_item", id: "alarm" }],
    physicalScope: "mixed",
    appliesTo: ["production", "seating_point", "takeaway_point"],
    scalingDriver: "per_object",
    status: "owner_decision",
    referenceContext: "integrated_pilot_200m2",
    referenceOnly: true,
    pricingStatus: "canonical_source",
    note: "Физически объектная статья, но старая сумма относится только к integrated pilot.",
  },
  {
    id: "INITIAL-UNIFORM",
    category: "launch",
    name: "Первичная форма",
    sourceRefs: [{ kind: "financial_model_item", id: "initial_uniform" }],
    physicalScope: "mixed",
    scalingDriver: "per_staff",
    status: "owner_decision",
    referenceContext: "integrated_pilot_200m2",
    referenceOnly: true,
    pricingStatus: "canonical_source",
    note: "Нужна будущая staffing decomposition; старая сумма не умножается на точку.",
  },
  {
    id: "LAUNCH-MARKETING",
    category: "launch",
    name: "Маркетинг запуска",
    sourceRefs: [{ kind: "financial_model_item", id: "launch_marketing" }],
    physicalScope: "shared_network",
    scalingDriver: "manual",
    status: "owner_decision",
    referenceContext: "canonical_financial_model",
    pricingStatus: "canonical_source",
    note: "Текущая статья рассматривается как общая launch campaign до отдельной local-opening модели.",
  },
  {
    id: "INITIAL-INVENTORY",
    category: "launch",
    name: "Первоначальный товарный запас",
    sourceRefs: [{ kind: "financial_model_item", id: "initial_inventory" }],
    physicalScope: "unresolved",
    scalingDriver: "unknown",
    status: "unresolved",
    referenceContext: "integrated_pilot_200m2",
    referenceOnly: true,
    pricingStatus: "canonical_source",
    note: "Будущая база зависит от operating unit, throughput и launch stock; текущая сумма не является point cost.",
  },
  {
    id: "CONTINGENCY",
    category: "launch",
    name: "Резерв на непредвиденные расходы",
    sourceRefs: [{ kind: "financial_model_item", id: "contingency" }],
    physicalScope: "mixed",
    scalingDriver: "percentage_of_applicable_base",
    status: "confirmed",
    referenceContext: "canonical_financial_model",
    pricingStatus: "canonical_source",
    note: "Сохраняет текущую процентную semantics; future objects смогут применять её к своей сформированной базе, а не умножать old reserve.",
  },
  {
    id: "OPERATING-RESERVE",
    category: "launch",
    name: "Операционный запас",
    sourceRefs: [{ kind: "financial_model_item", id: "operating_reserve" }],
    physicalScope: "unresolved",
    scalingDriver: "unknown",
    status: "unresolved",
    referenceContext: "canonical_financial_model",
    pricingStatus: "canonical_source",
    note: "Требует decomposition Production OPEX + Point OPEX + Shared OPEX до расчёта reserve months.",
  },
  {
    id: "STAFFING-INTEGRATED",
    category: "staffing",
    name: "Интегрированный staffing reference",
    sourceRefs: [{ kind: "investor_start_field", id: "staffing.integrated_reference" }],
    physicalScope: "mixed",
    scalingDriver: "per_staff",
    status: "unresolved",
    referenceContext: "integrated_pilot_200m2",
    referenceOnly: true,
    pricingStatus: "not_applicable",
    note: "Текущие 14/16/20 headcount не делятся механически на production и точки; concurrent staff не равен FTE.",
  },
  {
    id: "OPEX-FOOD-COST",
    category: "opex",
    name: "Food cost и waste",
    sourceRefs: [
      { kind: "financial_model_item", id: "food_cost" },
      { kind: "financial_model_item", id: "waste" },
    ],
    physicalScope: "production",
    scalingDriver: "revenue_percentage",
    status: "owner_decision",
    referenceContext: "canonical_financial_model",
    pricingStatus: "canonical_source",
    note: "Закупка и заготовка физически принадлежат Production; для point contribution расходы атрибутируются cohort revenue без двойного учёта.",
  },
  {
    id: "OPEX-CONSUMER-PACKAGING",
    category: "opex",
    name: "Потребительская упаковка",
    sourceRefs: [{ kind: "financial_model_item", id: "packaging" }],
    physicalScope: "both_point_formats",
    scalingDriver: "per_check",
    status: "owner_decision",
    referenceContext: "canonical_financial_model",
    pricingStatus: "canonical_source",
    note: "Торговая переменная статья, рассчитанная существующей механикой от checks/day.",
  },
  {
    id: "OPEX-ACQUIRING",
    category: "opex",
    name: "Эквайринг",
    sourceRefs: [{ kind: "financial_model_item", id: "acquiring" }],
    physicalScope: "both_point_formats",
    scalingDriver: "revenue_percentage",
    status: "owner_decision",
    referenceContext: "canonical_financial_model",
    pricingStatus: "canonical_source",
    note: "Торговая переменная статья, рассчитанная существующей ставкой от выручки точки.",
  },
  {
    id: "OPEX-AGGREGATOR-COMMISSION",
    category: "opex",
    name: "Комиссии агрегаторов",
    sourceRefs: [{ kind: "financial_model_item", id: "aggregator_commission" }],
    physicalScope: "unresolved",
    scalingDriver: "revenue_percentage",
    status: "unresolved",
    referenceContext: "canonical_financial_model",
    pricingStatus: "canonical_source",
    note: "Доля агрегаторов и применимость к cohort не утверждены для planning network model.",
  },
  {
    id: "OPEX-LABOUR",
    category: "opex",
    name: "ФОТ и взносы",
    sourceRefs: [{ kind: "financial_model_item", id: "labour" }],
    physicalScope: "mixed",
    scalingDriver: "per_staff",
    status: "unresolved",
    referenceContext: "canonical_financial_model",
    pricingStatus: "canonical_source",
    note: "Нужны role ownership, schedules и FTE model; current protected labour floor не разложен.",
  },
  {
    id: "OPEX-PRODUCTION-PREP-PAYROLL",
    category: "opex",
    name: "Planning payroll заготовочного производства",
    sourceRefs: [{ kind: "financial_model_item", id: "labour" }],
    physicalScope: "production",
    scalingDriver: "per_staff",
    status: "owner_decision",
    referenceContext: "canonical_financial_model",
    pricingStatus: "canonical_source",
    note: "Prep Cook roster исходит из owner-approved Network Planning policy и канонической зарплаты роли.",
  },
  {
    id: "OPEX-POINT-PLANNING-PAYROLL",
    category: "opex",
    name: "Planning payroll торговой точки",
    sourceRefs: [{ kind: "financial_model_item", id: "labour" }],
    physicalScope: "both_point_formats",
    scalingDriver: "per_staff",
    status: "owner_decision",
    referenceContext: "canonical_financial_model",
    pricingStatus: "canonical_source",
    note: "Concurrent roles и roster преобразуются отдельным planning adapter; это не механическое деление integrated labour.",
  },
  {
    id: "OPEX-NETWORK-MANAGER",
    category: "opex",
    name: "Управляющий сети",
    sourceRefs: [{ kind: "financial_model_item", id: "labour" }],
    physicalScope: "shared_network",
    scalingDriver: "once",
    status: "owner_decision",
    referenceContext: "canonical_financial_model",
    pricingStatus: "canonical_source",
    note: "Один Manager с первой точки; не умножается на количество торговых точек.",
  },
  {
    id: "OPEX-MARKETING-FIXED",
    category: "opex",
    name: "Базовый маркетинг сети",
    sourceRefs: [{ kind: "financial_model_item", id: "marketing" }],
    physicalScope: "shared_network",
    scalingDriver: "once",
    status: "owner_decision",
    referenceContext: "canonical_financial_model",
    pricingStatus: "canonical_source",
    note: "Каноническая fixed часть маркетинга учитывается один раз на сеть.",
  },
  {
    id: "OPEX-MARKETING-VARIABLE",
    category: "opex",
    name: "Переменный маркетинг",
    sourceRefs: [{ kind: "financial_model_item", id: "marketing" }],
    physicalScope: "shared_network",
    scalingDriver: "revenue_percentage",
    status: "owner_decision",
    referenceContext: "canonical_financial_model",
    pricingStatus: "canonical_source",
    note: "Каноническая variable часть агрегируется по revenue cohort; не является fixed cost на каждую точку.",
  },
  {
    id: "OPEX-LOGISTICS",
    category: "opex",
    name: "Логистика сети",
    sourceRefs: [{ kind: "network_planning_item", id: "LOGISTICS" }],
    physicalScope: "shared_network",
    scalingDriver: "once",
    status: "owner_decision",
    referenceContext: "future_physical_object_requirement",
    pricingStatus: "not_priced",
    note: "Внешняя логистика или один planning рефрижератор обслуживают сеть; не умножаются на каждую точку.",
  },
  {
    id: "OPEX-RENT",
    category: "opex",
    name: "Аренда в OPEX",
    sourceRefs: [{ kind: "financial_model_item", id: "rent" }],
    physicalScope: "mixed",
    appliesTo: ["production", "seating_point", "takeaway_point"],
    scalingDriver: "per_object",
    status: "owner_decision",
    referenceContext: "integrated_pilot_200m2",
    referenceOnly: true,
    pricingStatus: "canonical_source",
    note: "Физически возникает у отдельного leased object, но текущая ставка относится к integrated pilot.",
  },
  {
    id: "OPEX-ADMIN-RESERVE",
    category: "opex",
    name: "Административный резерв",
    sourceRefs: [{ kind: "financial_model_item", id: "admin_reserve" }],
    physicalScope: "shared_network",
    scalingDriver: "revenue_percentage",
    status: "owner_decision",
    referenceContext: "canonical_financial_model",
    pricingStatus: "canonical_source",
    note: "Одна общесетевая ставка от consolidated net revenue. Expansion получает только прирост относительно уже включённого Base.",
  },
  {
    id: "OPEX-HOUSEHOLD",
    category: "opex",
    name: "Хозяйственные и эксплуатационные расходники",
    sourceRefs: [{ kind: "financial_model_item", id: "household" }],
    physicalScope: "both_point_formats",
    scalingDriver: "base_plus_per_check",
    status: "owner_decision",
    referenceContext: "canonical_financial_model",
    pricingStatus: "canonical_source",
    note: "Повторяемая точка: существующая formula fixed 50k + variable 50k × checks/300. Не дублируется как Production OPEX.",
  },
  {
    id: "OPEX-UTILITIES",
    category: "opex",
    name: "Коммунальные и service charges точки",
    sourceRefs: [{ kind: "financial_model_item", id: "utilities" }],
    physicalScope: "both_point_formats",
    scalingDriver: "per_object",
    status: "owner_decision",
    referenceContext: "canonical_financial_model",
    pricingStatus: "canonical_source",
    note: "Expansion берёт contract-level utilities, service charge и storage конкретной cohort; historical integrated fixed amount не копируется.",
  },
  {
    id: "OPEX-EQUIPMENT-SERVICE",
    category: "opex",
    name: "Регулярное обслуживание оборудования",
    sourceRefs: [{ kind: "financial_model_item", id: "equipment_service" }],
    physicalScope: "both_point_formats",
    scalingDriver: "equipment_based",
    status: "owner_decision",
    referenceContext: "canonical_financial_model",
    pricingStatus: "canonical_source",
    note: "Сервисные контракты, профилактика и мелкий ремонт. Expansion масштабируется по actual point equipment asset basis относительно Current Base; не является maintenance CAPEX replacement reserve.",
  },
  {
    id: "OPEX-ACCOUNTING",
    category: "opex",
    name: "Бухгалтерский аутсорсинг",
    sourceRefs: [{ kind: "financial_model_item", id: "accounting" }],
    physicalScope: "shared_network",
    scalingDriver: "once",
    status: "owner_decision",
    referenceContext: "canonical_financial_model",
    pricingStatus: "canonical_source",
    note: "Одна shared функция уже содержится в Current Base; для 5/9/13 не умножается на точки до отдельного scaling decision.",
  },
  {
    id: "OPEX-VENT-GREASE",
    category: "opex",
    name: "Вентиляция и жироуловители",
    sourceRefs: [{ kind: "financial_model_item", id: "ventilation_grease" }],
    physicalScope: "mixed",
    appliesTo: ["production", "seating_point", "takeaway_point"],
    scalingDriver: "per_m2",
    status: "owner_decision",
    referenceContext: "canonical_financial_model",
    pricingStatus: "canonical_source",
    note: "Current Base содержит historical integrated service. Дополнительные точки получают calibration по своей площади; contract не подтверждает venue inclusion.",
  },
  {
    id: "OPEX-UNIFORM-RENEWAL",
    category: "opex",
    name: "Обновление спецодежды",
    sourceRefs: [{ kind: "financial_model_item", id: "uniform_renewal" }],
    physicalScope: "mixed",
    appliesTo: ["production", "seating_point", "takeaway_point"],
    scalingDriver: "per_staff",
    status: "owner_decision",
    referenceContext: "canonical_financial_model",
    pricingStatus: "canonical_source",
    note: "Recurring renewal calibrated from historical realistic roster and applies to point roster plus incremental food-operation production roster, not to shared manager.",
  },
  {
    id: "OPEX-MUSIC",
    category: "opex",
    name: "Музыка и права",
    sourceRefs: [{ kind: "financial_model_item", id: "music" }],
    physicalScope: "seating_point",
    scalingDriver: "per_object",
    status: "owner_decision",
    referenceContext: "canonical_financial_model",
    pricingStatus: "canonical_source",
    note: "Street Seating получает одну линию на самостоятельное помещение; takeaway = 0, Foodhall/Creative Cluster = venue-provided.",
  },
  {
    id: "OPEX-PEST-CONTROL",
    category: "opex",
    name: "Pest control",
    sourceRefs: [{ kind: "financial_model_item", id: "pest_control" }],
    physicalScope: "mixed",
    appliesTo: ["production", "seating_point", "takeaway_point"],
    scalingDriver: "per_m2",
    status: "owner_decision",
    referenceContext: "canonical_financial_model",
    pricingStatus: "canonical_source",
    note: "Historical integrated rate is calibrated to applicable premises area. Current Production remains in Base; additional physical points receive their area-based portion.",
  },
  {
    id: "OPEX-SOFTWARE",
    category: "opex",
    name: "YUMA / кассовые сервисы",
    sourceRefs: [{ kind: "financial_model_item", id: "software" }],
    physicalScope: "shared_network",
    scalingDriver: "manual",
    status: "unresolved",
    referenceContext: "canonical_financial_model",
    pricingStatus: "canonical_source",
    note: "Historical Current Base amount exists, but central versus per-point licensing has no governed contract evidence; disclosed as confirmation-required rather than multiplied or silently removed.",
  },
  {
    id: "OPEX-MEDICAL",
    category: "opex",
    name: "Медосмотры и санитарные документы",
    sourceRefs: [{ kind: "financial_model_item", id: "medical" }],
    physicalScope: "mixed",
    appliesTo: ["production", "seating_point", "takeaway_point"],
    scalingDriver: "per_staff",
    status: "owner_decision",
    referenceContext: "canonical_financial_model",
    pricingStatus: "canonical_source",
    note: "Recurring amount calibrated from historical realistic food-operation roster; shared manager is excluded absent a food-operation requirement.",
  },
  {
    id: "OPEX-SECURITY-MONITORING",
    category: "opex",
    name: "Пультовая охрана",
    sourceRefs: [{ kind: "financial_model_item", id: "security" }],
    physicalScope: "mixed",
    appliesTo: ["production", "seating_point", "takeaway_point"],
    scalingDriver: "per_object",
    status: "owner_decision",
    referenceContext: "canonical_financial_model",
    pricingStatus: "canonical_source",
    note: "Recurring monitoring is separate from launch video/alarm. Street premises receive the line; venue-security-included Foodhall/Creative Cluster do not.",
  },
  {
    id: "OPEX-BANKING",
    category: "opex",
    name: "Банковское обслуживание",
    sourceRefs: [{ kind: "financial_model_item", id: "banking" }],
    physicalScope: "shared_network",
    scalingDriver: "manual",
    status: "unresolved",
    referenceContext: "canonical_financial_model",
    pricingStatus: "not_priced",
    note: "Acquiring is separate. Account/service tariff is 0 / TBD and remains a disclosed minor assumption gap rather than an invented zero-priced contract.",
  },
  {
    id: "OPEX-OTHER",
    category: "opex",
    name: "Прочие регулярные расходы",
    sourceRefs: [{ kind: "financial_model_item", id: "other_opex" }],
    physicalScope: "shared_network",
    scalingDriver: "once",
    status: "owner_decision",
    referenceContext: "canonical_financial_model",
    pricingStatus: "canonical_source",
    note: "Historical catch-all remains a conservative shared Current Base contingency once. Its unknown composition must not be copied per point or a second time into Expansion.",
  },
  {
    id: "OPEX-TAXES",
    category: "opex",
    name: "Налоги",
    sourceRefs: [{ kind: "financial_model_item", id: "taxes" }],
    physicalScope: "unresolved",
    scalingDriver: "revenue_percentage",
    status: "unresolved",
    referenceContext: "canonical_financial_model",
    pricingStatus: "canonical_source",
    note: "Current tax proxy applies to the integrated business result and is not a network allocation rule.",
  },
  {
    id: "DEPRECIATION",
    category: "cash_flow",
    name: "Амортизация",
    sourceRefs: [{ kind: "financial_model_item", id: "depreciation" }],
    physicalScope: "mixed",
    scalingDriver: "equipment_based",
    status: "inferred",
    referenceContext: "canonical_financial_model",
    pricingStatus: "canonical_source",
    note: "Будущее распределение следует physical asset allocation и срокам службы, но не рассчитывается этим map.",
  },
  {
    id: "MAINTENANCE-CAPEX",
    category: "cash_flow",
    name: "Maintenance CAPEX",
    sourceRefs: [{ kind: "financial_model_item", id: "maintenance_capex" }],
    physicalScope: "mixed",
    scalingDriver: "percentage_of_applicable_base",
    status: "inferred",
    referenceContext: "canonical_financial_model",
    pricingStatus: "canonical_source",
    note: "Текущая semantics сохраняется; future decomposition должна следовать actual asset base.",
  },
] as const satisfies readonly PhysicalAllocationRecord[];

/**
 * Line-by-line treatment of every historical recurring Financial Model OPEX
 * line. This is deliberately colocated with the physical-allocation map: it
 * records ownership/provenance, never a copied price, quantity or formula.
 */
export const historicalOpexLineIds = [
  "food_cost",
  "waste",
  "packaging",
  "labour",
  "rent",
  "acquiring",
  "aggregator_commission",
  "admin_reserve",
  "marketing",
  "household",
  "utilities",
  "equipment_service",
  "accounting",
  "ventilation_grease",
  "uniform_renewal",
  "music",
  "pest_control",
  "software",
  "medical",
  "security",
  "banking",
  "other_opex",
] as const;

export type HistoricalOpexLineId = (typeof historicalOpexLineIds)[number];
export type HistoricalOpexTreatmentStatus = "active_base" | "mapped" | "superseded" | "not_applicable" | "unresolved";
export type HistoricalOpexBaseStatus = "active" | "not_applicable" | "unresolved";
export type OpexEconomicScope = "base" | "point" | "production" | "shared_network";
/**
 * A line can be fully accounted for by Current Base without being an
 * incremental expansion cost. This separates deliberate no-second-copy
 * treatment from a missing consumer mapping.
 */
export type OpexNetworkTreatment = "incremental" | "base_only" | "not_applicable" | "requires_confirmation";

export type HistoricalOpexTreatment = {
  lineId: HistoricalOpexLineId;
  name: string;
  allocationIds: readonly string[];
  /** Current Base / historical Financial Model treatment, separate from scaling. */
  baseStatus: HistoricalOpexBaseStatus;
  status: HistoricalOpexTreatmentStatus;
  networkScopes: readonly OpexEconomicScope[];
  networkTreatment: OpexNetworkTreatment;
  /** True only when the current Network Projection has a governed driver. */
  includedInKnownExpansion: boolean;
  note: string;
};

const historicalOpexNetworkTreatmentCatalog: readonly Omit<HistoricalOpexTreatment, "baseStatus">[] = [
  { lineId: "food_cost", name: "Сырьё", allocationIds: ["OPEX-FOOD-COST"], status: "mapped", networkScopes: ["point"], networkTreatment: "incremental", includedInKnownExpansion: true, note: "Физическая закупка остаётся Production; экономически атрибутируется revenue cohort ровно один раз." },
  { lineId: "waste", name: "Списания", allocationIds: ["OPEX-FOOD-COST"], status: "mapped", networkScopes: ["point"], networkTreatment: "incremental", includedInKnownExpansion: true, note: "Каноническая доля от сырья, атрибутируемая cohort revenue без дублирования в Production." },
  { lineId: "packaging", name: "Потребительская упаковка", allocationIds: ["OPEX-CONSUMER-PACKAGING"], status: "mapped", networkScopes: ["point"], networkTreatment: "incremental", includedInKnownExpansion: true, note: "Каноническая per-check mechanics торговой точки." },
  { lineId: "labour", name: "ФОТ и взносы", allocationIds: ["OPEX-LABOUR", "OPEX-PRODUCTION-PREP-PAYROLL", "OPEX-POINT-PLANNING-PAYROLL", "OPEX-NETWORK-MANAGER"], status: "mapped", networkScopes: ["point", "production", "shared_network"], networkTreatment: "incremental", includedInKnownExpansion: true, note: "Historical integrated labour заменён доказуемыми point, production и one-manager planning projections; не делится пропорционально." },
  { lineId: "rent", name: "Аренда", allocationIds: ["OPEX-RENT"], status: "mapped", networkScopes: ["point"], networkTreatment: "incremental", includedInKnownExpansion: true, note: "Только contract-level occupancy дополнительных cohort; base rent остаётся в Base context." },
  { lineId: "acquiring", name: "Эквайринг", allocationIds: ["OPEX-ACQUIRING"], status: "mapped", networkScopes: ["point"], networkTreatment: "incremental", includedInKnownExpansion: true, note: "Канонические 2% gross revenue для каждой cohort." },
  { lineId: "aggregator_commission", name: "Комиссии агрегаторов", allocationIds: ["OPEX-AGGREGATOR-COMMISSION"], status: "not_applicable", networkScopes: ["point"], networkTreatment: "not_applicable", includedInKnownExpansion: false, note: "Текущая approved cohort configuration имеет aggregator share = 0; при появлении share расчёт должен быть включён только для соответствующей cohort." },
  { lineId: "admin_reserve", name: "Административный резерв", allocationIds: ["OPEX-ADMIN-RESERVE"], status: "mapped", networkScopes: ["shared_network"], networkTreatment: "incremental", includedInKnownExpansion: true, note: "2% consolidated net revenue: Expansion получает только 2% своего incremental revenue, поэтому сеть не получает вторую копию base reserve." },
  { lineId: "marketing", name: "Маркетинг", allocationIds: ["OPEX-MARKETING-FIXED", "OPEX-MARKETING-VARIABLE"], status: "mapped", networkScopes: ["point", "shared_network"], networkTreatment: "incremental", includedInKnownExpansion: true, note: "2.4% net revenue атрибутируется point revenue; fixed 150k already belongs to Base and is not multiplied by points." },
  { lineId: "household", name: "Хозяйственные и эксплуатационные расходники", allocationIds: ["OPEX-HOUSEHOLD"], status: "mapped", networkScopes: ["point"], networkTreatment: "incremental", includedInKnownExpansion: true, note: "Существующая formula 50k + 50k × checks/300 применяется к каждой additional point; Production portion already remains in Current Base rather than being copied twice." },
  { lineId: "utilities", name: "Коммунальные услуги", allocationIds: ["OPEX-UTILITIES"], status: "mapped", networkScopes: ["point"], networkTreatment: "incremental", includedInKnownExpansion: true, note: "Contract-level point utilities/service charges are used where supplied; this does not copy the historical integrated fixed amount." },
  { lineId: "equipment_service", name: "Обслуживание оборудования", allocationIds: ["OPEX-EQUIPMENT-SERVICE"], status: "mapped", networkScopes: ["point"], networkTreatment: "incremental", includedInKnownExpansion: true, note: "Regular service / minor repair scales from actual incremental point equipment assets relative to Current Base equipment and remains distinct from 3% maintenance CAPEX." },
  { lineId: "accounting", name: "Бухгалтерский аутсорсинг", allocationIds: ["OPEX-ACCOUNTING"], status: "mapped", networkScopes: ["shared_network"], networkTreatment: "base_only", includedInKnownExpansion: false, note: "One 25k shared accounting function is already in Current Base. No unproven point multiplier is added for 5/9/13." },
  { lineId: "ventilation_grease", name: "Вентиляция и жироуловители", allocationIds: ["OPEX-VENT-GREASE"], status: "mapped", networkScopes: ["production", "point"], networkTreatment: "incremental", includedInKnownExpansion: true, note: "Additional point line uses historical integrated amount per applicable m²; no venue contract confirms inclusion in service charge." },
  { lineId: "uniform_renewal", name: "Обновление спецодежды", allocationIds: ["OPEX-UNIFORM-RENEWAL"], status: "mapped", networkScopes: ["point", "production"], networkTreatment: "incremental", includedInKnownExpansion: true, note: "15k historical line is calibrated per realistic roster employee and applied to additional point roster plus incremental prep-cook roster only." },
  { lineId: "music", name: "Музыка и права", allocationIds: ["OPEX-MUSIC"], status: "mapped", networkScopes: ["point"], networkTreatment: "incremental", includedInKnownExpansion: true, note: "Street Seating receives the current line; takeaway is zero and Foodhall/Creative Cluster music is venue-provided." },
  { lineId: "pest_control", name: "Pest control", allocationIds: ["OPEX-PEST-CONTROL"], status: "mapped", networkScopes: ["production", "point"], networkTreatment: "incremental", includedInKnownExpansion: true, note: "Additional physical points use the historical integrated calibration per applicable area; Current Base retains its production/base-premises portion." },
  { lineId: "software", name: "YUMA / кассовые сервисы", allocationIds: ["OPEX-SOFTWARE"], status: "unresolved", networkScopes: ["shared_network", "point"], networkTreatment: "requires_confirmation", includedInKnownExpansion: false, note: "Historical 6k stays in Current Base once; central versus per-point licensing is a confirmation-required assumption, not a calculated zero." },
  { lineId: "medical", name: "Медосмотры и санитарные документы", allocationIds: ["OPEX-MEDICAL"], status: "mapped", networkScopes: ["point", "production"], networkTreatment: "incremental", includedInKnownExpansion: true, note: "5k historical line is calibrated per realistic food-operation roster employee and excludes the shared manager without a stated requirement." },
  { lineId: "security", name: "Пультовая охрана", allocationIds: ["OPEX-SECURITY-MONITORING"], status: "mapped", networkScopes: ["point"], networkTreatment: "incremental", includedInKnownExpansion: true, note: "Recurring monitoring is distinct from launch video/alarm; venue-security-included Foodhall/Creative Cluster get zero, self-managed Street premises get the line." },
  { lineId: "banking", name: "Банковское обслуживание", allocationIds: ["OPEX-BANKING"], status: "unresolved", networkScopes: ["shared_network"], networkTreatment: "requires_confirmation", includedInKnownExpansion: false, note: "0 / TBD non-acquiring bank tariff remains a disclosed minor assumption gap, not a fabricated contract or a hidden zero." },
  { lineId: "other_opex", name: "Прочие регулярные расходы", allocationIds: ["OPEX-OTHER"], status: "mapped", networkScopes: ["shared_network"], networkTreatment: "base_only", includedInKnownExpansion: false, note: "Historical 66.5k catch-all remains one conservative Current Base/shared contingency; its unknown composition is not copied into Expansion." },
];

/**
 * Every historical line remains visible in Current Base even when its Network
 * ownership/scaling has not yet been approved.  No price is copied here.
 */
const historicalOpexBaseStatuses: Record<HistoricalOpexLineId, HistoricalOpexBaseStatus> = {
  food_cost: "active",
  waste: "active",
  packaging: "active",
  labour: "active",
  rent: "active",
  acquiring: "active",
  aggregator_commission: "not_applicable",
  admin_reserve: "active",
  marketing: "active",
  household: "active",
  utilities: "active",
  equipment_service: "active",
  accounting: "active",
  ventilation_grease: "active",
  uniform_renewal: "active",
  music: "active",
  pest_control: "active",
  software: "active",
  medical: "active",
  security: "active",
  banking: "unresolved",
  other_opex: "active",
};

export const historicalOpexTreatmentCatalog: readonly HistoricalOpexTreatment[] = historicalOpexNetworkTreatmentCatalog.map((entry) => ({
  ...entry,
  baseStatus: historicalOpexBaseStatuses[entry.lineId],
}));

export function historicalOpexTreatmentErrors(catalog = historicalOpexTreatmentCatalog): string[] {
  const errors: string[] = [];
  const expected = new Set<string>(historicalOpexLineIds);
  const allocationIds = new Set<string>(physicalAllocationMap.map((record) => record.id));
  const seen = new Set<string>();
  for (const entry of catalog) {
    if (seen.has(entry.lineId)) errors.push(`Duplicate historical OPEX treatment: ${entry.lineId}.`);
    seen.add(entry.lineId);
    if (!expected.has(entry.lineId)) errors.push(`Unknown historical OPEX treatment: ${entry.lineId}.`);
    if (!entry.baseStatus) errors.push(`Historical OPEX treatment ${entry.lineId} has no Current Base status.`);
    if (!entry.networkScopes.length) errors.push(`Historical OPEX treatment ${entry.lineId} has no stated network scope.`);
    if (entry.networkTreatment === "incremental" && !entry.includedInKnownExpansion) errors.push(`Incremental historical OPEX treatment ${entry.lineId} must be included in known Expansion.`);
    if (entry.networkTreatment !== "incremental" && entry.includedInKnownExpansion) errors.push(`Non-incremental historical OPEX treatment ${entry.lineId} cannot be counted in known Expansion.`);
    if (entry.status === "unresolved" && entry.networkTreatment !== "requires_confirmation") errors.push(`Unresolved historical OPEX treatment ${entry.lineId} must state a confirmation-required boundary.`);
    if (entry.networkTreatment === "requires_confirmation" && entry.status !== "unresolved") errors.push(`Confirmation-required historical OPEX treatment ${entry.lineId} must remain explicitly unresolved.`);
    for (const allocationId of entry.allocationIds) if (!allocationIds.has(allocationId)) errors.push(`Historical OPEX treatment ${entry.lineId} references unknown Physical Allocation ${allocationId}.`);
  }
  for (const id of expected) if (!seen.has(id)) errors.push(`Historical OPEX line has no explicit treatment: ${id}.`);
  return errors;
}

export type PhysicalAllocationMap = typeof physicalAllocationMap;

export function allocationRecordsFor(scope: PhysicalScope) {
  return physicalAllocationMap.filter((record) => record.physicalScope === scope);
}

export function findPhysicalAllocation(id: string) {
  return physicalAllocationMap.find((record) => record.id === id) ?? null;
}

export type AllocationReferenceCatalog = {
  equipmentModuleIds: ReadonlySet<string>;
  equipmentItemIds: ReadonlySet<string>;
  preparationCategoryIds: ReadonlySet<string>;
  financialModelItemIds: ReadonlySet<string>;
  investorStartFieldIds: ReadonlySet<string>;
  networkPlanningItemIds?: ReadonlySet<string>;
};

/** Narrow validation used by tests and future map consumers. */
export function physicalAllocationIntegrityErrors(
  records: readonly PhysicalAllocationRecord[],
  catalog: AllocationReferenceCatalog,
) {
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const record of records) {
    if (seen.has(record.id)) errors.push(`Duplicate allocation record ID: ${record.id}.`);
    seen.add(record.id);
    if (record.status === "confirmed" && record.physicalScope === "unresolved") {
      errors.push(`Confirmed record ${record.id} cannot have unresolved physical scope.`);
    }
    if (record.referenceContext === "integrated_pilot_200m2" && record.referenceOnly !== true) {
      errors.push(`Integrated reference ${record.id} must be marked referenceOnly.`);
    }
    if (record.physicalScope === "production" && record.scalingDriver === "per_point") {
      errors.push(`Production record ${record.id} cannot use per_point scaling.`);
    }
    if (record.physicalScope === "seating_point" && record.appliesTo?.includes("takeaway_point")) {
      errors.push(`Seating-only record ${record.id} cannot apply to takeaway.`);
    }
    for (const reference of record.sourceRefs) {
      if (reference.kind === "equipment_module" && !catalog.equipmentModuleIds.has(reference.id)) errors.push(`${record.id} references unknown equipment module ${reference.id}.`);
      if (reference.kind === "equipment_item" && !catalog.equipmentItemIds.has(reference.id)) errors.push(`${record.id} references unknown equipment item ${reference.id}.`);
      if (reference.kind === "preparation_category" && !catalog.preparationCategoryIds.has(reference.id)) errors.push(`${record.id} references unknown preparation category ${reference.id}.`);
      if (reference.kind === "financial_model_item" && !catalog.financialModelItemIds.has(reference.id)) errors.push(`${record.id} references unknown Financial Model item ${reference.id}.`);
      if (reference.kind === "investor_start_field" && !catalog.investorStartFieldIds.has(reference.id)) errors.push(`${record.id} references unknown Investor Start field ${reference.id}.`);
      if (reference.kind === "network_planning_item" && !catalog.networkPlanningItemIds?.has(reference.id)) errors.push(`${record.id} references unknown Network Planning item ${reference.id}.`);
    }
  }
  return errors;
}
