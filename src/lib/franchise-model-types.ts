/** Independent research contract. No InvestorConfiguration or baseline state. */
export type ParameterStatus =
  | "CONFIRMED"
  | "WORKING"
  | "REFERENCE"
  | "MISSING"
  | "NOT_APPLICABLE"
  | "DERIVED";
export type DataState =
  | {
      kind: "value";
      value: number;
      status: Exclude<ParameterStatus, "MISSING" | "NOT_APPLICABLE">;
    }
  | { kind: "missing"; reason: string }
  | { kind: "not_applicable"; reason: string };
export type EquipmentSelection = {
  itemId: string;
  selected: boolean;
  quantity: number | null;
  override: number | null;
};
export type IntegrationSettings = {
  version: 2;
  equipmentMode: "bom" | "manual";
  nodeBom: EquipmentSelection[];
  franchiseBom: EquipmentSelection[];
  bar: boolean;
  grow: boolean;
  taxMode: "reference" | "manual";
  maintenanceMode: "reference" | "manual";
  ownOpexMode: "structured" | "manual";
  seasonality: boolean;
  calendarStartMonth: number;
};
export type Validity = "COMPLETE" | "PRELIMINARY" | "INVALID";
export type Parameter = {
  id: string;
  assumptionId: string;
  label: string;
  value: number | null;
  unit: string;
  status: ParameterStatus;
  group: string;
  note: string;
  min: number;
  max: number | null;
  kind: string;
  presets: number[];
  required: boolean;
  source: string;
};
export type Point = {
  id: string;
  month: number;
  type: "OWN" | "FRANCHISE";
  name: string;
  active: boolean;
  /** Null row overrides inherit scenario inputs, never a fictitious zero. */
  revenueDay: number | null;
  averageCheck: number | null;
  days: number | null;
  labor: number | null;
  rent: number | null;
  opex: number | null;
  capex: number | null;
  ramp?: "reference" | "mature";
};
export type Expansion = {
  id: string;
  month: number;
  capacity: number;
  capex: number | null;
  opex: number | null;
  fte: number | null;
};
export type CapitalCall = { id: string; month: number; amount: number | null };
export type Scenario = {
  schemaVersion: 1;
  id: string;
  name: string;
  custom: boolean;
  inputs: Record<string, number | null>;
  /** Explicit edits turn research placeholders (including an explicit 0) into working assumptions. */
  edited: string[];
  rollout: Point[];
  expansions: Expansion[];
  capitalCalls: CapitalCall[];
  integration?: IntegrationSettings;
};
export type ScenarioStore = {
  schemaVersion: 1;
  activeId: string;
  compareIds: string[];
  scenarios: Scenario[];
};
export type Line = { label: string; amount: number };
export type Issue = {
  id: string;
  message: string;
  severity: "missing" | "warning" | "invalid";
  month?: number;
};
export type WaterfallMonth = {
  month: number;
  draw: number;
  growthDraw: number;
  distributions: number | null;
  investorCf: number | null;
  retained: number | null;
  cashBalance: number | null;
  reserveFloor: number;
  reserveRestoration: number | null;
  distributable: number | null;
  totalDrawn: number;
  cumulativeDistributions: number | null;
  cap: number;
  fundingGap: number;
  futureCapexReserve: number;
  reserveBlocked: boolean;
  validated: boolean;
};
export type InvestorResult = {
  timeline: WaterfallMonth[];
  totalDrawn: number;
  undrawn: number;
  distributions: number | null;
  outstanding: number | null;
  principalMonth: number | null;
  capMonth: number | null;
  cap: number;
  irr: number | null;
  moic: number | null;
  retained: number | null;
  retainedAllocations: number | null;
  coverage: number | null;
  valid: boolean;
  completeInputs: boolean;
  issues: Issue[];
};
