import { describe, expect, it } from "vitest";
import { formatRelativeTime } from "./formatRelativeTime";

const now = new Date("2026-10-07T10:00:00Z");
const at = (ms: number) => new Date(now.getTime() + ms);
const MIN = 60_000;

describe("formatRelativeTime", () => {
  it("reports 'просрочено' once the due time has passed or arrived", () => {
    expect(formatRelativeTime(at(0), now)).toBe("просрочено");
    expect(formatRelativeTime(at(-5 * MIN), now)).toBe("просрочено");
  });

  it("formats minutes only", () => {
    expect(formatRelativeTime(at(45 * MIN), now)).toBe("через 45 мин");
  });

  it("formats whole hours", () => {
    expect(formatRelativeTime(at(120 * MIN), now)).toBe("через 2 ч");
  });

  it("formats hours and minutes", () => {
    expect(formatRelativeTime(at(125 * MIN), now)).toBe("через 2 ч 5 мин");
  });
});
