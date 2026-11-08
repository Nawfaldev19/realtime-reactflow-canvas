import { describe, expect, it } from "vitest";
import { seededRandom } from "../test/random";
import {
  measurePath,
  pathData,
  pointAtFraction,
  pointAtLength,
  polylineData,
  PROJECTION_TOLERANCE,
  projectOntoPath,
  samplePath,
  segmentPoint,
  type Path,
  type PathSegment,
} from "./path";
import { distance } from "./vector";

const line = (x1: number, y1: number, x2: number, y2: number): PathSegment => ({
  kind: "line",
  from: { x: x1, y: y1 },
  to: { x: x2, y: y2 },
});

/** A quarter circle of radius r around the origin from (r, 0) to (0, r) as a cubic (the standard 0.5523 approximation). */
function quarterCircle(r: number): PathSegment {
  const k = 0.5522847498 * r;
  return { kind: "cubic", from: { x: r, y: 0 }, c1: { x: r, y: k }, c2: { x: k, y: r }, to: { x: 0, y: r } };
}

describe("pathData", () => {
  it("emits one move-to and one command per segment, joining consecutive segments", () => {
    const path: Path = [
      line(0, 0, 10, 0),
      { kind: "quad", from: { x: 10, y: 0 }, control: { x: 15, y: 0 }, to: { x: 15, y: 5 } },
      { kind: "cubic", from: { x: 15, y: 5 }, c1: { x: 15, y: 10 }, c2: { x: 20, y: 10 }, to: { x: 20.123, y: 15 } },
    ];
    expect(pathData(path)).toBe("M 0 0 L 10 0 Q 15 0 15 5 C 15 10 20 10 20.12 15");
  });

  it("starts a new sub-path only where segments do not join, and is empty for no segments", () => {
    expect(pathData([line(0, 0, 1, 0), line(5, 5, 6, 5)])).toBe("M 0 0 L 1 0 M 5 5 L 6 5");
    expect(pathData([])).toBe("");
  });

  it("writes polylines", () => {
    expect(
      polylineData([
        { x: 0, y: 0 },
        { x: 1.006, y: 2 },
      ]),
    ).toBe("M 0 0 L 1.01 2");
  });
});

describe("segmentPoint", () => {
  it("evaluates lines, quadratics and cubics in Bernstein form", () => {
    expect(segmentPoint(line(0, 0, 10, 20), 0.25)).toEqual({ x: 2.5, y: 5 });
    // Quadratic (0,0) (10,0) (10,10) at ½: 0.25·P0 + 0.5·P1 + 0.25·P2.
    expect(
      segmentPoint({ kind: "quad", from: { x: 0, y: 0 }, control: { x: 10, y: 0 }, to: { x: 10, y: 10 } }, 0.5),
    ).toEqual({ x: 7.5, y: 2.5 });
    // Cubic at ½: (P0 + 3P1 + 3P2 + P3) / 8.
    const cubic: PathSegment = {
      kind: "cubic",
      from: { x: 0, y: 0 },
      c1: { x: 0, y: 8 },
      c2: { x: 8, y: 8 },
      to: { x: 8, y: 0 },
    };
    expect(segmentPoint(cubic, 0.5)).toEqual({ x: 4, y: 6 });
    expect(segmentPoint(cubic, 0)).toEqual({ x: 0, y: 0 });
    expect(segmentPoint(cubic, 1)).toEqual({ x: 8, y: 0 });
  });
});

describe("measurePath", () => {
  it("measures lines exactly and sums segments", () => {
    const measure = measurePath([line(0, 0, 3, 4), line(3, 4, 3, 14)]);
    expect(measure.total).toBe(15);
    expect(measure.tables.map((table) => table.start)).toEqual([0, 5]);
  });

  it("measures a quarter circle to within 0.05% of πr/2", () => {
    const measure = measurePath([quarterCircle(100)]);
    expect(measure.total).toBeGreaterThan(157.0);
    expect(Math.abs(measure.total - (Math.PI * 100) / 2)).toBeLessThan(0.1);
  });

  it("measures a straight quadratic as its chord", () => {
    const measure = measurePath([{ kind: "quad", from: { x: 0, y: 0 }, control: { x: 5, y: 0 }, to: { x: 10, y: 0 } }]);
    expect(measure.total).toBeCloseTo(10, 9);
  });
});

describe("pointAtLength", () => {
  const measure = measurePath([line(0, 0, 10, 0), line(10, 0, 10, 10)]);

  it("walks along the path and clamps outside it", () => {
    expect(pointAtLength(measure, 5)).toEqual({ x: 5, y: 0 });
    expect(pointAtLength(measure, 15)).toEqual({ x: 10, y: 5 });
    expect(pointAtLength(measure, -3)).toEqual({ x: 0, y: 0 });
    expect(pointAtLength(measure, 99)).toEqual({ x: 10, y: 10 });
    expect(pointAtFraction(measure, 0.75)).toEqual({ x: 10, y: 5 });
  });

  it("inverts the arc length of curves (midpoint of a quarter circle is at 45°)", () => {
    const circle = measurePath([quarterCircle(100)]);
    const middle = pointAtFraction(circle, 0.5);
    expect(Math.hypot(middle.x, middle.y)).toBeCloseTo(100, 0);
    expect(Math.abs(middle.x - middle.y)).toBeLessThan(0.2);
  });

  it("returns the origin for an empty path and handles zero-length segments", () => {
    expect(pointAtLength(measurePath([]), 3)).toEqual({ x: 0, y: 0 });
    expect(pointAtLength(measurePath([line(4, 4, 4, 4)]), 1)).toEqual({ x: 4, y: 4 });
    const degenerate = measurePath([
      { kind: "cubic", from: { x: 1, y: 1 }, c1: { x: 1, y: 1 }, c2: { x: 1, y: 1 }, to: { x: 1, y: 1 } },
    ]);
    expect(pointAtLength(degenerate, 0)).toEqual({ x: 1, y: 1 });
  });
});

describe("projectOntoPath", () => {
  it("projects onto the nearest straight segment", () => {
    const measure = measurePath([line(0, 0, 100, 0), line(100, 0, 100, 100)]);
    const projection = projectOntoPath(measure, { x: 40, y: 12 });
    expect(Math.abs(projection.length - 40)).toBeLessThanOrEqual(PROJECTION_TOLERANCE);
    expect(projection.distance).toBeCloseTo(12, 0);
    const corner = projectOntoPath(measure, { x: 130, y: 70 });
    expect(Math.abs(corner.length - 170)).toBeLessThanOrEqual(PROJECTION_TOLERANCE);
  });

  it("clamps to the ends and handles an empty path", () => {
    const measure = measurePath([line(0, 0, 100, 0)]);
    expect(projectOntoPath(measure, { x: -50, y: 0 }).length).toBeLessThanOrEqual(PROJECTION_TOLERANCE);
    expect(projectOntoPath(measure, { x: 150, y: 3 }).length).toBeGreaterThanOrEqual(100 - PROJECTION_TOLERANCE);
    const empty = projectOntoPath(measurePath([]), { x: 3, y: 4 });
    expect(empty).toEqual({ length: 0, point: { x: 0, y: 0 }, distance: 5 });
  });

  it("(property) finds a point on the path no farther than any of 2000 dense samples, within the tolerance", () => {
    const random = seededRandom(7);
    for (let trial = 0; trial < 40; trial += 1) {
      const p = () => ({ x: random.next() * 400, y: random.next() * 400 });
      const path: Path = [{ kind: "cubic", from: p(), c1: p(), c2: p(), to: p() }];
      const measure = measurePath(path);
      const query = p();
      const projection = projectOntoPath(measure, query);
      let dense = Infinity;
      for (let index = 0; index <= 2000; index += 1)
        dense = Math.min(dense, distance(pointAtLength(measure, (measure.total * index) / 2000), query));
      expect(projection.distance).toBeLessThanOrEqual(dense + PROJECTION_TOLERANCE);
    }
  });
});

describe("samplePath", () => {
  it("samples between two lengths, including corners", () => {
    const measure = measurePath([line(0, 0, 10, 0), line(10, 0, 10, 10)]);
    const points = samplePath(measure, 5, 15, 100);
    expect(points[0]).toEqual({ x: 5, y: 0 });
    expect(points).toContainEqual({ x: 10, y: 0 });
    expect(points.at(-1)).toEqual({ x: 10, y: 5 });
  });

  it("clamps the range and spaces samples", () => {
    const measure = measurePath([line(0, 0, 100, 0)]);
    const points = samplePath(measure, -10, 500, 25);
    expect(points).toHaveLength(5);
    expect(points.at(-1)).toEqual({ x: 100, y: 0 });
    expect(samplePath(measure, 60, 40)).toEqual([
      { x: 60, y: 0 },
      { x: 60, y: 0 },
    ]);
  });
});
