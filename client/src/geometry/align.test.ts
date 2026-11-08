import { describe, expect, it } from "vitest";
import { distribute, lineUp, type PlacedBox } from "./align";

const item = (id: string, x: number, y: number, width: number, height: number): PlacedBox => ({
  id,
  box: { x, y, width, height },
});
const ITEMS = [item("a", 10, 0, 100, 40), item("b", 200, 50, 60, 20), item("c", 50, 120, 80, 80)];

describe("lineUp", () => {
  it("justifies left, centre and right against the selection bounds", () => {
    expect(lineUp(ITEMS, "left")).toEqual({ a: { x: 10, y: 0 }, b: { x: 10, y: 50 }, c: { x: 10, y: 120 } });
    // Bounds x 10..260, centre 135.
    expect(lineUp(ITEMS, "centre")).toEqual({ a: { x: 85, y: 0 }, b: { x: 105, y: 50 }, c: { x: 95, y: 120 } });
    expect(lineUp(ITEMS, "right")).toEqual({ a: { x: 160, y: 0 }, b: { x: 200, y: 50 }, c: { x: 180, y: 120 } });
  });

  it("aligns top, middle and bottom", () => {
    expect(lineUp(ITEMS, "top")).toEqual({ a: { x: 10, y: 0 }, b: { x: 200, y: 0 }, c: { x: 50, y: 0 } });
    // Bounds y 0..200, middle 100.
    expect(lineUp(ITEMS, "middle")).toEqual({ a: { x: 10, y: 80 }, b: { x: 200, y: 90 }, c: { x: 50, y: 60 } });
    expect(lineUp(ITEMS, "bottom")).toEqual({ a: { x: 10, y: 160 }, b: { x: 200, y: 180 }, c: { x: 50, y: 120 } });
  });

  it("does nothing without boxes", () => {
    expect(lineUp([], "left")).toEqual({});
  });
});

describe("distribute", () => {
  it("leaves equal horizontal gaps between neighbours", () => {
    const boxes = [
      item("a", 0, 0, 50, 10),
      item("d", 400, 0, 100, 10),
      item("b", 90, 30, 30, 10),
      item("c", 300, 0, 20, 10),
    ];
    const result = distribute(boxes, "horizontal");
    // Span 0..500, sizes 200, gap (500 − 200) / 3 = 100.
    expect(result).toEqual({ a: { x: 0, y: 0 }, b: { x: 150, y: 30 }, c: { x: 280, y: 0 }, d: { x: 400, y: 0 } });
    const placed = boxes.map((entry) => ({ ...entry.box, ...result[entry.id] })).sort((p, q) => p.x - q.x);
    const gaps = placed.slice(1).map((box, at) => box.x - ((placed[at]?.x ?? 0) + (placed[at]?.width ?? 0)));
    for (const gap of gaps) expect(gap).toBeCloseTo(100, 5);
  });

  it("distributes vertically, overlaps evenly when the boxes do not fit, and breaks ties by id", () => {
    const result = distribute([item("b", 0, 0, 10, 60), item("a", 0, 0, 10, 60), item("c", 0, 80, 10, 20)], "vertical");
    // Span 0..100, sizes 140, gap −20; equal starts keep id order.
    expect(result).toEqual({ a: { x: 0, y: 0 }, b: { x: 0, y: 40 }, c: { x: 0, y: 80 } });
  });

  it("needs three or more boxes", () => {
    expect(distribute(ITEMS.slice(0, 2), "horizontal")).toEqual({});
  });
});
