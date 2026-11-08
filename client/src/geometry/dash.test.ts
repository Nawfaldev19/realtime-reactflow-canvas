import { describe, expect, it } from "vitest";
import { antOffset, dashLength, dashStyle, marchingAnts } from "./dash";

describe("dash patterns", () => {
  it("gives a 3-wide dashed line dashes and gaps of 15", () => {
    expect(dashStyle("dashed", 3)).toEqual({ dashArray: "15 15", lineCap: "butt", period: 30 });
  });

  it("draws dotted lines as round dots one width apart", () => {
    expect(dashLength("dotted", 4)).toBe(4);
    expect(dashStyle("dotted", 4)).toEqual({ dashArray: "0 8", lineCap: "round", period: 8 });
  });

  it("has no pattern for solid or zero-width lines", () => {
    expect(dashStyle("solid", 2)).toEqual({ dashArray: null, lineCap: "butt", period: 0 });
    expect(dashStyle("dashed", 0).period).toBe(0);
    expect(dashStyle("dotted", 0).lineCap).toBe("round");
  });
});

describe("marching ants", () => {
  it("animates one period at 20 units per second", () => {
    expect(marchingAnts(30)).toEqual({ from: 30, to: 0, durationSeconds: 1.5 });
    expect(marchingAnts(0)).toBeNull();
    expect(marchingAnts(10, 0)).toBeNull();
  });

  it("has identical first and last frames at every width (the offsets differ by exactly one period)", () => {
    for (const width of [1, 2, 3, 7, 10]) {
      for (const pattern of ["dotted", "dashed"] as const) {
        const { period } = dashStyle(pattern, width);
        const ants = marchingAnts(period);
        if (!ants) throw new Error("expected an animation");
        const start = antOffset(ants, 0);
        const end = ants.to;
        expect((start - end) % period).toBeCloseTo(0, 9);
        expect(antOffset(ants, ants.durationSeconds * 2.5)).toBeCloseTo(antOffset(ants, ants.durationSeconds * 0.5), 9);
      }
    }
  });

  it("keeps the apparent speed independent of the width", () => {
    const speeds = [1, 4, 9].map((width) => {
      const ants = marchingAnts(dashStyle("dashed", width).period);
      return ants ? (ants.from - ants.to) / ants.durationSeconds : 0;
    });
    expect(speeds).toEqual([20, 20, 20]);
  });
});
