import { describe, expect, it } from "vitest";
import { measurePath, pointAtLength } from "../geometry/path";
import { distance, type Vec } from "../geometry/vector";
import { isOrthogonal } from "./orthogonal";
import { recordSketchPoint, sketchSpacing, snapRightAngle } from "./sketch";
import { catmullRomPath } from "./spline";

/** Feeds pointer positions one unit apart along a polyline into the recorder. */
function sketch(path: readonly Vec[], spacing: number, orthogonal: boolean): readonly Vec[] {
  const origin = path[0] ?? { x: 0, y: 0 };
  let points: readonly Vec[] = [];
  for (let index = 1; index < path.length; index += 1) {
    const a = path[index - 1] ?? origin;
    const b = path[index] ?? origin;
    const steps = Math.ceil(distance(a, b));
    for (let step = 1; step <= steps; step += 1) {
      points = recordSketchPoint(
        points,
        origin,
        { x: a.x + ((b.x - a.x) * step) / steps, y: a.y + ((b.y - a.y) * step) / steps },
        { spacing, orthogonal },
      );
    }
  }
  return points;
}

describe("sketch recording", () => {
  it("spaces points 25 apart, or 50 for the splines", () => {
    expect(sketchSpacing("polyline")).toBe(25);
    expect(sketchSpacing("step")).toBe(25);
    expect(sketchSpacing("spline")).toBe(50);
    expect(sketchSpacing("bezier")).toBe(50);
  });

  it("records 5–6 points along a 300-unit sketch with the spline spacing, and the spline passes within 1 unit of each", () => {
    const stroke = [
      { x: 0, y: 0 },
      { x: 150, y: 80 },
      { x: 300, y: 0 },
    ];
    let length = 0;
    for (let index = 1; index < stroke.length; index += 1)
      length += distance(stroke[index - 1] ?? { x: 0, y: 0 }, stroke[index] ?? { x: 0, y: 0 });
    const scale = 300 / length;
    const scaled = stroke.map((point) => ({ x: point.x * scale, y: point.y * scale }));
    const points = sketch(scaled, 50, false);
    expect(points.length).toBeGreaterThanOrEqual(5);
    expect(points.length).toBeLessThanOrEqual(6);
    const through = [scaled[0] ?? { x: 0, y: 0 }, ...points, { x: 400, y: 0 }];
    const measure = measurePath(catmullRomPath(through));
    for (const point of points) {
      let best = Infinity;
      for (let index = 0; index <= 3000; index += 1)
        best = Math.min(best, distance(pointAtLength(measure, (measure.total * index) / 3000), point));
      expect(best).toBeLessThan(1);
    }
  });

  it("returns the same array when the pointer has not moved far enough", () => {
    const points = [{ x: 30, y: 0 }];
    expect(recordSketchPoint(points, { x: 0, y: 0 }, { x: 40, y: 0 }, { spacing: 25, orthogonal: false })).toBe(points);
  });

  it("snaps each new point to a right angle from the previous one for the step style", () => {
    expect(snapRightAngle({ x: 0, y: 0 }, { x: 30, y: 4 })).toEqual({ x: 30, y: 0 });
    expect(snapRightAngle({ x: 0, y: 0 }, { x: 3, y: -40 })).toEqual({ x: 0, y: -40 });
    const points = sketch(
      [
        { x: 0, y: 0 },
        { x: 120, y: 30 },
        { x: 160, y: 200 },
      ],
      25,
      true,
    );
    expect(isOrthogonal([{ x: 0, y: 0 }, ...points])).toBe(true);
  });
});
