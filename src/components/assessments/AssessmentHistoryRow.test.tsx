import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import AssessmentHistoryRow from "./AssessmentHistoryRow";

const assessment = {
  total_score: 12,
  assessed_at: "2026-03-05T10:00:00Z",
  profiles: { full_name: "Медсестра Тест" },
};

describe("AssessmentHistoryRow", () => {
  it("shows the score with its risk label for the scale", () => {
    render(<AssessmentHistoryRow assessment={assessment} scaleCode="braden" />);
    expect(screen.getByText("12 — Высокий риск")).toBeInTheDocument();
  });

  it("uses the scale's own bands (the same score means something else on another scale)", () => {
    render(<AssessmentHistoryRow assessment={{ ...assessment, total_score: 60 }} scaleCode="morse" />);
    expect(screen.getByText("60 — Высокий риск падения")).toBeInTheDocument();
  });

  it("shows who entered it when the date is focused", async () => {
    render(<AssessmentHistoryRow assessment={assessment} scaleCode="braden" />);
    fireEvent.focus(screen.getByText(/05\.03\.2026/));
    expect((await screen.findAllByText("Внесено: Медсестра Тест")).length).toBeGreaterThan(0);
  });

  it("falls back to a dash when the author is unknown", async () => {
    render(<AssessmentHistoryRow assessment={{ ...assessment, profiles: null }} scaleCode="braden" />);
    fireEvent.focus(screen.getByText(/05\.03\.2026/));
    expect((await screen.findAllByText("Внесено: —")).length).toBeGreaterThan(0);
  });
});
