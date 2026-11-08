import { describe, expect, it } from "vitest";
import { node, sequentialIds, stateOf } from "../test/fixtures";
import { createEdge, createNode, createSketchNode, DEFAULT_SIZES, randomId } from "./factory";

describe("createNode", () => {
  it("numbers from the counter, stacks on top and keys by its own id", () => {
    const state = stateOf([node("a", { z: 7 }), node("b", { z: 3 })], [], 12);
    const created = createNode(state, "decision", { x: 4, y: 5 }, { newId: sequentialIds("n") });

    expect(created).toEqual({
      id: "n-1",
      key: "n-1",
      kind: "decision",
      number: 12,
      position: { x: 4, y: 5 },
      size: DEFAULT_SIZES.decision,
      parentId: null,
      z: 8,
      style: {},
      data: { text: "Decide?" },
    });
  });

  it("can create a child of a group in an empty document", () => {
    const created = createNode(stateOf([]), "step", { x: 0, y: 0 }, { parentId: "g" });

    expect(created).toMatchObject({ parentId: "g", z: 1, number: 1 });
  });
});

describe("kind defaults", () => {
  it("creates a horizontal line whose box matches its stored length", () => {
    const line = createNode(stateOf([]), "line", { x: 0, y: 0 });
    expect(line.size).toEqual({ width: 160, height: 20 });
    expect(line.data).toEqual({ rotation: 90, length: 160, thickness: 4, lineStyle: "solid" });
  });

  it("creates shapes with the requested outline and empty text", () => {
    expect(createNode(stateOf([]), "shape", { x: 0, y: 0 }, { shape: "cylinder" }).data).toEqual({
      text: "",
      shape: "cylinder",
    });
    expect(createNode(stateOf([]), "shape", { x: 0, y: 0 }).data.shape).toBe("hexagon");
    expect(createNode(stateOf([]), "label", { x: 0, y: 0 }).data).toEqual({ text: "" });
    expect(createNode(stateOf([]), "sketch", { x: 0, y: 0 }).data).toMatchObject({ points: [], strokeSize: 7 });
  });

  it("creates a sketch from a committed stroke, remembering the box size it was drawn in", () => {
    const stroke = {
      box: { x: 4.75, y: 14.75, width: 110.5, height: 60.5 },
      points: [5.25, 5.25, 0.5, 105.25, 55.25, 0.5],
    };
    const sketch = createSketchNode(
      stateOf([node("a", { z: 3 })], [], 8),
      stroke,
      { color: "#112233", strokeSize: 9 },
      { newId: sequentialIds("s") },
    );
    expect(sketch).toMatchObject({
      id: "s-1",
      kind: "sketch",
      number: 8,
      z: 4,
      position: { x: 4.75, y: 14.75 },
      size: { width: 110.5, height: 60.5 },
      data: { points: stroke.points, initialSize: { width: 110.5, height: 60.5 }, strokeSize: 9, color: "#112233" },
    });
    expect(createSketchNode(stateOf([]), stroke, { color: null, strokeSize: 7 }).data).not.toHaveProperty("color");
  });
});

describe("createEdge", () => {
  it("creates an automatic step connector by default", () => {
    expect(createEdge("a", "b", { newId: sequentialIds("e") })).toMatchObject({
      id: "e-1",
      key: "e-1",
      source: "a",
      target: "b",
      route: { style: "step", points: [] },
    });
    expect(createEdge("a", "b", { style: "spline" }).route.style).toBe("spline");
    expect(createEdge("a", "b", { sourceSide: "right", targetSide: "left" })).toMatchObject({
      sourceSide: "right",
      targetSide: "left",
    });
  });
});

describe("randomId", () => {
  it("returns distinct UUIDs", () => {
    expect(randomId()).toMatch(/^[0-9a-f-]{36}$/);
    expect(randomId()).not.toBe(randomId());
  });
});
