import { differenceInYears } from "date-fns";

export function getFallRiskScaleCode(
  dateOfBirth: string | null | undefined,
): "humpty_dumpty" | "morse" | undefined {
  if (!dateOfBirth) return undefined;
  const ageYears = differenceInYears(new Date(), new Date(dateOfBirth));
  return ageYears < 18 ? "humpty_dumpty" : "morse";
}
