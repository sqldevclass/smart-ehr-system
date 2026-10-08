/** One calendar day of a hospitalization's fluid balance, in millilitres. */
export interface FluidDay {
  day: string; // "YYYY-MM-DD", the hospital's local date
  intake_ml: number;
  output_ml: number;
}

export const dayBalance = (day: FluidDay) => day.intake_ml - day.output_ml;

export function fluidTotals(days: FluidDay[]) {
  const intake = days.reduce((sum, d) => sum + d.intake_ml, 0);
  const output = days.reduce((sum, d) => sum + d.output_ml, 0);
  return { intake, output, balance: intake - output };
}

/** "+250 мл" / "-100 мл" */
export const formatSignedMl = (ml: number) => `${ml >= 0 ? "+" : ""}${ml} мл`;

/** Positive balance is blue, negative is red, as on the live fluid card. */
export const balanceColorClass = (ml: number) => (ml >= 0 ? "text-blue-700" : "text-red-700");
