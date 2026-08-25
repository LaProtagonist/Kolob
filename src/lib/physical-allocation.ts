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
    sourceRefs: [{ kind: "capability_requirement", id: "POINT-WASH-SEATING" }],
    physicalScope: "seating_point",
    scalingDriver: "per_point",
    status: "unresolved",
    referenceContext: "future_physical_object_requirement",
    pricingStatus: "not_priced",
    note: "Нужны вода, канализация, раковина, мойка рабочего инвентаря, sanitation и уборка; тяжёлая купольная мойка не предполагается по умолчанию из-за одноразовой гостевой посуды.",
  },
  {
    id: "POINT-WASH-TAKEAWAY",
    category: "capability",
    name: "Локальная мойка и cleaning kit точки на вынос",
    sourceRefs: [{ kind: "capability_requirement", id: "POINT-WASH-TAKEAWAY" }],
    physicalScope: "takeaway_point",
    scalingDriver: "per_point",
    status: "unresolved",
    referenceContext: "future_physical_object_requirement",
    pricingStatus: "not_priced",
    note: "Нужны вода, канализация, раковина, мойка рабочего инвентаря и sanitation; отдельный состав и цена пока отсутствуют.",
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
    id: "OPEX-SHARED-CANDIDATES",
    category: "opex",
    name: "Административные и общие сервисы",
    sourceRefs: [
      { kind: "financial_model_item", id: "admin_reserve" },
      { kind: "financial_model_item", id: "marketing" },
      { kind: "financial_model_item", id: "accounting" },
      { kind: "financial_model_item", id: "software" },
      { kind: "financial_model_item", id: "security" },
      { kind: "financial_model_item", id: "banking" },
      { kind: "financial_model_item", id: "other_opex" },
    ],
    physicalScope: "unresolved",
    scalingDriver: "manual",
    status: "unresolved",
    referenceContext: "canonical_financial_model",
    pricingStatus: "canonical_source",
    note: "Потенциально shared, но current integrated model не даёт безопасного распределения.",
  },
  {
    id: "OPEX-CLEANING-AND-UTILITIES",
    category: "opex",
    name: "Уборка, коммунальные и обслуживание",
    sourceRefs: [
      { kind: "financial_model_item", id: "household" },
      { kind: "financial_model_item", id: "utilities" },
      { kind: "financial_model_item", id: "equipment_service" },
      { kind: "financial_model_item", id: "ventilation_grease" },
      { kind: "financial_model_item", id: "uniform_renewal" },
      { kind: "financial_model_item", id: "music" },
      { kind: "financial_model_item", id: "pest_control" },
      { kind: "financial_model_item", id: "medical" },
    ],
    physicalScope: "unresolved",
    scalingDriver: "unknown",
    status: "unresolved",
    referenceContext: "canonical_financial_model",
    pricingStatus: "canonical_source",
    note: "Future model must capture greater seating cleaning load without inventing a current price or staffing rule.",
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
