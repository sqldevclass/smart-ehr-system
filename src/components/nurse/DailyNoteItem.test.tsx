import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import DailyNoteItem from "./DailyNoteItem";

const note = {
  id: "n1",
  note_text: "Состояние стабильное.",
  recorded_at: new Date(2026, 9, 7, 7, 30).toISOString(),
  profiles: { full_name: "Медсестра Тест" },
};

describe("DailyNoteItem", () => {
  it("shows the note text and who wrote it", () => {
    render(<DailyNoteItem note={note} />);
    expect(screen.getByText("Состояние стабильное.")).toBeInTheDocument();
    expect(screen.getByText("· Медсестра Тест")).toBeInTheDocument();
  });

  it("leaves out the author when it is unknown", () => {
    render(<DailyNoteItem note={{ ...note, profiles: null }} />);
    expect(screen.getByText("Состояние стабильное.")).toBeInTheDocument();
    expect(screen.queryByText(/^·/)).not.toBeInTheDocument();
  });
});
