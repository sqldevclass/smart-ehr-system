import { WOUND_CULTURE_CODE, WOUND_INFECTION_SIGNS } from "@/lib/deviceForms";

export type WoundRecord = {
  hospitalization_id: string;
  recorded_at: string;
  responses: Record<string, any> | null;
};

export interface WoundInfectionSummary {
  entries: number;
  flaggedEntries: number;
  firstSignAt: string | null;
  lastSignAt: string | null;
  signCodes: string[];
  lastEntryPositive: boolean;
  cultureTaken: boolean;
  cultureNote: string | null;
  antibioticProphylaxis: boolean | null;
}

export function isWoundEntry(r: WoundRecord): boolean {
  return !!r.responses && Object.keys(r.responses).some((k) => k.startsWith("wound_"));
}

export function positiveSigns(r: WoundRecord) {
  return WOUND_INFECTION_SIGNS.filter((c) => r.responses?.[c.code] === true);
}

export function summarizeWoundInfection(records: WoundRecord[]): Map<string, WoundInfectionSummary> {
  const sorted = records
    .filter(isWoundEntry)
    .slice()
    .sort((a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime());
  const out = new Map<string, WoundInfectionSummary & { codes: Set<string> }>();
  for (const r of sorted) {
    const s =
      out.get(r.hospitalization_id) ||
      {
        entries: 0, flaggedEntries: 0, firstSignAt: null, lastSignAt: null, signCodes: [],
        lastEntryPositive: false, cultureTaken: false, cultureNote: null, antibioticProphylaxis: null,
        codes: new Set<string>(),
      };
    const signs = positiveSigns(r);
    s.entries += 1;
    s.lastEntryPositive = signs.length > 0;
    if (signs.length) {
      s.flaggedEntries += 1;
      if (!s.firstSignAt) s.firstSignAt = r.recorded_at;
      s.lastSignAt = r.recorded_at;
      signs.forEach((c) => s.codes.add(c.code));
    }
    const resp = r.responses!;
    if (resp[WOUND_CULTURE_CODE] === true) {
      s.cultureTaken = true;
      const note = resp[`${WOUND_CULTURE_CODE}_note`];
      s.cultureNote = note ? String(note) : null;
    }
    if ("antibiotic_prophylaxis" in resp) s.antibioticProphylaxis = !!resp.antibiotic_prophylaxis;
    out.set(r.hospitalization_id, s);
  }
  const result = new Map<string, WoundInfectionSummary>();
  out.forEach(({ codes, ...s }, id) => {
    result.set(id, { ...s, signCodes: WOUND_INFECTION_SIGNS.filter((c) => codes.has(c.code)).map((c) => c.code) });
  });
  return result;
}
