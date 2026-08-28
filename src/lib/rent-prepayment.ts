/**
 * Contractual rent and its cash settlement are deliberately separate.
 * A rent-free month creates no contractual charge and does not consume a
 * prepaid month.  Once rent is payable, the existing prepaid balance is
 * applied before any new cash payment is required.
 */
export type RentPrepaymentMonth = {
  operatingMonth: number;
  contractualRentRub: number;
  prepaidRentCreditRub: number;
  cashRentPaymentRub: number;
  remainingPrepaidMonths: number;
};

export type RentPrepaymentCoverage = {
  monthlyRentRub: number;
  prepaidMonths: number;
  prepaidRentRub: number;
  reserveMonths: number;
  coveredRentMonths: number;
  uncoveredRentMonths: number;
  rentFreeMonths: number;
  uncoveredRentRub: number;
};

export function rentPrepaymentMonth(input: {
  operatingMonth: number;
  monthlyRentRub: number;
  prepaidMonths: number;
  rentFreeMonths: number;
}): RentPrepaymentMonth {
  const operatingMonth = Math.max(0, input.operatingMonth);
  const monthlyRentRub = Math.max(0, input.monthlyRentRub);
  const prepaidMonths = Math.max(0, input.prepaidMonths);
  const rentFreeMonths = Math.max(0, input.rentFreeMonths);
  const payableMonth = Math.max(0, operatingMonth - rentFreeMonths);
  const contractualRentRub = operatingMonth === 0 || operatingMonth <= rentFreeMonths ? 0 : monthlyRentRub;
  const prepaidRentCreditRub = contractualRentRub > 0 && payableMonth <= prepaidMonths ? monthlyRentRub : 0;
  return {
    operatingMonth,
    contractualRentRub,
    prepaidRentCreditRub,
    cashRentPaymentRub: contractualRentRub - prepaidRentCreditRub,
    remainingPrepaidMonths: Math.max(0, prepaidMonths - payableMonth),
  };
}

export function rentPrepaymentCoverage(input: {
  monthlyRentRub: number;
  prepaidMonths: number;
  rentFreeMonths: number;
  reserveMonths: number;
}): RentPrepaymentCoverage {
  const monthlyRentRub = Math.max(0, input.monthlyRentRub);
  const prepaidMonths = Math.max(0, input.prepaidMonths);
  const rentFreeMonths = Math.max(0, input.rentFreeMonths);
  const reserveMonths = Math.max(0, input.reserveMonths);
  const payableMonthsWithinReserve = Math.max(0, reserveMonths - rentFreeMonths);
  const coveredRentMonths = Math.min(payableMonthsWithinReserve, prepaidMonths);
  const uncoveredRentMonths = Math.max(0, payableMonthsWithinReserve - coveredRentMonths);
  return {
    monthlyRentRub,
    prepaidMonths,
    prepaidRentRub: monthlyRentRub * prepaidMonths,
    reserveMonths,
    coveredRentMonths,
    uncoveredRentMonths,
    rentFreeMonths,
    uncoveredRentRub: monthlyRentRub * uncoveredRentMonths,
  };
}
