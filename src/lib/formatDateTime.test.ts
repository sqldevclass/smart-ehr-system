import { describe, expect, it } from "vitest";
import { formatDateTime } from "./formatDateTime";

describe("formatDateTime", () => {
  it("formats day.month and 24-hour time in local time, zero-padded", () => {
    expect(formatDateTime(new Date(2026, 9, 7, 14, 5))).toBe("07.10 14:05");
    expect(formatDateTime(new Date(2026, 0, 3, 0, 9))).toBe("03.01 00:09");
  });
});
