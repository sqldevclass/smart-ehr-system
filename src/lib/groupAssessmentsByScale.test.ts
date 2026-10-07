import { describe, expect, it } from "vitest";
import { groupAssessmentsByScale, type StayAssessment } from "./groupAssessmentsByScale";

const row = (id: string, code: string | null, score = 10): StayAssessment => ({
  id,
  total_score: score,
  assessed_at: "2026-03-05T10:00:00Z",
  profiles: null,
  assessment_scales: code ? { code, name_ru: `name-${code}` } : null,
});

describe("groupAssessmentsByScale", () => {
  it("groups assessments by scale and keeps their incoming (newest-first) order", () => {
    const groups = groupAssessmentsByScale([row("a", "braden"), row("b", "morse"), row("c", "braden")]);
    expect(groups.map((g) => g.code)).toEqual(["braden", "morse"]);
    expect(groups[0].assessments.map((a) => a.id)).toEqual(["a", "c"]);
  });

  it("orders scales Braden, fall risk, GCS, CPOT regardless of input order", () => {
    const groups = groupAssessmentsByScale([
      row("1", "cpot"), row("2", "gcs"), row("3", "humpty_dumpty"), row("4", "braden"), row("5", "morse"),
    ]);
    expect(groups.map((g) => g.code)).toEqual(["braden", "morse", "humpty_dumpty", "gcs", "cpot"]);
  });

  it("puts unknown scales last, alphabetically by name", () => {
    const groups = groupAssessmentsByScale([row("1", "zeta"), row("2", "alpha"), row("3", "braden")]);
    expect(groups.map((g) => g.code)).toEqual(["braden", "alpha", "zeta"]);
  });

  it("skips rows whose scale could not be resolved and handles an empty list", () => {
    expect(groupAssessmentsByScale([row("1", null)])).toEqual([]);
    expect(groupAssessmentsByScale([])).toEqual([]);
  });
});
