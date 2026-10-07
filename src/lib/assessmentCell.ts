import { differenceInYears } from "date-fns";
import { getDailyNoteStatus } from "@/lib/dailyNoteSchedule";

export interface ScaleSummary {
  code: string;
  total_score: number;
  risk_level: string | null;
  assessed_at: string;
  next_assessment_at: string | null;
}

export interface AssessmentSummary {
  scales: ScaleSummary[];
  pain: { score: number; recorded_at: string; next_assessment_at: string | null } | null;
  daily_notes: { activated_at: string; last_note_at: string | null } | null;
  allergies: { description: string; allergy_type: string; severity: string | null }[];
}

export type FallRiskScale = "morse" | "humpty_dumpty";
export type BadgeTone = "red" | "orange" | "yellow";

export interface ExtraBadge {
  key: "gcs" | "cpot" | "pain";
  tone: BadgeTone;
  tooltip: string;
}

export interface AssessmentCellModel {
  bradenScore: number | null;
  fallRiskScore: number | null;
  fallRiskScale: FallRiskScale | undefined;
  extraBadges: ExtraBadge[];
  allergies: AssessmentSummary["allergies"];
  pending: string[];
}

export function buildAssessmentCell(
  summary: AssessmentSummary,
  dob: string | null | undefined,
  now: Date,
  tz: string,
): AssessmentCellModel {
  const latest = (code: string) => summary.scales.find((s) => s.code === code) ?? null;
  const isDue = (next: string | null | undefined) => !!next && new Date(next) <= now;

  // Braden and fall risk: rules carried over unchanged from the old nurse list.
  // "Never assessed" still counts as pending for these two.
  const braden = latest("braden");
  const fallRiskScale: FallRiskScale | undefined = dob
    ? differenceInYears(now, new Date(dob)) < 18
      ? "humpty_dumpty"
      : "morse"
    : undefined;
  const fall = fallRiskScale ? latest(fallRiskScale) : null;
  const bradenPending = !braden || isDue(braden.next_assessment_at);
  const fallRiskPending = fallRiskScale ? !fall || isDue(fall.next_assessment_at) : false;

  const pending: string[] = [];
  if (bradenPending) pending.push("Шкала Брадена");
  if (fallRiskPending) {
    pending.push(fallRiskScale === "humpty_dumpty" ? "Шкала Хамти Дамти" : "Шкала Морзе");
  }

  // Newly tracked items: pending only once a due time exists and has passed.
  const gcs = latest("gcs");
  if (gcs && isDue(gcs.next_assessment_at)) pending.push("Шкала Глазго");
  const cpot = latest("cpot");
  if (cpot && isDue(cpot.next_assessment_at)) pending.push("CPOT");
  if (summary.pain && isDue(summary.pain.next_assessment_at)) pending.push("Оценка боли");
  if (summary.daily_notes) {
    const status = getDailyNoteStatus(
      summary.daily_notes.last_note_at ? new Date(summary.daily_notes.last_note_at) : null,
      now,
      tz,
    );
    if (status.overdue) pending.push("Дневниковые записи");
  }

  const extraBadges: ExtraBadge[] = [];
  if (gcs) {
    const s = gcs.total_score;
    if (s <= 8) extraBadges.push({ key: "gcs", tone: "red", tooltip: `Глазго: ${s} — Тяжёлое нарушение сознания` });
    else if (s <= 12) extraBadges.push({ key: "gcs", tone: "yellow", tooltip: `Глазго: ${s} — Умеренное нарушение сознания` });
  }
  if (cpot) {
    const s = cpot.total_score;
    if (s >= 6) extraBadges.push({ key: "cpot", tone: "red", tooltip: `CPOT: ${s} — Сильная боль` });
    else if (s >= 2) extraBadges.push({ key: "cpot", tone: "yellow", tooltip: `CPOT: ${s} — Боль есть` });
  }
  if (summary.pain) {
    const s = summary.pain.score;
    const tone: BadgeTone | null = s >= 7 ? "red" : s >= 4 ? "orange" : s >= 1 ? "yellow" : null;
    if (tone) extraBadges.push({ key: "pain", tone, tooltip: `Боль: ${s}/10` });
  }

  return {
    bradenScore: braden?.total_score ?? null,
    fallRiskScore: fall?.total_score ?? null,
    fallRiskScale,
    extraBadges,
    allergies: summary.allergies,
    pending,
  };
}
