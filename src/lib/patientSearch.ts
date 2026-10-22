// Single source of truth for patient search, used by every patient search box.
//
// Rules (mirrored in SQL by the generated column patients.search_norm):
//  - Everything except letters and digits is stripped, case is ignored.
//  - A patient matches if EITHER
//      1) the whole input, spaces removed, is found inside one field
//         ("90 123 45 67" -> phone, "Babajanov Brian" -> name), OR
//      2) every space-separated word is found in some field
//         ("Babajanov 19.03" -> name + DOB).
//  - Fields: name (last+first+middle and first+last), phone, patient number,
//    DOB as ddmmyyyy and yyyymmdd.

export const PATIENT_SEARCH_PLACEHOLDER = {
  ru: "ФИО, телефон, П# или дата рождения",
  en: "Name, phone, patient # or date of birth",
} as const;

// Mirrors SQL: lower(regexp_replace(x, '[^[:alnum:]]', '', 'g'))
export function normalizeSearch(value?: string | null): string {
  return (value ?? "").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}

export interface PatientSearchQuery {
  whole: string;
  words: string[];
}

export function parsePatientSearch(term: string): PatientSearchQuery | null {
  const words = term.split(/\s+/).map(normalizeSearch).filter(Boolean);
  if (words.length === 0) return null;
  return { whole: words.join(""), words };
}

export function hasPatientSearch(term: string): boolean {
  return parsePatientSearch(term) !== null;
}

// ---- DB-backed search (PostgREST, column patients.search_norm) ----
// Words contain only letters/digits after normalization: safe to inline.

function patientSearchFilter(q: PatientSearchQuery): string {
  const like = (w: string) => `search_norm.ilike.%${w}%`;
  if (q.words.length === 1) return like(q.whole);
  return `${like(q.whole)},and(${q.words.map(like).join(",")})`;
}

type OrCapable<Q> = { or: (filters: string, options?: { referencedTable?: string }) => Q };

// Applies the search to a query on `patients`, or on a table embedding patients
// with !inner (pass { referencedTable: "patients" }).
export function applyPatientSearch<Q extends OrCapable<Q>>(
  query: Q,
  term: string,
  options?: { referencedTable?: string }
): Q {
  const q = parsePatientSearch(term);
  return q ? query.or(patientSearchFilter(q), options) : query;
}

// ---- Shared field helpers ----

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

function searchFields(p: PatientSearchFields): string[] {
  return [
    normalizeSearch(`${p.last_name ?? ""}${p.first_name ?? ""}${p.middle_name ?? ""}`),
    normalizeSearch(`${p.first_name ?? ""}${p.last_name ?? ""}`),
    normalizeSearch(p.phone),
    normalizeSearch(p.patient_number),
    normalizeSearch(formatDob(p.date_of_birth)),
    dobIsoDigits(p.date_of_birth),
  ].filter(Boolean);
}

// ---- In-browser search (already-loaded lists) ----

export function matchesPatientSearch(patient: PatientSearchFields | null | undefined, term: string): boolean {
  const q = parsePatientSearch(term);
  if (!q) return true;
  if (!patient) return false;
  const fields = searchFields(patient);
  const found = (w: string) => fields.some((f) => f.includes(w));
  return found(q.whole) || q.words.every(found);
}

// ---- Highlighting ----

export type HighlightRange = [start: number, end: number];

// Ranges (in the ORIGINAL display text) to bold. If the whole input is found in
// this text, only that is bolded; otherwise every matching word is.
// `alternates`: other normalized forms of the same value (e.g. DOB yyyymmdd) --
// a match there bolds the whole text.
export function getHighlightRanges(text: string, term: string, alternates: string[] = []): HighlightRange[] {
  const q = parsePatientSearch(term);
  if (!q || !text) return [];

  // Normalized text plus, per normalized char, its index in the original text.
  let norm = "";
  const origIndex: number[] = [];
  Array.from(text).reduce((offset, ch) => {
    const n = normalizeSearch(ch);
    for (const c of n) {
      norm += c;
      origIndex.push(offset);
    }
    return offset + ch.length;
  }, 0);

  const rangesFor = (needle: string): HighlightRange[] => {
    const out: HighlightRange[] = [];
    for (let i = norm.indexOf(needle); i !== -1; i = norm.indexOf(needle, i + needle.length)) {
      const last = origIndex[i + needle.length - 1];
      out.push([origIndex[i], last + Array.from(text.slice(last))[0].length]);
    }
    return out;
  };

  const whole = rangesFor(q.whole);
  if (whole.length) return whole;

  const words = q.words.flatMap(rangesFor);
  if (words.length) return mergeRanges(words);

  const needles = [q.whole, ...q.words];
  return alternates.some((a) => needles.some((n) => a.includes(n))) ? [[0, text.length]] : [];
}

function mergeRanges(ranges: HighlightRange[]): HighlightRange[] {
  const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
  return sorted.reduce<HighlightRange[]>((acc, r) => {
    const prev = acc[acc.length - 1];
    if (prev && r[0] <= prev[1]) prev[1] = Math.max(prev[1], r[1]);
    else acc.push([...r]);
    return acc;
  }, []);
}

