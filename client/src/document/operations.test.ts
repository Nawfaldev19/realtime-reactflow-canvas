import { describe, expect, it } from "vitest";
import { edge, node, sampleState, stateOf } from "../test/fixtures";
import {
  absolutePosition,
  applyAll,
  applyOperation,
  deleteNodes,
  descendantsOf,
  jsonEqual,
  type Operation,
} from "./operations";

describe("jsonEqual", () => {
  it("compares plain JSON structurally, ignoring key order", () => {
    expect(jsonEqual({ a: 1, b: [1, { c: 2 }] }, { b: [1, { c: 2 }], a: 1 })).toBe(true);
    expect(jsonEqual({ a: 1 }, { a: 2 })).toBe(false);
    expect(jsonEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    expect(jsonEqual({ a: 1, b: 2 }, { a: 1, c: 2 })).toBe(false);
    expect(jsonEqual([1, 2], { 0: 1, 1: 2 })).toBe(false);
    expect(jsonEqual(null, {})).toBe(false);
    expect(jsonEqual(1, "1")).toBe(false);
  });
});

describe("applyOperation: nodes", () => {
  it("adds a node and advances the number counter past it", () => {
    const { state, skipped } = applyOperation(sampleState(), { type: "node.add", node: node("d", { number: 9 }) });

    expect(skipped).toBe(0);
    expect(state.nodes.d?.number).toBe(9);
    expect(state.nextNumber).toBe(10);
  });

  it("keeps the counter when the added number is lower", () => {
    const { state } = applyOperation(stateOf([], [], 7), { type: "node.add", node: node("d", { number: 2 }) });

    expect(state.nextNumber).toBe(7);
  });

  it("skips adding a duplicate id or a child of something that is not a group", () => {
    const start = sampleState();
    const duplicate = applyOperation(start, { type: "node.add", node: node("a") });
    const badParent = applyOperation(start, { type: "node.add", node: node("x", { parentId: "c" }) });

    expect(duplicate).toEqual({ state: start, skipped: 1 });
    expect(badParent).toEqual({ state: start, skipped: 1 });
  });

  it("updates fields, merging data per top-level key and removing undefined keys", () => {
    const start = stateOf([node("a", { data: { text: "Cut", color: "red" } })]);
    const { state } = applyOperation(start, {
      type: "node.update",
      id: "a",
      fields: { position: { x: 5, y: 6 }, data: { text: "Cut boards", color: undefined, shape: "hexagon" } },
    });

    expect(state.nodes.a?.position).toEqual({ x: 5, y: 6 });
    expect(state.nodes.a?.data).toEqual({ text: "Cut boards", shape: "hexagon" });
  });

  it("replaces style as one field", () => {
    const start = stateOf([node("a", { style: { fill: "#fff", stroke: "#000" } })]);
    const { state } = applyOperation(start, { type: "node.update", id: "a", fields: { style: { fill: "#eee" } } });

    expect(state.nodes.a?.style).toEqual({ fill: "#eee" });
  });

  it("never changes a node's id through an update", () => {
    const start = stateOf([node("a")]);
    const fields = { id: "hijack", z: 4 } as unknown as Partial<Omit<ReturnType<typeof node>, "id">>;
    const { state } = applyOperation(start, { type: "node.update", id: "a", fields });

    expect(state.nodes.a?.id).toBe("a");
    expect(state.nodes.hijack).toBeUndefined();
  });

  it("returns the same state object for an update that changes nothing", () => {
    const start = sampleState();
    const result = applyOperation(start, {
      type: "node.update",
      id: "a",
      fields: { position: { x: 20, y: 40 }, data: { text: "a" } },
    });

    expect(result.state).toBe(start);
    expect(result.skipped).toBe(0);
  });

  it("skips updates to missing nodes and invalid or cyclic parents", () => {
    const start = stateOf([
      node("outer", { kind: "group" }),
      node("inner", { kind: "group", parentId: "outer", number: 2 }),
      node("leaf", { number: 3 }),
    ]);

    expect(applyOperation(start, { type: "node.update", id: "ghost", fields: { z: 3 } }).skipped).toBe(1);
    expect(applyOperation(start, { type: "node.update", id: "outer", fields: { parentId: "inner" } }).skipped).toBe(1);
    expect(applyOperation(start, { type: "node.update", id: "outer", fields: { parentId: "outer" } }).skipped).toBe(1);
    expect(applyOperation(start, { type: "node.update", id: "inner", fields: { parentId: "leaf" } }).skipped).toBe(1);
    expect(
      applyOperation(start, { type: "node.update", id: "leaf", fields: { parentId: "inner" } }).state.nodes.leaf
        ?.parentId,
    ).toBe("inner");
    expect(
      applyOperation(start, { type: "node.update", id: "inner", fields: { parentId: null } }).state.nodes.inner
        ?.parentId,
    ).toBeNull();
  });

  it("removing a node also removes its edges and, for a group, its descendants", () => {
    const { state } = applyOperation(sampleState(), { type: "node.remove", id: "g" });

    expect(Object.keys(state.nodes)).toEqual(["c"]);
    expect(state.edges).toEqual({});
  });

  it("removing a missing node changes nothing", () => {
    const start = sampleState();

    expect(applyOperation(start, { type: "node.remove", id: "ghost" })).toEqual({ state: start, skipped: 0 });
  });
});

describe("applyOperation: edges", () => {
  it("adds an edge only between existing nodes and only once", () => {
    const start = sampleState();

    expect(applyOperation(start, { type: "edge.add", edge: edge("ca", "c", "a") }).state.edges.ca).toBeDefined();
    expect(applyOperation(start, { type: "edge.add", edge: edge("cx", "c", "ghost") }).skipped).toBe(1);
    expect(applyOperation(start, { type: "edge.add", edge: edge("ab", "a", "c") }).skipped).toBe(1);
  });

  it("updates an edge, rejecting endpoints that do not exist", () => {
    const start = sampleState();
    const relabeled = applyOperation(start, {
      type: "edge.update",
      id: "ab",
      fields: { label: { text: "Yes", t: 0.5 } },
    });

    expect(relabeled.state.edges.ab?.label).toEqual({ text: "Yes", t: 0.5 });
    expect(applyOperation(start, { type: "edge.update", id: "ab", fields: { target: "ghost" } }).skipped).toBe(1);
    expect(applyOperation(start, { type: "edge.update", id: "ghost", fields: { label: null } }).skipped).toBe(1);
    expect(applyOperation(start, { type: "edge.update", id: "ab", fields: { label: null } }).state).toBe(start);
  });

  it("removes an edge, and removing a missing edge is a no-op", () => {
    const start = sampleState();

    expect(Object.keys(applyOperation(start, { type: "edge.remove", id: "ab" }).state.edges)).toEqual(["bc"]);
    expect(applyOperation(start, { type: "edge.remove", id: "ghost" }).state).toBe(start);
  });
});

describe("batches and replay", () => {
  it("applies a batch in order and counts skipped leaves, including nested batches", () => {
    const ops: Operation[] = [
      { type: "node.add", node: node("d", { number: 5 }) },
      {
        type: "batch",
        ops: [
          { type: "edge.add", edge: edge("cd", "c", "d") },
          { type: "node.update", id: "ghost", fields: { z: 1 } },
        ],
      },
      { type: "edge.add", edge: edge("dx", "d", "missing") },
    ];
    const { state, skipped } = applyAll(sampleState(), ops);

    expect(state.edges.cd).toBeDefined();
    expect(skipped).toBe(2);
  });

  it("an empty batch returns the same state", () => {
    const start = sampleState();

    expect(applyOperation(start, { type: "batch", ops: [] }).state).toBe(start);
  });

  it("replaying the same operations on the same state is deterministic", () => {
    const ops: Operation[] = [
      { type: "node.update", id: "c", fields: { position: { x: 1, y: 2 } } },
      { type: "edge.remove", id: "bc" },
    ];

    expect(applyAll(sampleState(), ops)).toEqual(applyAll(sampleState(), ops));
  });
});

describe("deleteNodes", () => {
  it("lists attached edges first, then descendants deepest first, then the nodes", () => {
    const start = stateOf(
      [
        node("outer", { kind: "group" }),
        node("inner", { kind: "group", parentId: "outer", number: 2 }),
        node("leaf", { parentId: "inner", number: 3 }),
        node("free", { number: 4 }),
      ],
      [edge("lf", "leaf", "free")],
    );
    const op = deleteNodes(start, ["outer", "ghost"]);

    expect(op.ops).toEqual([
      { type: "edge.remove", id: "lf" },
      { type: "node.remove", id: "leaf" },
      { type: "node.remove", id: "inner" },
      { type: "node.remove", id: "outer" },
    ]);
    expect(Object.keys(applyOperation(start, op).state.nodes)).toEqual(["free"]);
  });

  it("deleting nothing yields an empty batch", () => {
    expect(deleteNodes(sampleState(), [])).toEqual({ type: "batch", ops: [] });
  });
});

describe("tree helpers", () => {
  it("finds descendants at any depth", () => {
    expect(descendantsOf(sampleState(), "g").sort()).toEqual(["a", "b"]);
    expect(descendantsOf(sampleState(), "c")).toEqual([]);
  });

  it("adds parent offsets to compute absolute positions", () => {
    const state = sampleState();

    expect(absolutePosition(state, "a")).toEqual({ x: 120, y: 140 });
    expect(absolutePosition(state, "c")).toEqual({ x: 600, y: 100 });
    expect(absolutePosition(state, "ghost")).toEqual({ x: 0, y: 0 });
  });

  it("stops at a parent cycle instead of looping", () => {
    const cyclic = stateOf([
      node("a", { kind: "group", parentId: "b", position: { x: 1, y: 1 } }),
      node("b", { kind: "group", parentId: "a", position: { x: 2, y: 2 } }),
    ]);

    expect(absolutePosition(cyclic, "a")).toEqual({ x: 3, y: 3 });
  });
});

describe("layout.set", () => {
  it("switches the layout and is a no-op when nothing changes", () => {
    const state = sampleState();
    const layout = { engine: "dagre", direction: "TB", manual: { nodes: {}, edges: {} } } as const;
    const next = applyOperation(state, { type: "layout.set", layout }).state;
    expect(next.layout).toEqual(layout);
    expect(applyOperation(next, { type: "layout.set", layout: { ...layout } }).state).toBe(next);
    expect(applyOperation(state, { type: "layout.set", layout: null }).state).toBe(state);
    // Adding a node keeps the layout.
    expect(applyOperation(next, { type: "node.add", node: node("n", { number: 9 }) }).state.layout).toEqual(layout);
  });
});
