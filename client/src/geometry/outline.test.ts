import { describe, expect, it } from "vitest";
import { seededRandom } from "../test/random";
import {
  floatingAnchor,
  rayToDiamond,
  rayToEllipse,
  rayToOutline,
  rayToPolygon,
  rayToRect,
  rayToRoundedRect,
  sideOfPoint,
} from "./outline";
import { outlinePolygon } from "./shapes";
import type { Box } from "./vector";

/** A 200×100 box centred at the origin. */
const BOX: Box = { x: -100, y: -50, width: 200, height: 100 };

describe("rayToRect", () => {
  it("meets the bottom edge at (50, 50) for direction (1, 1) on a 200×100 box", () => {
    expect(rayToRect(BOX, { x: 1, y: 1 })).toEqual({ x: 50, y: 50 });
  });

  it("hits each side along the axes and uses the top centre for a zero direction", () => {
    expect(rayToRect(BOX, { x: 5, y: 0 })).toEqual({ x: 100, y: 0 });
    expect(rayToRect(BOX, { x: -5, y: 0 })).toEqual({ x: -100, y: 0 });
    expect(rayToRect(BOX, { x: 0, y: -3 })).toEqual({ x: 0, y: -50 });
    expect(rayToRect(BOX, { x: 0, y: 0 })).toEqual({ x: 0, y: -50 });
    expect(rayToRect(BOX, { x: 400, y: 100 })).toEqual({ x: 100, y: 25 });
  });

  it("treats a zero-size box as a point", () => {
    expect(rayToRect({ x: 5, y: 6, width: 0, height: 0 }, { x: 1, y: 2 })).toEqual({ x: 5, y: 6 });
  });

  it("matches the rotated-diagonal formulation from the floating-edges example", () => {
    const random = seededRandom(3);
    for (let trial = 0; trial < 50; trial += 1) {
      const d = { x: random.next() * 200 - 100, y: random.next() * 200 - 100 };
      const w = 100;
      const h = 50;
      const u = d.x / (2 * w) - d.y / (2 * h);
      const v = d.x / (2 * w) + d.y / (2 * h);
      const a = 1 / (Math.abs(u) + Math.abs(v));
      const expected = { x: w * (a * u + a * v), y: h * (-a * u + a * v) };
      const hit = rayToRect(BOX, d);
      expect(hit.x).toBeCloseTo(expected.x, 9);
      expect(hit.y).toBeCloseTo(expected.y, 9);
    }
  });
});

describe("other outlines", () => {
  it("hits an ellipse with radii (100, 50) at (100, 0) going right", () => {
    expect(rayToEllipse(BOX, { x: 1, y: 0 })).toEqual({ x: 100, y: 0 });
    const diagonal = rayToEllipse(BOX, { x: 1, y: 1 });
    expect((diagonal.x / 100) ** 2 + (diagonal.y / 50) ** 2).toBeCloseTo(1, 9);
    expect(rayToEllipse(BOX, { x: 0, y: 0 })).toEqual({ x: 0, y: -50 });
    expect(rayToEllipse({ x: 0, y: 0, width: 0, height: 10 }, { x: 0, y: 1 })).toEqual({ x: 0, y: 10 });
  });

  it("hits a diamond on its edge |x|/w + |y|/h = 1", () => {
    // Direction (1, 1): t/100 + t/50 = 1, t = 100/3.
    const hit = rayToDiamond(BOX, { x: 1, y: 1 });
    expect(hit.x).toBeCloseTo(100 / 3, 9);
    expect(hit.y).toBeCloseTo(100 / 3, 9);
    expect(rayToDiamond(BOX, { x: 0, y: 2 })).toEqual({ x: 0, y: 50 });
    expect(rayToDiamond(BOX, { x: 0, y: 0 })).toEqual({ x: 0, y: -50 });
    expect(rayToDiamond({ x: 0, y: 0, width: 10, height: 0 }, { x: 1, y: 0 })).toEqual({ x: 10, y: 0 });
  });

  it("pulls rounded-rectangle corner hits onto the arc and leaves side hits alone", () => {
    expect(rayToRoundedRect(BOX, 20, { x: 1, y: 0.1 })).toEqual(rayToRect(BOX, { x: 1, y: 0.1 }));
    const corner = rayToRoundedRect(BOX, 20, { x: 100, y: 50 });
    // On the circle of radius 20 around the corner centre (80, 30).
    expect(Math.hypot(corner.x - 80, corner.y - 30)).toBeCloseTo(20, 9);
    expect(corner.x).toBeLessThan(100);
    expect(rayToRoundedRect(BOX, 0, { x: 100, y: 50 })).toEqual({ x: 100, y: 50 });
  });

  it("hits convex polygons (a triangle and a hexagon)", () => {
    const box: Box = { x: 0, y: 0, width: 100, height: 100 };
    const triangle = outlinePolygon("triangle", 100, 100);
    // Straight down from the centre meets the base.
    expect(rayToPolygon(box, triangle, { x: 0, y: 1 })).toEqual({ x: 50, y: 100 });
    // Straight up meets the apex.
    const up = rayToPolygon(box, triangle, { x: 0, y: -1 });
    expect(up.x).toBeCloseTo(50, 9);
    expect(up.y).toBeCloseTo(0, 9);
    // Right: the slanted edge from (50, 0) to (100, 100) at y = 50 is x = 75.
    expect(rayToPolygon(box, triangle, { x: 1, y: 0 }).x).toBeCloseTo(75, 9);
    expect(rayToPolygon(box, triangle, { x: 0, y: 0 })).toEqual({ x: 50, y: 0 });
    expect(rayToPolygon(box, [], { x: 1, y: 0 })).toEqual({ x: 100, y: 50 });
  });

  it("dispatches on the outline kind", () => {
    expect(rayToOutline(BOX, { kind: "rect" }, { x: 1, y: 1 })).toEqual({ x: 50, y: 50 });
    expect(rayToOutline(BOX, { kind: "ellipse" }, { x: 1, y: 0 })).toEqual({ x: 100, y: 0 });
    expect(rayToOutline(BOX, { kind: "diamond" }, { x: 0, y: 1 })).toEqual({ x: 0, y: 50 });
    expect(rayToOutline(BOX, { kind: "rounded", radius: 0 }, { x: 1, y: 1 })).toEqual({ x: 50, y: 50 });
    expect(
      rayToOutline(
        { x: 0, y: 0, width: 100, height: 100 },
        { kind: "polygon", points: outlinePolygon("diamond", 100, 100) },
        { x: 1, y: 0 },
      ).x,
    ).toBeCloseTo(100, 9);
  });
});

describe("sideOfPoint and floatingAnchor", () => {
  it("classifies the touched side with a 1-unit tolerance", () => {
    expect(sideOfPoint(BOX, { x: -99.5, y: 10 })).toBe("left");
    expect(sideOfPoint(BOX, { x: 99.2, y: 10 })).toBe("right");
    expect(sideOfPoint(BOX, { x: 0, y: -49.5 })).toBe("top");
    expect(sideOfPoint(BOX, { x: 0, y: 50 })).toBe("bottom");
    // Off the box edges (an ellipse or a diamond): by the normalised offset from the centre.
    expect(sideOfPoint(BOX, { x: -80, y: 10 })).toBe("left");
    expect(sideOfPoint(BOX, { x: 80, y: -10 })).toBe("right");
    expect(sideOfPoint(BOX, { x: 10, y: -40 })).toBe("top");
    expect(sideOfPoint(BOX, { x: 10, y: 40 })).toBe("bottom");
  });

  it("aims at the other centre and keeps the previous anchor when centres coincide", () => {
    expect(floatingAnchor(BOX, { kind: "rect" }, { x: 500, y: 0 })).toEqual({ x: 100, y: 0 });
    expect(floatingAnchor(BOX, { kind: "rect" }, { x: 0, y: 0 }, { x: 7, y: 7 })).toEqual({ x: 7, y: 7 });
    expect(floatingAnchor(BOX, { kind: "rect" }, { x: 0, y: 0 })).toEqual({ x: 0, y: -50 });
  });
});
