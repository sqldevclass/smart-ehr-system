import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import PainReadingCell, { type PainReading } from "./PainReadingCell";

const reading: PainReading = {
  id: "p1",
  score: 8,
  recorded_at: new Date(2026, 9, 7, 9, 30).toISOString(),
  pain_character: ["Ж", "Туп"],
  pain_location: "Грудная клетка",
  profiles: { full_name: "Медсестра Тест" },
};

describe("PainReadingCell", () => {
  it("shows the score out of 10, colored by severity", () => {
    render(<PainReadingCell reading={reading} />);
    expect(screen.getByText("8").className).toContain("text-red-700");
    expect(screen.getByText("/10")).toBeInTheDocument();
  });

  it("shows the local date and time", () => {
    render(<PainReadingCell reading={reading} />);
    expect(screen.getByText("07.10 09:30")).toBeInTheDocument();
  });

  it("spells out the character tags and the location", () => {
    render(<PainReadingCell reading={reading} />);
    expect(screen.getByText("Жгучая, Тупая")).toBeInTheDocument();
    expect(screen.getByText("Грудная клетка")).toBeInTheDocument();
  });

  it("falls back to the raw code for a tag it does not know", () => {
    render(<PainReadingCell reading={{ ...reading, pain_character: ["ZZ"] }} />);
    expect(screen.getByText("ZZ")).toBeInTheDocument();
  });

  it("leaves out the character and location lines when there are none", () => {
    render(<PainReadingCell reading={{ ...reading, pain_character: null, pain_location: null }} />);
    expect(screen.queryByText("Жгучая, Тупая")).not.toBeInTheDocument();
    expect(screen.queryByText("Грудная клетка")).not.toBeInTheDocument();
  });

  it("shows who entered it when the date is focused", async () => {
    render(<PainReadingCell reading={reading} />);
    fireEvent.focus(screen.getByText("07.10 09:30"));
    expect((await screen.findAllByText("Внесено: Медсестра Тест")).length).toBeGreaterThan(0);
  });

  it("renders extra lines passed as children (the live card's next-due line)", () => {
    render(
      <PainReadingCell reading={reading}>
        <div>Следующая оценка: скоро</div>
      </PainReadingCell>,
    );
    expect(screen.getByText("Следующая оценка: скоро")).toBeInTheDocument();
  });
});
