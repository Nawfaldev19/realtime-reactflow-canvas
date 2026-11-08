import { describe, expect, it } from "vitest";
import { isOrthogonal } from "../routing/orthogonal";
import { edge, node, sequentialIds, stateOf } from "../test/fixtures";
import { connectorEnds, documentEnds, sketchPoints } from "./connectorGeometry";

const a = { node: node("a"), box: { x: 0, y: 0, width: 100, height: 60 } };
const b = { node: node("b"), box: { x: 300, y: 100, width: 100, height: 60 } };

describe("connectorEnds", () => {
  it("picks the closest sides when they are automatic and keeps explicit ones", () => {
    expect(connectorEnds(edge("e", "a", "b"), a, b)).toMatchObject({
      sides: { source: "right", target: "left" },
      source: { point: { x: 100, y: 30 }, side: "right", box: a.box },
      target: { point: { x: 300, y: 130 }, side: "left" },
    });
    expect(connectorEnds(edge("e", "a", "b", { sourceSide: "bottom", targetSide: "top" }), a, b).sides).toEqual({
      source: "bottom",
      target: "top",
    });
  });

  it("keeps the previous sides within the hysteresis margin", () => {
    const tie = { node: node("t"), box: { x: 200, y: 200, width: 100, height: 100 } };
    const square = { node: node("s"), box: { x: 0, y: 0, width: 100, height: 100 } };
    const previous = connectorEnds(edge("e", "s", "t", { sourceSide: "right", targetSide: "top" }), square, tie);
    expect(connectorEnds(edge("e", "s", "t"), square, tie, previous).sides).toEqual({ source: "right", target: "top" });
  });

  it("attaches to a shape's own ports", () => {
    const triangle = {
      node: node("t", { kind: "shape", data: { shape: "triangle" } }),
      box: { x: 300, y: 0, width: 100, height: 100 },
    };
    const ends = connectorEnds(edge("e", "a", "t", { targetSide: "left" }), a, triangle);
    expect(ends.target.point.x).toBeGreaterThan(300);
  });

  it("touches the true outlines for floating connectors", () => {
    const circle = {
      node: node("c", { kind: "shape", data: { shape: "circle" } }),
      box: { x: 300, y: -20, width: 100, height: 100 },
    };
    const ends = connectorEnds(edge("e", "a", "c", { kind: "floating" }), a, circle);
    expect(ends.source.point).toEqual({ x: 100, y: 30 });
    expect(ends.target.point).toEqual({ x: 300, y: 30 });
    expect(ends.sides).toEqual({ source: "right", target: "left" });
  });

  it("keeps a floating connector's last ends while the steps overlap", () => {
    const circle = {
      node: node("c", { kind: "shape", data: { shape: "circle" } }),
      box: { x: 300, y: -20, width: 100, height: 100 },
    };
    const previous = connectorEnds(edge("e", "a", "c", { kind: "floating" }), a, circle);
    const overlapping = { ...circle, box: { x: 10, y: 0, width: 100, height: 60 } };
    expect(connectorEnds(edge("e", "a", "c", { kind: "floating" }), a, overlapping, previous).source.point).toEqual(
      previous.source.point,
    );
  });
});

describe("documentEnds", () => {
  it("uses absolute boxes, also for steps inside groups", () => {
    const doc = stateOf([
      node("g", { kind: "group", position: { x: 1000, y: 0 }, size: { width: 400, height: 300 } }),
      node("a", { number: 2, size: { width: 100, height: 60 } }),
      node("c", { number: 3, parentId: "g", position: { x: 50, y: 50 }, size: { width: 100, height: 60 } }),
    ]);
    expect(documentEnds(doc, edge("e", "a", "c"))?.target.point).toEqual({ x: 1050, y: 80 });
    expect(documentEnds(doc, edge("e", "a", "missing"))).toBeNull();
  });
});

describe("sketchPoints", () => {
  const ends = connectorEnds(edge("e", "a", "b"), a, b);

  it("keeps a free sketch as user points with fresh ids", () => {
    expect(sketchPoints("polyline", ends, [{ x: 150, y: 30 }], sequentialIds("p"))).toEqual([
      { id: "p-1", x: 150, y: 30, userCreated: true },
    ]);
    expect(sketchPoints("spline", null, [], sequentialIds("p"))).toEqual([]);
  });

  it("turns a step sketch into an orthogonal route between the stubs", () => {
    const points = sketchPoints("step", ends, [
      { x: 200, y: 30 },
      { x: 200, y: 130 },
    ]);
    expect(isOrthogonal([ends.source.point, ...points, ends.target.point])).toBe(true);
    expect(points[0]).toMatchObject({ x: 120, y: 30 });
    expect(sketchPoints("step", null, [{ x: 1, y: 1 }])).toEqual([]);
  });

  it("caps the number of points", () => {
    const many = Array.from({ length: 300 }, (_, index) => ({ x: index, y: 0 }));
    expect(sketchPoints("polyline", ends, many)).toHaveLength(200);
  });
});
