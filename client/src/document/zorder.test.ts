import { describe, expect, it } from "vitest";
import { node, stateOf } from "../test/fixtures";
import { applyOperation } from "./operations";
import { arrange, compareStack, groupLayers, type ArrangeCommand } from "./zorder";
import type { DiagramNode, DocumentState } from "./types";

/** A < B < C stacked on the same spot, and D far away. */
function stack(overrides: Record<string, Partial<DiagramNode>> = {}): DocumentState {
  return stateOf([
    node("A", { number: 1, z: 1, ...overrides.A }),
    node("B", { number: 2, z: 2, ...overrides.B }),
    node("C", { number: 3, z: 3, ...overrides.C }),
    node("D", { number: 4, z: 4, position: { x: 1000, y: 1000 }, ...overrides.D }),
  ]);
}

function run(state: DocumentState, ids: string[], command: ArrangeCommand): DocumentState {
  const op = arrange(state, ids, command);
  return op ? applyOperation(state, op).state : state;
}

const order = (state: DocumentState, ids = ["A", "B", "C"]) =>
  ids
    .map((id) => state.nodes[id])
    .filter((entry) => entry !== undefined)
    .sort(compareStack)
    .map((entry) => entry.id);

describe("bring forward and send backward", () => {
  it("with A < B < C overlapping, bring forward on A gives B < A < C", () => {
    const next = run(stack(), ["A"], "forward");
    expect(order(next)).toEqual(["B", "A", "C"]);
    expect(arrange(stack(), ["A"], "forward")).toEqual({
      type: "batch",
      ops: [
        { type: "node.update", id: "A", fields: { z: 2 } },
        { type: "node.update", id: "B", fields: { z: 1 } },
      ],
    });
  });

  it("send backward on C swaps it with B", () => {
    expect(order(run(stack(), ["C"], "backward"))).toEqual(["A", "C", "B"]);
  });

  it("only swaps with overlapping neighbours", () => {
    expect(arrange(stack(), ["C"], "forward")).toBeNull();
    expect(arrange(stack(), ["D"], "backward")).toBeNull();
  });

  it("breaks ties by renumbering first", () => {
    const tied = stack({ B: { z: 1 } });
    const next = run(tied, ["A"], "forward");
    expect(order(next)).toEqual(["B", "A", "C"]);
    expect(new Set(["A", "B", "C"].map((id) => next.nodes[id]?.z)).size).toBe(3);
  });
});

describe("bring to front and send to back", () => {
  it("front = maximum + 1; two nodes sent to front one after the other get distinct orders, the later on top", () => {
    const first = run(stack(), ["A"], "front");
    expect(first.nodes.A?.z).toBe(5);
    const second = run(first, ["B"], "front");
    expect(second.nodes.B?.z).toBe(6);
    expect(order(second)).toEqual(["C", "A", "B"]);
  });

  it("keeps the selection's own order when several move", () => {
    expect(order(run(stack(), ["B", "A"], "front"), ["A", "B", "C", "D"])).toEqual(["C", "D", "A", "B"]);
    expect(order(run(stack(), ["C", "D"], "back"), ["A", "B", "C", "D"])).toEqual(["C", "D", "A", "B"]);
  });

  it("renumbers to a dense 1..n range when back goes below 1", () => {
    const next = run(stack(), ["C"], "back");
    expect(["A", "B", "C", "D"].map((id) => next.nodes[id]?.z)).toEqual([2, 3, 1, 4]);
  });

  it("does nothing for a node already on top or at the bottom, or for unknown ids", () => {
    expect(arrange(stack(), ["D"], "front")).toBeNull();
    expect(arrange(stack(), ["A"], "back")).toBeNull();
    expect(arrange(stack(), ["ghost"], "front")).toBeNull();
  });
});

describe("bands", () => {
  it("groups are only reordered among groups", () => {
    const state = stateOf([
      node("g1", { kind: "group", number: 1, z: 10, size: { width: 400, height: 400 } }),
      node("g2", { kind: "group", number: 2, z: 20, size: { width: 400, height: 400 } }),
      node("n", { number: 3, z: 30 }),
    ]);
    expect(arrange(state, ["n"], "back")).toBeNull();
    expect(arrange(state, ["g1"], "front")).toEqual({ type: "node.update", id: "g1", fields: { z: 21 } });
  });

  it("groups draw below edges, outer groups first", () => {
    const state = stateOf([
      node("outer", { kind: "group", number: 1, z: 5 }),
      node("other", { kind: "group", number: 2, z: 1 }),
      node("inner", { kind: "group", number: 3, z: 0, parentId: "outer" }),
      node("n", { number: 4, z: 2 }),
    ]);
    expect([...groupLayers(state)]).toEqual([
      ["other", -3],
      ["outer", -2],
      ["inner", -1],
    ]);
  });
});
