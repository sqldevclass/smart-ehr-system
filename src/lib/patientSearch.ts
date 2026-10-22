// Patient-specific search definition on top of the generic engine (src/lib/search.ts).
// DB column: patients.search_norm =
//   last+first+middle | first+last | phone | patient_number | ddmmyyyy | yyyymmdd
import { applySearch, hasSearch, matchesSearch, normalizeSearch } from "@/lib/search";

export const PATIENT_SEARCH_PLACEHOLDER = {
  ru: "ФИО, телефон, П# или дата рождения",
  en: "Name, phone, patient # or date of birth",
} as const;

export interface PatientSearchFields {
  first_name?: string | null;
  last_name?: string | null;
  middle_name?: string | null;
  phone?: string | null;
  patient_number?: string | null;
  date_of_birth?: string | null;
}

// date_of_birth is a plain "yyyy-mm-dd": format from the string, never via new Date()
// (which shifts the day in timezones behind UTC).
export function formatDob(dob?: string | null): string {
  if (!dob) return "";
  const [y, m, d] = dob.slice(0, 10).split("-");
  return y && m && d ? `${d}.${m}.${y}` : "";
}

// Alternate normalized DOB form (yyyymmdd), so ISO-typed input also matches/highlights.
export function dobIsoDigits(dob?: string | null): string {
  return normalizeSearch(dob?.slice(0, 10));
}

// Same fields, same order as patients.search_norm.
function patientSearchFields(p: PatientSearchFields): string[] {
  return [
    `${p.last_name ?? ""}${p.first_name ?? ""}${p.middle_name ?? ""}`,
    `${p.first_name ?? ""}${p.last_name ?? ""}`,
    p.phone ?? "",
    p.patient_number ?? "",
    formatDob(p.date_of_birth),
    p.date_of_birth?.slice(0, 10) ?? "",
  ];
}

export function matchesPatientSearch(patient: PatientSearchFields | null | undefined, term: string): boolean {
  return matchesSearch(patient ? patientSearchFields(patient) : [], term);
}

// Patient search uses the same column name (search_norm), so these are the generic ones.
export { applySearch as applyPatientSearch, hasSearch as hasPatientSearch };
