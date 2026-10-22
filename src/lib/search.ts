// Single source of truth for search behavior across the whole app.
//
// Rules (mirrored in SQL by the generated `search_norm` columns):
//  - Everything except letters and digits is stripped, case is ignored.
//  - A record matches if EITHER
//      1) the whole input, spaces removed, is found inside one field, OR
//      2) every space-separated word is found in some field.
//  - Matched parts are bolded via getHighlightRanges / <HighlightMatch>.
//
// DB-backed searches use applySearch() against a `search_norm` column.
// In-browser lists use matchesSearch() with the record's searchable fields.

// Mirrors SQL: lower(regexp_replace(x, '[^[:alnum:]]', '', 'g'))
export function normalizeSearch(value?: string | null): string {
  return (value ?? "").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}

export interface SearchQuery {
  whole: string;
  words: string[];
}

export function parseSearch(term: string): SearchQuery | null {
  const words = term.split(/\s+/).map(normalizeSearch).filter(Boolean);
  if (words.length === 0) return null;
  return { whole: words.join(""), words };
}

export function hasSearch(term: string): boolean {
  return parseSearch(term) !== null;
}

// ---- DB-backed search (PostgREST) ----
// Words contain only letters/digits after normalization: safe to inline.

function searchFilter(q: SearchQuery, column: string): string {
  const like = (w: string) => `${column}.ilike.%${w}%`;
  if (q.words.length === 1) return like(q.whole);
  return `${like(q.whole)},and(${q.words.map(like).join(",")})`;
}

type OrCapable<Q> = { or: (filters: string, options?: { referencedTable?: string }) => Q };

export interface ApplySearchOptions {
  // Normalized column to search. Default: "search_norm".
  column?: string;
  // Embedded table (joined with !inner) that holds the column, e.g. "patients".
  referencedTable?: string;
}

export function applySearch<Q extends OrCapable<Q>>(query: Q, term: string, options: ApplySearchOptions = {}): Q {
  const q = parseSearch(term);
  if (!q) return query;
  const { column = "search_norm", referencedTable } = options;
  return query.or(searchFilter(q, column), referencedTable ? { referencedTable } : undefined);
}

// ---- In-browser search ----

// `fields`: the record's searchable display values (raw; normalized here).
export function matchesSearch(fields: Array<string | null | undefined>, term: string): boolean {
  const q = parseSearch(term);
  if (!q) return true;
  const normalized = fields.map(normalizeSearch).filter(Boolean);
  const found = (w: string) => normalized.some((f) => f.includes(w));
  return found(q.whole) || q.words.every(found);
}

// ---- Highlighting ----

export type HighlightRange = [start: number, end: number];

// Ranges (in the ORIGINAL display text) to bold. If the whole input is found in
// this text, only that is bolded; otherwise every matching word is.
// `alternates`: other normalized forms of the same value (e.g. DOB yyyymmdd) --
// a match there bolds the whole text.
export function getHighlightRanges(text: string, term: string, alternates: string[] = []): HighlightRange[] {
  const q = parseSearch(term);
  if (!q || !text) return [];

  // Normalized text plus, per normalized char, its index in the original text.
  let norm = "";
  const origIndex: number[] = [];
  Array.from(text).reduce((offset, ch) => {
    for (const c of normalizeSearch(ch)) {
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
