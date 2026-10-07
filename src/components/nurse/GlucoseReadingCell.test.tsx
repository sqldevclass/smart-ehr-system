import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import GlucoseReadingCell from "./GlucoseReadingCell";

const at = new Date(2026, 9, 7, 8, 0).toISOString();
const cell = (value: string | number) => (
  <GlucoseReadingCell reading={{ id: "g", value_mmol: value, recorded_at: at }} />
);

describe("GlucoseReadingCell", () => {
  it("shows whole numbers without decimals and others with one", () => {
    const { rerender } = render(cell("5"));
    expect(screen.getByText("5", { exact: false })).toBeInTheDocument();
    rerender(cell("5.46"));
    expect(screen.getByText("5.5", { exact: false })).toBeInTheDocument();
  });

  it("shows the unit and the local date and time", () => {
    render(cell("5"));
    expect(screen.getByText("ммоль/л")).toBeInTheDocument();
    expect(screen.getByText("07.10 08:00")).toBeInTheDocument();
  });

  it("colors above 7.8 yellow, below 3.9 pink, and the range between them neutral", () => {
    const colorOf = (value: string) => {
      const { container, unmount } = render(cell(value));
      const cls = (container.querySelector(".text-sm") as HTMLElement).className;
      unmount();
      return cls;
    };
    expect(colorOf("7.9")).toContain("text-yellow-700");
    expect(colorOf("3.8")).toContain("text-pink-700");
    expect(colorOf("7.8")).toContain("text-gray-800");
    expect(colorOf("3.9")).toContain("text-gray-800");
  });
});
