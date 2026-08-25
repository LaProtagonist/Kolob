/**
 * Shared employer-contribution treatment.
 *
 * The canonical Financial Model and the local Network Planning projection use
 * this one calculation. The planning layer supplies only its roster counts;
 * it never forks the approved contribution formula.
 */
export type EmployerContributionPolicy = {
  scenario: "reduced" | "standard";
  reduced: {
    mrotRub: number;
    thresholdMultiple: number;
    rateBelowThreshold: number;
    rateAboveThreshold: number;
  };
  standard: { rate: number };
  personnelReserveRate: number;
};

export type PayrollRoleInput = { headcount: number; grossSalaryRub: number };

function round(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function calculateEmployerContributions(
  roles: readonly PayrollRoleInput[],
  policy: EmployerContributionPolicy,
): { payrollRub: number; employerContributionsRub: number; personnelReserveRub: number; totalLaborRub: number } {
  const payroll = roles.reduce((total, role) => total + role.headcount * role.grossSalaryRub, 0);
  const employerContributions = policy.scenario === "standard"
    ? payroll * policy.standard.rate
    : roles.reduce((total, role) => {
      const threshold = policy.reduced.mrotRub * policy.reduced.thresholdMultiple;
      const perEmployee = Math.min(role.grossSalaryRub, threshold) * policy.reduced.rateBelowThreshold
        + Math.max(role.grossSalaryRub - threshold, 0) * policy.reduced.rateAboveThreshold;
      return total + role.headcount * perEmployee;
    }, 0);
  const personnelReserve = (payroll + employerContributions) * policy.personnelReserveRate;
  return {
    payrollRub: round(payroll),
    employerContributionsRub: round(employerContributions),
    personnelReserveRub: round(personnelReserve),
    totalLaborRub: round(payroll + employerContributions + personnelReserve),
  };
}
