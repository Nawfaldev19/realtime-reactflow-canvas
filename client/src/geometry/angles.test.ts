import { describe, expect, it } from "vitest";
import {
  circularDistance,
  nearestOf,
  normalizeAngle,
  pointerAngle,
  snapToCardinal,
  toDegrees,
  toRadians,
  unwrapDelta,
} from "./angles";

describe("normalizeAngle", () => {
  it.each([
    [0, 0],
    [360, 0],
    [-90, 270],
    [725, 5],
    [-360, 0],
    [359.5, 359.5],
  ])("%s° becomes %s°", (input, expected) => {
    expect(normalizeAngle(input)).toBe(expected);
  });

  it("never returns −0 or 360 for values just below a full turn", () => {
    expect(Object.is(normalizeAngle(-0), 0)).toBe(true);
    expect(normalizeAngle(-1e-14)).toBe(0);
  });
});

describe("unwrapDelta", () => {
  it.each([
    [190, -170],
    [-190, 170],
    [180, 180],
    [-180, 180],
    [359, -1],
    [0, 0],
    [540, 180],
  ])("a turn of %s° unwraps to %s°", (input, expected) => {
    expect(unwrapDelta(input)).toBe(expected);
  });
});

describe("circularDistance", () => {
  it.each([
    [350, 10, 20],
    [10, 350, 20],
    [0, 180, 180],
    [720, 0, 0],
    [-5, 5, 10],
    [86, 90, 4],
  ])("between %s° and %s° is %s°", (a, b, expected) => {
    expect(circularDistance(a, b)).toBe(expected);
  });
});

describe("pointerAngle", () => {
  const pivot = { x: 10, y: 10 };

  it.each([
    [{ x: 10, y: 0 }, 0],
    [{ x: 20, y: 10 }, 90],
    [{ x: 10, y: 20 }, 180],
    [{ x: 0, y: 10 }, 270],
    [{ x: 20, y: 0 }, 45],
  ])("measures %o from the pivot as %s° (0° up, clockwise)", (point, expected) => {
    expect(pointerAngle(pivot, point)).toBeCloseTo(expected, 10);
  });

  it("converts between degrees and radians", () => {
    expect(toRadians(180)).toBeCloseTo(Math.PI, 12);
    expect(toDegrees(Math.PI / 2)).toBeCloseTo(90, 12);
  });
});

describe("snapToCardinal", () => {
  it("releasing at 86° gives exactly 90°, and 82° stays 82°", () => {
    expect(snapToCardinal(86)).toEqual({ angle: 90, snapped: true });
    expect(snapToCardinal(82)).toEqual({ angle: 82, snapped: false });
  });

  it("includes the 7° boundary and wraps around 0°", () => {
    expect(snapToCardinal(83)).toEqual({ angle: 90, snapped: true });
    expect(snapToCardinal(353)).toEqual({ angle: 0, snapped: true });
    expect(snapToCardinal(352.9).snapped).toBe(false);
    expect(snapToCardinal(-3)).toEqual({ angle: 0, snapped: true });
    expect(snapToCardinal(364)).toEqual({ angle: 0, snapped: true });
    expect(snapToCardinal(187)).toEqual({ angle: 180, snapped: true });
    expect(snapToCardinal(264)).toEqual({ angle: 270, snapped: true });
  });

  it("normalizes an unsnapped angle", () => {
    expect(snapToCardinal(-50)).toEqual({ angle: 310, snapped: false });
  });

  it("accepts a custom threshold", () => {
    expect(snapToCardinal(80, 10).snapped).toBe(true);
    expect(snapToCardinal(86, 2).snapped).toBe(false);
  });
});

describe("nearestOf", () => {
  it("picks the nearest candidate around the circle; the first wins a tie", () => {
    expect(nearestOf(170, [0, 180])).toBe(180);
    expect(nearestOf(350, [0, 180])).toBe(0);
    expect(nearestOf(90, [0, 180])).toBe(0);
    expect(nearestOf(100, [90, 270])).toBe(90);
    expect(nearestOf(200, [90, 270])).toBe(270);
  });

  it("returns 0 with no candidates", () => {
    expect(nearestOf(45, [])).toBe(0);
  });
});
