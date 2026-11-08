import { describe, expect, it } from "vitest";
import {
  add,
  boundsOf,
  boxCentre,
  clamp,
  containsPoint,
  cyclic,
  distance,
  intersects,
  length,
  midpoint,
  normalize,
  perpendicular,
  round2,
  scale,
  sub,
} from "./vector";

describe("vector helpers", () => {
  it("adds, subtracts, scales and measures", () => {
    expect(add({ x: 1, y: 2 }, { x: 3, y: 4 })).toEqual({ x: 4, y: 6 });
    expect(sub({ x: 1, y: 2 }, { x: 3, y: 4 })).toEqual({ x: -2, y: -2 });
    expect(scale({ x: 1, y: -2 }, 3)).toEqual({ x: 3, y: -6 });
    expect(length({ x: 3, y: 4 })).toBe(5);
    expect(distance({ x: 1, y: 1 }, { x: 4, y: 5 })).toBe(5);
    expect(midpoint({ x: 0, y: 0 }, { x: 4, y: 2 })).toEqual({ x: 2, y: 1 });
  });

  it("normalizes, with the zero vector staying zero", () => {
    expect(normalize({ x: 0, y: 5 })).toEqual({ x: 0, y: 1 });
    expect(normalize({ x: 0, y: 0 })).toEqual({ x: 0, y: 0 });
  });

  it("turns a quarter turn: (−y, x)", () => {
    expect(perpendicular({ x: 1, y: 0 })).toEqual({ x: -0, y: 1 });
    expect(perpendicular({ x: 0, y: 1 })).toEqual({ x: -1, y: 0 });
  });

  it("indexes cyclically and refuses an empty list", () => {
    expect(cyclic([1, 2, 3], -1)).toBe(3);
    expect(cyclic([1, 2, 3], 4)).toBe(2);
    expect(() => cyclic([], 0)).toThrow(RangeError);
  });

  it("rounds to two decimals without −0, and clamps", () => {
    expect(round2(1.005)).toBe(1);
    expect(round2(2.346)).toBe(2.35);
    expect(Object.is(round2(-0.001), 0)).toBe(true);
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-1, 0, 3)).toBe(0);
  });
});

describe("boxes", () => {
  const box = { x: 10, y: 10, width: 100, height: 50 };

  it("finds the centre and tests points including the edges", () => {
    expect(boxCentre(box)).toEqual({ x: 60, y: 35 });
    expect(containsPoint(box, { x: 10, y: 60 })).toBe(true);
    expect(containsPoint(box, { x: 9, y: 30 })).toBe(false);
  });

  it("intersects only with a positive overlap area", () => {
    expect(intersects(box, { x: 100, y: 50, width: 20, height: 20 })).toBe(true);
    expect(intersects(box, { x: 110, y: 10, width: 20, height: 20 })).toBe(false);
  });

  it("bounds a list of boxes", () => {
    expect(boundsOf([box, { x: -5, y: 40, width: 10, height: 40 }])).toEqual({ x: -5, y: 10, width: 115, height: 70 });
    expect(boundsOf([])).toBeNull();
  });
});
