import { describe, expect, it } from "vitest";
import {
  clampSize,
  fitHeight,
  grownHeight,
  isOverflowing,
  MAX_NODE_SIZE,
  MIN_NODE_SIZE,
  scaleSelection,
} from "./sizing";

describe("clampSize", () => {
  it("keeps sizes between the minimum and 2500", () => {
    expect(clampSize(10, 3000)).toEqual({ width: MIN_NODE_SIZE, height: MAX_NODE_SIZE });
    expect(clampSize(100, 50, { minWidth: 350, minHeight: 25 })).toEqual({ width: 350, height: 50 });
  });
});

describe("scaleSelection", () => {
  const start = {
    a: { x: 0, y: 0, width: 100, height: 50 },
    b: { x: 200, y: 0, width: 40, height: 40 },
    c: { x: 0, y: 100, width: 20, height: 20 },
  };

  it("resizing one of three nodes by 1.5× makes all three 1.5× their size about their own top-left", () => {
    const result = scaleSelection(start, "a", { x: 0, y: 0, width: 150, height: 75 }, () => ({
      minWidth: 1,
      minHeight: 1,
    }));
    expect(result).toEqual({
      a: { x: 0, y: 0, width: 150, height: 75 },
      b: { x: 200, y: 0, width: 60, height: 60 },
      c: { x: 0, y: 100, width: 30, height: 30 },
    });
  });

  it("shifts the others by the dragged node's top-left offset and clamps them to their limits", () => {
    const result = scaleSelection(start, "a", { x: -10, y: -5, width: 50, height: 25 });
    expect(result.b).toEqual({ x: 190, y: -5, width: 25, height: 25 });
    expect(result.c).toEqual({ x: -10, y: 95, width: 25, height: 25 });
  });

  it("returns nothing when the dragged node has no start box, and keeps factors at 1 for an empty box", () => {
    expect(scaleSelection(start, "missing", { x: 0, y: 0, width: 1, height: 1 })).toEqual({});
    const flat = scaleSelection(
      { a: { x: 0, y: 0, width: 0, height: 0 }, b: { x: 0, y: 0, width: 30, height: 30 } },
      "a",
      { x: 0, y: 0, width: 10, height: 10 },
    );
    expect(flat.b).toEqual({ x: 0, y: 0, width: 30, height: 30 });
  });
});

describe("auto height", () => {
  it("overflows only when content needs more than 1px beyond the node", () => {
    expect(isOverflowing(50, 16, 66)).toBe(false);
    expect(isOverflowing(51, 16, 66)).toBe(false);
    expect(isOverflowing(51.5, 16, 66)).toBe(true);
  });

  it("grows to content + chrome + 17 while editing, and never shrinks", () => {
    expect(grownHeight(52, 16, 66)).toBe(85);
    expect(grownHeight(20, 16, 66)).toBeNull();
    expect(grownHeight(5000, 16, 66)).toBe(MAX_NODE_SIZE);
  });

  it("fits exactly, growing or shrinking, within the limits", () => {
    expect(fitHeight(40.2, 16)).toBe(57);
    expect(fitHeight(2, 2)).toBe(MIN_NODE_SIZE);
    expect(fitHeight(9000, 0)).toBe(MAX_NODE_SIZE);
    expect(fitHeight(2, 2, 10)).toBe(10);
  });
});
