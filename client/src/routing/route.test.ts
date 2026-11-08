import { getBezierPath, getStraightPath, Position } from "@xyflow/react";
import { describe, expect, it } from "vitest";
import type { RoutePoint } from "../document/types";
import { pathData, segmentPoint } from "../geometry/path";
import type { Box } from "../geometry/vector";
import { portPoint } from "./anchors";
import { autoRoute, isOrthogonal, roundedPath } from "./orthogonal";
import { computeRoute, floatingEnds, type RouteEnd } from "./route";

const numbers = (d: string): number[] =>
  (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map((value) => Math.round(Number(value) * 100) / 100);

const A: Box = { x: 0, y: 0, width: 100, height: 50 };
const B: Box = { x: 300, y: 200, width: 100, height: 50 };
const source: RouteEnd = { point: portPoint(A, "right"), side: "right", box: A };
const target: RouteEnd = { point: portPoint(B, "left"), side: "left", box: B };
const POINTS: RoutePoint[] = [{ id: "p1", x: 150, y: 150, userCreated: true }];

describe("computeRoute", () => {
  it("draws a polyline through the points with an add handle at each segment midpoint", () => {
    const route = computeRoute({ style: "polyline", source, target, points: POINTS });
    expect(pathData(route.path)).toBe("M 100 25 L 150 150 L 300 225");
    expect(route.addHandles).toEqual([
      { x: 125, y: 87.5 },
      { x: 225, y: 187.5 },
    ]);
    expect(route.vertices).toBeNull();
    expect(route.labelAnchor).toBeNull();
  });

  it("has exactly three straight segments and three add handles with two points", () => {
    const route = computeRoute({ style: "polyline", source, target, points: [...POINTS, { id: "p2", x: 250, y: 60 }] });
    expect(route.path).toHaveLength(3);
    expect(route.addHandles).toHaveLength(3);
  });

  it("renders zero-point routes like the plain renderers", () => {
    const straight = computeRoute({ style: "polyline", source, target, points: [] });
    const [line] = getStraightPath({ sourceX: 100, sourceY: 25, targetX: 300, targetY: 225 });
    expect(numbers(pathData(straight.path))).toEqual(numbers(line));
    const curve = computeRoute({ style: "bezier", source, target, points: [] });
    const [bezier] = getBezierPath({
      sourceX: 100,
      sourceY: 25,
      targetX: 300,
      targetY: 225,
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
    });
    expect(numbers(pathData(curve.path))).toEqual(numbers(bezier));
    const step = computeRoute({ style: "step", source, target, points: [] });
    expect(pathData(step.path)).toBe(pathData(roundedPath(autoRoute(source, target))));
  });

  it("passes splines through their points and puts add handles on the curve", () => {
    for (const style of ["spline", "bezier"] as const) {
      const route = computeRoute({ style, source, target, points: POINTS });
      expect(route.path).toHaveLength(2);
      expect(route.path[0] && segmentPoint(route.path[0], 1)).toEqual({ x: 150, y: 150 });
      expect(route.addHandles).toHaveLength(2);
    }
  });

  it("gives step routes their vertices and a label anchor on the longest middle segment", () => {
    const route = computeRoute({ style: "step", source, target, points: [] });
    expect(route.vertices && isOrthogonal(route.vertices)).toBe(true);
    expect(route.labelAnchor).toEqual({ x: 200, y: 125 });
    expect(route.addHandles).toEqual([]);
  });
});

describe("floatingEnds", () => {
  it("touches each outline on the line between the centres", () => {
    const ends = floatingEnds(
      { x: -100, y: -50, width: 200, height: 100 },
      { kind: "rect" },
      { x: 400, y: 450, width: 200, height: 100 },
      { kind: "ellipse" },
    );
    expect(ends.source).toEqual({ x: 50, y: 50 });
    expect(ends.sourceSide).toBe("bottom");
    expect(ends.targetSide).toBe("top");
  });

  it("keeps the previous ends while the steps overlap", () => {
    const box = { x: 0, y: 0, width: 100, height: 100 };
    const previous = {
      source: { x: 1, y: 1 },
      target: { x: 2, y: 2 },
      sourceSide: "left" as const,
      targetSide: "right" as const,
    };
    expect(floatingEnds(box, { kind: "rect" }, { ...box, x: 10 }, { kind: "rect" }, previous)).toBe(previous);
    expect(floatingEnds(box, { kind: "rect" }, { ...box, x: 10 }, { kind: "rect" }).source).toEqual({ x: 100, y: 50 });
  });
});
