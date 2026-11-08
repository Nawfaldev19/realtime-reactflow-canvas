import { getBezierPath, Position } from "@xyflow/react";
import { describe, expect, it } from "vitest";
import { SIDES, type Side } from "../document/types";
import { measurePath, pointAtLength, segmentPoint } from "../geometry/path";
import { distance, type Vec } from "../geometry/vector";
import { seededRandom } from "../test/random";
import { catmullRomPath, controlOffset, handleAwareGhosts, splineMidpoints, standardControl } from "./spline";

const POSITIONS: Readonly<Record<Side, Position>> = {
  top: Position.Top,
  right: Position.Right,
  bottom: Position.Bottom,
  left: Position.Left,
};
const numbers = (d: string): number[] => (d.match(/-?\d+(?:\.\d+)?(?:e-?\d+)?/g) ?? []).map(Number);

/** Smallest distance from a point to a path, by dense sampling. */
function distanceToPath(points: readonly Vec[], query: Vec, ghosts = {}): number {
  const measure = measurePath(catmullRomPath(points, ghosts));
  let best = Infinity;
  for (let index = 0; index <= 4000; index += 1)
    best = Math.min(best, distance(pointAtLength(measure, (measure.total * index) / 4000), query));
  return best;
}

describe("Catmull-Rom to Bézier", () => {
  it("uses the divide-by-six rule with the end points as missing neighbours (plain flavour)", () => {
    const [first, second] = catmullRomPath([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 20, y: 10 },
    ]);
    expect(first).toEqual({
      kind: "cubic",
      from: { x: 0, y: 0 },
      c1: { x: 10 / 6, y: 0 },
      c2: { x: 10 - 20 / 6, y: -10 / 6 },
      to: { x: 10, y: 0 },
    });
    // Second piece: Z = (0, 0), Y = B = (20, 10).
    expect(second).toEqual({
      kind: "cubic",
      from: { x: 10, y: 0 },
      c1: { x: 10 + 20 / 6, y: 10 / 6 },
      c2: { x: 20 - 10 / 6, y: 10 - 10 / 6 },
      to: { x: 20, y: 10 },
    });
  });

  it("matches the Catmull-Rom tangents (B − Z) / 2 at every interior point, so the curve is C1-continuous", () => {
    const points = [
      { x: 0, y: 0 },
      { x: 50, y: 80 },
      { x: 120, y: 30 },
      { x: 200, y: 90 },
    ];
    const path = catmullRomPath(points);
    for (let index = 0; index < path.length - 1; index += 1) {
      const incoming = path[index];
      const outgoing = path[index + 1];
      if (incoming?.kind !== "cubic" || outgoing?.kind !== "cubic") throw new Error("expected cubic pieces");
      const into = { x: 3 * (incoming.to.x - incoming.c2.x), y: 3 * (incoming.to.y - incoming.c2.y) };
      const out = { x: 3 * (outgoing.c1.x - outgoing.from.x), y: 3 * (outgoing.c1.y - outgoing.from.y) };
      const before = points[index] ?? { x: 0, y: 0 };
      const after = points[index + 2] ?? { x: 0, y: 0 };
      expect(into.x).toBeCloseTo(out.x, 9);
      expect(into.y).toBeCloseTo(out.y, 9);
      expect(out.x).toBeCloseTo((after.x - before.x) / 2, 9);
      expect(out.y).toBeCloseTo((after.y - before.y) / 2, 9);
    }
  });

  it("passes through every point (interpolation)", () => {
    const points = [
      { x: 0, y: 0 },
      { x: 40, y: 90 },
      { x: 140, y: 10 },
      { x: 220, y: 60 },
    ];
    const path = catmullRomPath(points);
    path.forEach((segment, index) => {
      expect(segmentPoint(segment, 0)).toEqual(points[index]);
      expect(segmentPoint(segment, 1)).toEqual(points[index + 1]);
    });
  });

  it("skips coincident points when emitting but keeps their influence", () => {
    const path = catmullRomPath([
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 50, y: 0 },
      { x: 100, y: 50 },
    ]);
    expect(path).toHaveLength(2);
    expect(catmullRomPath([{ x: 1, y: 1 }])).toEqual([]);
  });
});

describe("the standard curve's control points", () => {
  it("offsets by half the distance in front of the port and by 6.25·√(−δ) behind it", () => {
    expect(controlOffset(100)).toBe(50);
    expect(controlOffset(-100)).toBe(62.5);
    expect(controlOffset(0)).toBe(0);
    expect(standardControl({ x: 0, y: 0 }, "right", { x: 100, y: 40 })).toEqual({ x: 50, y: 0 });
    expect(standardControl({ x: 0, y: 0 }, "right", { x: -100, y: 40 })).toEqual({ x: 62.5, y: 0 });
    expect(standardControl({ x: 10, y: 10 }, "top", { x: 0, y: -90 })).toEqual({ x: 10, y: -40 });
  });

  it("with no points, the handle-aware path has the library curve's control points (within 0.01) for every side pair", () => {
    const random = seededRandom(9);
    for (let trial = 0; trial < 64; trial += 1) {
      const sourceSide = SIDES[trial % 4] ?? "right";
      const targetSide = SIDES[Math.floor(trial / 4) % 4] ?? "left";
      const source = { x: random.next() * 400 - 200, y: random.next() * 400 - 200 };
      const target = { x: random.next() * 400 - 200, y: random.next() * 400 - 200 };
      const [library] = getBezierPath({
        sourceX: source.x,
        sourceY: source.y,
        targetX: target.x,
        targetY: target.y,
        sourcePosition: POSITIONS[sourceSide],
        targetPosition: POSITIONS[targetSide],
      });
      const [, , c1x, c1y, c2x, c2y] = numbers(library);
      const points = [source, target];
      const [segment] = catmullRomPath(points, handleAwareGhosts(points, sourceSide, targetSide));
      if (segment?.kind !== "cubic") throw new Error("expected a cubic");
      expect(Math.abs(segment.c1.x - (c1x ?? 0))).toBeLessThan(0.01);
      expect(Math.abs(segment.c1.y - (c1y ?? 0))).toBeLessThan(0.01);
      expect(Math.abs(segment.c2.x - (c2x ?? 0))).toBeLessThan(0.01);
      expect(Math.abs(segment.c2.y - (c2y ?? 0))).toBeLessThan(0.01);
    }
  });

  it("leaves and enters perpendicular to the port sides when there are points", () => {
    const points = [
      { x: 0, y: 0 },
      { x: 150, y: -80 },
      { x: 300, y: 0 },
    ];
    const path = catmullRomPath(points, handleAwareGhosts(points, "bottom", "top"));
    const first = path[0];
    const last = path.at(-1);
    if (first?.kind !== "cubic" || last?.kind !== "cubic") throw new Error("expected cubic pieces");
    expect(first.c1.x).toBeCloseTo(0, 9);
    expect(first.c1.y).toBeGreaterThan(0);
    expect(last.c2.x).toBeCloseTo(300, 9);
    expect(last.c2.y).toBeLessThan(0);
  });

  it("returns no ghosts for fewer than two points", () => {
    expect(handleAwareGhosts([{ x: 0, y: 0 }], "left", "right")).toEqual({});
  });
});

describe("add handles", () => {
  it("sit at (−Z + 9A + 9B − Y) / 16", () => {
    const [handle] = splineMidpoints([
      { x: 0, y: 0 },
      { x: 16, y: 0 },
      { x: 32, y: 16 },
    ]);
    // Z = A = (0, 0), Y = (32, 16): (9·16 − 32) / 16 = 7, −16 / 16 = −1.
    expect(handle).toEqual({ x: 7, y: -1 });
  });

  it("(property) lie within 0.5 units of the rendered curve for both flavours", () => {
    const random = seededRandom(13);
    for (let trial = 0; trial < 30; trial += 1) {
      const points = Array.from({ length: 2 + random.int(4) }, () => ({
        x: random.next() * 500,
        y: random.next() * 500,
      }));
      const ghosts = trial % 2 === 0 ? {} : handleAwareGhosts(points, random.pick(SIDES), random.pick(SIDES));
      for (const handle of splineMidpoints(points, ghosts))
        expect(distanceToPath(points, handle, ghosts)).toBeLessThan(0.5);
    }
  });
});
