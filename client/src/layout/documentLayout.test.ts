import { describe, expect, it } from "vitest";
import { diffStates, revertOperation } from "../document/history";
import { absoluteBox } from "../document/groups";
import { applyOperation, type Operation } from "../document/operations";
import type { DocumentState } from "../document/types";
import { edge, node, sampleState, stateOf } from "../test/fixtures";
import { layoutCompound } from "./compound";
import { dagreLayout } from "./dagre";
import { layoutOperation, layoutTreeOf, restoreManualOperation, takeSnapshot } from "./documentLayout";
import { layeredLayout } from "./layered";
import type { FlatEngine } from "./types";

const apply = (state: DocumentState, op: Operation | null) => (op ? applyOperation(state, op).state : state);

function planWithPoints(): DocumentState {
  return stateOf(
    [
      node("start", { kind: "start-end", position: { x: 300, y: 40 } }),
      node("cut", { number: 2, position: { x: 20, y: 400 } }),
      node("sand", { number: 3, position: { x: 600, y: 90 } }),
      node("note", { kind: "note", number: 4, position: { x: 900, y: 900 } }),
    ],
    [
      edge("e1", "start", "cut", {
        route: { style: "polyline", points: [{ id: "p1", x: 10, y: 10, userCreated: true }] },
        sourceSide: "left",
      }),
      edge("e2", "cut", "sand"),
      edge("f", "start", "sand", { kind: "floating", route: { style: "polyline", points: [] } }),
    ],
  );
}

const run = (state: DocumentState, engine: FlatEngine, name: "dagre" | "layered", direction: "TB" | "LR") =>
  apply(
    state,
    layoutOperation(
      state,
      layoutCompound(layoutTreeOf(state), engine, { direction, nodeSep: 80, rankSep: 100 }),
      name,
      direction,
    ),
  );

describe("layoutTreeOf", () => {
  it("nests groups and orders siblings by number", () => {
    const tree = layoutTreeOf(sampleState());
    expect(tree.roots.map((entry) => entry.id)).toEqual(["g", "c"]);
    expect(tree.roots[0]?.children?.map((entry) => entry.id)).toEqual(["a", "b"]);
    expect(tree.roots[1]?.children).toBeNull();
    expect(tree.edges).toEqual([
      { source: "a", target: "b" },
      { source: "b", target: "c" },
    ]);
  });
});

describe("layoutOperation", () => {
  for (const [name, engine] of [
    ["dagre", dagreLayout],
    ["layered", layeredLayout],
  ] as const) {
    it(`puts every connector's target below its source with ${name}, top to bottom`, () => {
      const after = run(planWithPoints(), engine, name, "TB");
      for (const entry of Object.values(after.edges)) {
        const source = absoluteBox(after, entry.source);
        const target = absoluteBox(after, entry.target);
        expect((target?.y ?? 0) > (source?.y ?? 0)).toBe(true);
      }
      expect(after.edges.e1).toMatchObject({
        sourceSide: "bottom",
        targetSide: "top",
        route: { style: "polyline", points: [] },
      });
      expect(after.edges.f).toMatchObject({ sourceSide: null, targetSide: null });
      expect(after.layout).toMatchObject({ engine: name, direction: "TB" });
    });

    it(`runs left to right with ${name}, ports facing right → left`, () => {
      const after = run(planWithPoints(), engine, name, "LR");
      expect((absoluteBox(after, "cut")?.x ?? 0) > (absoluteBox(after, "start")?.x ?? 0)).toBe(true);
      expect(after.edges.e2).toMatchObject({ sourceSide: "right", targetSide: "left" });
    });
  }

  it("keeps the top-left corner of the arrangement and lays out groups as blocks", () => {
    const after = run(sampleState(), layeredLayout, "layered", "TB");
    const tops = Object.values(after.nodes).filter((entry) => entry.parentId === null);
    expect(Math.min(...tops.map((entry) => entry.position.x))).toBe(100);
    expect(Math.min(...tops.map((entry) => entry.position.y))).toBe(100);
    expect(after.nodes.a?.parentId).toBe("g");
    expect(after.nodes.a?.position).toEqual({ x: 25, y: 45 });
    expect(after.nodes.g?.size).toEqual({ width: 150, height: 270 });
  });

  it("takes the snapshot on the first layout only, and skips nodes removed since", () => {
    const start = planWithPoints();
    const once = run(start, layeredLayout, "layered", "TB");
    expect(once.layout?.manual).toEqual(takeSnapshot(start));
    const twice = run(once, dagreLayout, "dagre", "LR");
    expect(twice.layout?.manual).toEqual(takeSnapshot(start));
    const result = layoutCompound(layoutTreeOf(start), layeredLayout, { direction: "TB", nodeSep: 80, rankSep: 100 });
    const without = apply(start, { type: "node.remove", id: "note" });
    const op = layoutOperation(without, result, "layered", "TB");
    expect(op.type === "batch" && op.ops.some((inner) => inner.type === "node.update" && inner.id === "note")).toBe(
      false,
    );
    expect(layoutOperation(stateOf([]), { positions: {}, sizes: {} }, "dagre", "TB")).toMatchObject({ type: "batch" });
  });
});

describe("restoreManualOperation", () => {
  it("restores every position, size, side and control point exactly, and returns to manual", () => {
    const start = planWithPoints();
    const laidOut = run(run(start, layeredLayout, "layered", "TB"), dagreLayout, "dagre", "LR");
    const restored = apply(laidOut, restoreManualOperation(laidOut));
    expect(restored.nodes).toEqual(start.nodes);
    expect(restored.edges).toEqual(start.edges);
    expect(restored.layout).toBeNull();
    expect(restoreManualOperation(restored)).toBeNull();
  });

  it("leaves nodes added after the snapshot where they are", () => {
    const laidOut = run(planWithPoints(), layeredLayout, "layered", "TB");
    const added = apply(laidOut, { type: "node.add", node: node("late", { number: 9, position: { x: 5, y: 5 } }) });
    const restored = apply(added, restoreManualOperation(added));
    expect(restored.nodes.late?.position).toEqual({ x: 5, y: 5 });
    expect(restored.nodes.cut?.position).toEqual({ x: 20, y: 400 });
  });

  it("is undone in one step, like the layout itself", () => {
    const start = planWithPoints();
    const laidOut = run(start, dagreLayout, "dagre", "TB");
    const entry = diffStates(start, laidOut);
    if (!entry) throw new Error("expected a change");
    const undone = apply(laidOut, revertOperation(laidOut, entry, "undo"));
    expect(undone.nodes).toEqual(start.nodes);
    expect(undone.edges).toEqual(start.edges);
    expect(undone.layout).toBeNull();
  });
});
