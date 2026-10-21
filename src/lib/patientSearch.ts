// Single source of truth for patient search. Used by every patient search box,
// both DB-backed (applyPatientSearch) and in-browser (matchesPatientSearch),
// so all of them match exactly the same things.
//
// Rules:
//  - Input is split on whitespace; EVERY word must match (AND), e.g. "Babajanov 19.03".
//  - A word shaped like a date start (19 / 19.03 / 19.03.19 / 19.03.1988) matches
//    the START of the DOB as dd.mm.yyyy. "/" and "-" are read as ".".
//  - A word containing "." or "/" is date-only. Plain digits (and "-") also match
//    text fields, since "19" may be a day or part of a phone / patient number.
//  - Characters that could break the PostgREST filter syntax are stripped.

const TEXT_FIELDS = ["last_name", "first_name", "middle_name", "phone", "patient_number"] as const;
const DOB_SHAPE = /^\d{1,2}(?:[./-]\d{0,2}(?:[./-]\d{0,4})?)?$/;
const UNSAFE_CHARS = /[^\p{L}\p{N}\s.\-/+']/gu;

export const PATIENT_SEARCH_PLACEHOLDER = {
  ru: "ФИО, телефон, П# или дата рождения (дд.мм.гггг)",
  en: "Name, phone, patient # or DOB (dd.mm.yyyy)",
} as const;

export interface PatientSearchToken {
  text: string;
  dobPrefix: string | null;
  dobOnly: boolean;
}

export function parsePatientSearch(term: string): PatientSearchToken[] {
  return term
    .replace(UNSAFE_CHARS, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((text) => {
      if (!DOB_SHAPE.test(text)) return { text, dobPrefix: null, dobOnly: false };
      return { text, dobPrefix: text.replace(/[/-]/g, "."), dobOnly: /[./]/.test(text) };
    });
}

// ---- DB-backed search (PostgREST) ----

function tokenFilter(token: PatientSearchToken): string {
  const parts: string[] = [];
  if (!token.dobOnly) {
    parts.push(...TEXT_FIELDS.map((f) => `${f}.ilike."%${token.text}%"`));
  }
  if (token.dobPrefix) {
    // patients.dob_search is a generated dd.mm.yyyy text column.
    parts.push(`dob_search.like."${token.dobPrefix}%"`);
  }
  return parts.join(",");
}

type OrCapable<Q> = { or: (filters: string, options?: { referencedTable?: string }) => Q };

// Applies the search to a supabase query on `patients`, or on a table that embeds
// patients with !inner (pass { referencedTable: "patients" }).
export function applyPatientSearch<Q extends OrCapable<Q>>(
  query: Q,
  term: string,
  options?: { referencedTable?: string }
): Q {
  return parsePatientSearch(term).reduce((q, token) => q.or(tokenFilter(token), options), query);
}

// ---- In-browser search (already-loaded lists) ----

export interface PatientSearchFields {
  first_name?: string | null;
  last_name?: string | null;
  middle_name?: string | null;
  phone?: string | null;
  patient_number?: string | null;
  date_of_birth?: string | null;
}

// date_of_birth is a plain "yyyy-mm-dd" date: format from the string, never via
// new Date() (which shifts the day in timezones behind UTC).
export function formatDobForSearch(dob?: string | null): string {
  if (!dob) return "";
  const [y, m, d] = dob.slice(0, 10).split("-");
  return y && m && d ? `${d}.${m}.${y}` : "";
}

export function matchesPatientSearch(patient: PatientSearchFields | null | undefined, term: string): boolean {
  const tokens = parsePatientSearch(term);
  if (tokens.length === 0) return true;
  if (!patient) return false;
  const haystack = TEXT_FIELDS.map((f) => patient[f] ?? "").join(" ").toLowerCase();
  const dob = formatDobForSearch(patient.date_of_birth);
  return tokens.every(
    (t) =>
      (!t.dobOnly && haystack.includes(t.text.toLowerCase())) ||
      (!!t.dobPrefix && dob.startsWith(t.dobPrefix))
  );
}

