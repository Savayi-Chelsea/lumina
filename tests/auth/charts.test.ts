import { describe, expect, it } from "vitest";
import { niceScale } from "@/components/charts";

describe("chart axis scale", () => {
  it.each([
    [0, { top: 4, step: 1 }], [1, { top: 1, step: 1 }], [3, { top: 3, step: 1 }], [7, { top: 8, step: 2 }], [9, { top: 10, step: 5 }],
    [53, { top: 60, step: 20 }], [112, { top: 150, step: 50 }], [2050, { top: 3000, step: 1000 }],
  ])("uses whole, clean steps close to the maximum for %i", (max, expected) => {
    expect(niceScale(max)).toEqual(expected);
  });
  it("always covers the maximum in at most four steps", () => {
    for (let max = 1; max <= 5000; max += 7) {
      const { top, step } = niceScale(max);
      expect(Number.isInteger(step)).toBe(true);
      expect(top).toBeGreaterThanOrEqual(max);
      expect(top / step).toBeLessThanOrEqual(4);
    }
  });
});
