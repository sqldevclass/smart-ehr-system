import { describe, expect, it } from "vitest";
import { painCharacterOptions, painColor } from "./painScale";

describe("painColor", () => {
  it("is green only for no pain, then yellow, orange and red as pain grows", () => {
    expect(painColor(0)).toBe("text-green-700");
    expect(painColor(1)).toBe("text-yellow-700");
    expect(painColor(3)).toBe("text-yellow-700");
    expect(painColor(4)).toBe("text-orange-700");
    expect(painColor(6)).toBe("text-orange-700");
    expect(painColor(7)).toBe("text-red-700");
    expect(painColor(10)).toBe("text-red-700");
  });
});

describe("painCharacterOptions", () => {
  it("has a unique code for every character tag", () => {
    const codes = painCharacterOptions.map((o) => o.code);
    expect(new Set(codes).size).toBe(codes.length);
  });
});
