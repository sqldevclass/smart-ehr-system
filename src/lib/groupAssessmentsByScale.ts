export interface StayAssessment {
  id: string;
  total_score: number;
  assessed_at: string;
  profiles?: { full_name?: string | null } | null;
  assessment_scales: { code: string; name_ru: string } | null;
}

export interface ScaleGroup {
  code: string;
  name: string;
  assessments: StayAssessment[];
}

/** Display order of the scales; any scale not listed here goes last, alphabetically. */
const SCALE_ORDER = ["braden", "morse", "humpty_dumpty", "gcs", "cpot"];

const orderOf = (code: string) => {
  const i = SCALE_ORDER.indexOf(code);
  return i === -1 ? SCALE_ORDER.length : i;
};

/** Groups assessments by scale. Within a group the input order (newest first) is kept. */
export function groupAssessmentsByScale(rows: StayAssessment[]): ScaleGroup[] {
  const byCode = new Map<string, ScaleGroup>();
  for (const row of rows) {
    if (!row.assessment_scales) continue;
    const { code, name_ru } = row.assessment_scales;
    if (!byCode.has(code)) byCode.set(code, { code, name: name_ru, assessments: [] });
    byCode.get(code)!.assessments.push(row);
  }
  return [...byCode.values()].sort(
    (a, b) => orderOf(a.code) - orderOf(b.code) || a.name.localeCompare(b.name),
  );
}
