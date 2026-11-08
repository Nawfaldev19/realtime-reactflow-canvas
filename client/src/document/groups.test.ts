import { describe, expect, it } from "vitest";
import { edge, node, sampleState, sequentialIds, stateOf } from "../test/fixtures";
import { canConnect, connectRefusal } from "./connections";
import {
  absoluteBox,
  canGroup,
  depthOf,
  dropReparent,
  dropTarget,
  GROUP_PADDING,
  groupNodes,
  isAncestor,
  reparentFields,
  ungroupNodes,
} from "./groups";
import { absolutePosition, applyOperation, type Operation } from "./operations";
import { orderedNodes, parseDocument, serializeDocument } from "./serialize";
import type { DocumentState } from "./types";

const apply = (state: DocumentState, op: Operation | null) => {
  if (!op) throw new Error("expected an operation");
  const result = applyOperation(state, op);
  expect(result.skipped).toBe(0);
  return result.state;
};

/** sampleState plus a free node "d" and a group "inner" nested in "g". */
function nestedState(): DocumentState {
  const base = sampleState();
  return stateOf(
    [
      ...Object.values(base.nodes),
      node("d", { number: 5, position: { x: 800, y: 300 }, z: 5 }),
      node("inner", {
        kind: "group",
        number: 6,
        parentId: "g",
        position: { x: 150, y: 20 },
        size: { width: 140, height: 160 },
        z: 6,
      }),
    ],
    Object.values(base.edges),
  );
}

describe("coordinates and ancestry", () => {
  it("absolute boxes add the parent offsets", () => {
    expect(absoluteBox(sampleState(), "a")).toEqual({ x: 120, y: 140, width: 100, height: 50 });
    expect(absoluteBox(sampleState(), "missing")).toBeNull();
  });

  it("knows ancestors and depth", () => {
    const state = nestedState();
    expect(isAncestor(state, "g", "a")).toBe(true);
    expect(isAncestor(state, "a", "g")).toBe(false);
    expect(isAncestor(state, "g", "g")).toBe(false);
    expect(depthOf(state, "inner")).toBe(1);
    expect(depthOf(state, "c")).toBe(0);
  });

  it("re-parenting keeps the on-screen position", () => {
    expect(reparentFields(sampleState(), "c", "g")).toEqual({ parentId: "g", position: { x: 500, y: 0 } });
    expect(reparentFields(sampleState(), "a", null)).toEqual({ parentId: null, position: { x: 120, y: 140 } });
  });
});

describe("grouping", () => {
  it("needs two or more nodes that share a parent", () => {
    const state = nestedState();
    expect(canGroup(state, ["a"])).toMatchObject({
      ok: false,
      reason: expect.stringContaining("two or more") as string,
    });
    expect(canGroup(state, ["a", "c"])).toMatchObject({
      ok: false,
      reason: expect.stringContaining("different groups") as string,
    });
    expect(canGroup(state, ["g", "a"]).ok).toBe(false);
    expect(canGroup(state, ["a", "b"])).toEqual({ ok: true, parentId: "g" });
    expect(canGroup(state, ["c", "d", "ghost"])).toEqual({ ok: true, parentId: null });
    expect(groupNodes(state, ["a", "c"])).toBeNull();
  });

  it("frames the nodes with 25px padding and makes child position = absolute − group position", () => {
    const state = nestedState();
    const result = groupNodes(state, ["c", "d"], { newId: sequentialIds("grp") });
    expect(result?.groupId).toBe("grp-1");
    const next = apply(state, result?.op ?? null);
    expect(next.nodes["grp-1"]).toMatchObject({
      kind: "group",
      parentId: null,
      number: 7,
      position: { x: 575, y: 75 },
      size: { width: 350, height: 300 },
    });
    expect(next.nodes.c).toMatchObject({ parentId: "grp-1", position: { x: 25, y: 25 } });
    expect(next.nodes.d).toMatchObject({ parentId: "grp-1", position: { x: 225, y: 225 } });
    expect(GROUP_PADDING).toBe(25);
  });

  it("nests a new group inside the shared parent without moving anything on screen", () => {
    const state = nestedState();
    const result = groupNodes(state, ["a", "b"], { newId: sequentialIds("grp") });
    const next = apply(state, result?.op ?? null);
    expect(next.nodes["grp-1"]).toMatchObject({ parentId: "g", position: { x: -5, y: 15 } });
    expect(next.nodes.a?.position).toEqual({ x: 25, y: 25 });
    expect(absolutePosition(next, "a")).toEqual({ x: 120, y: 140 });
    expect(absolutePosition(next, "b")).toEqual({ x: 120, y: 220 });
    expect(
      orderedNodes(next)
        .map((entry) => entry.id)
        .indexOf("grp-1"),
    ).toBeLessThan(
      orderedNodes(next)
        .map((entry) => entry.id)
        .indexOf("a"),
    );
  });

  it("grouping, moving the group 100px right, then ungrouping leaves every child 100px right, to the pixel", () => {
    const state = nestedState();
    const result = groupNodes(state, ["c", "d"], { newId: sequentialIds("grp") });
    let next = apply(state, result?.op ?? null);
    const group = next.nodes["grp-1"];
    next = apply(next, {
      type: "node.update",
      id: "grp-1",
      fields: { position: { x: (group?.position.x ?? 0) + 100, y: group?.position.y ?? 0 } },
    });
    next = apply(next, ungroupNodes(next, "grp-1"));
    expect(next.nodes["grp-1"]).toBeUndefined();
    expect(next.nodes.c).toMatchObject({ parentId: null, position: { x: 700, y: 100 } });
    expect(next.nodes.d).toMatchObject({ parentId: null, position: { x: 900, y: 300 } });
  });
});

describe("saving groups", () => {
  it("a group nested in a group, its children and its edges survive a save and reload unchanged", () => {
    const state = nestedState();
    const result = groupNodes(state, ["a", "b"], { newId: sequentialIds("grp") });
    const grouped = apply(state, result?.op ?? null);
    const withEdge = apply(grouped, { type: "edge.add", edge: edge("in", "c", "grp-1") });
    const stored = serializeDocument(withEdge);
    const ids = stored.nodes.map((entry) => entry.id);
    expect(ids.indexOf("g")).toBeLessThan(ids.indexOf("grp-1"));
    expect(ids.indexOf("grp-1")).toBeLessThan(ids.indexOf("a"));

    const { state: reloaded, report } = parseDocument(JSON.parse(JSON.stringify(stored)));
    expect(report).toEqual({ droppedNodes: 0, droppedEdges: 0, reparented: [], detached: [] });
    expect(reloaded).toEqual(withEdge);
  });
});

describe("ungrouping", () => {
  it("releases children into the group's parent and removes the group and its own edges", () => {
    const base = nestedState();
    const state = { ...base, edges: { ...base.edges, cg: edge("cg", "c", "g") } };
    const next = apply(state, ungroupNodes(state, "g"));
    expect(next.nodes.g).toBeUndefined();
    expect(next.nodes.a).toMatchObject({ parentId: null, position: { x: 120, y: 140 } });
    expect(next.nodes.inner).toMatchObject({ parentId: null, position: { x: 250, y: 120 } });
    expect(Object.keys(next.edges).sort()).toEqual(["ab", "bc"]);
  });

  it("releases nested children into the outer group", () => {
    const base = nestedState();
    const state = apply(base, {
      type: "node.update",
      id: "b",
      fields: { parentId: "inner", position: { x: 10, y: 10 } },
    });
    const next = apply(state, ungroupNodes(state, "inner"));
    expect(next.nodes.b).toMatchObject({ parentId: "g", position: { x: 160, y: 30 } });
  });

  it("refuses anything that is not a group", () => {
    expect(ungroupNodes(sampleState(), "a")).toBeNull();
    expect(ungroupNodes(sampleState(), "missing")).toBeNull();
  });
});

describe("dropping into groups", () => {
  it("finds the deepest group under the point, never the node itself or its descendants", () => {
    const state = nestedState();
    expect(dropTarget(state, "c", { x: 150, y: 150 })).toBe("g");
    expect(dropTarget(state, "c", { x: 260, y: 140 })).toBe("inner");
    expect(dropTarget(state, "g", { x: 260, y: 140 })).toBeNull();
    expect(dropTarget(state, "c", { x: 5000, y: 5000 })).toBeNull();
  });

  it("prefers the top-most of two overlapping groups at the same depth", () => {
    const state = stateOf([
      node("low", { kind: "group", position: { x: 0, y: 0 }, size: { width: 200, height: 200 }, z: 1 }),
      node("high", { kind: "group", number: 2, position: { x: 50, y: 50 }, size: { width: 200, height: 200 }, z: 2 }),
      node("n", { number: 3 }),
    ]);
    expect(dropTarget(state, "n", { x: 100, y: 100 })).toBe("high");
  });

  it("a node released with its centre inside a group joins it", () => {
    const state = apply(nestedState(), { type: "node.update", id: "c", fields: { position: { x: 150, y: 150 } } });
    expect(dropReparent(state, ["c"], { allowLeave: false })).toEqual([
      { type: "node.update", id: "c", fields: { parentId: "g", position: { x: 50, y: 50 } } },
    ]);
  });

  it("a child moves into a nested group without Alt, but leaves its group only with Alt", () => {
    const state = nestedState();
    const intoInner = apply(state, { type: "node.update", id: "a", fields: { position: { x: 160, y: 40 } } });
    expect(dropReparent(intoInner, ["a"], { allowLeave: false })).toEqual([
      { type: "node.update", id: "a", fields: { parentId: "inner", position: { x: 10, y: 20 } } },
    ]);

    const outside = apply(state, { type: "node.update", id: "a", fields: { position: { x: 400, y: 0 } } });
    expect(dropReparent(outside, ["a"], { allowLeave: false })).toEqual([]);
    expect(dropReparent(outside, ["a"], { allowLeave: true })).toEqual([
      { type: "node.update", id: "a", fields: { parentId: null, position: { x: 500, y: 100 } } },
    ]);
  });

  it("leaves nodes alone when they stay in their parent, move with an ancestor, or no longer exist", () => {
    const state = nestedState();
    expect(dropReparent(state, ["a"], { allowLeave: true })).toEqual([]);
    expect(dropReparent(state, ["g", "a", "ghost"], { allowLeave: true })).toEqual([]);
  });
});

describe("connection rules", () => {
  it("refuses missing nodes, self-loops, unconnectable kinds, group–child pairs and duplicates", () => {
    const base = nestedState();
    const state = { ...base, nodes: { ...base.nodes, n: node("n", { kind: "note", number: 9 }) } };
    expect(connectRefusal(state, "a", "ghost")).toBe("missing");
    expect(connectRefusal(state, "a", "a")).toBe("self");
    expect(connectRefusal(state, "n", "a")).toBe("unconnectable");
    expect(connectRefusal(state, "g", "a")).toBe("group-child");
    expect(connectRefusal(state, "b", "g")).toBe("group-child");
    expect(connectRefusal(state, "a", "b")).toBe("duplicate");
  });

  it("allows the reverse direction and edges to and from groups", () => {
    const state = nestedState();
    expect(canConnect(state, "b", "a")).toBe(true);
    expect(canConnect(state, "c", "g")).toBe(true);
    expect(canConnect(state, "g", "d")).toBe(true);
  });
});
