import { describe, expect, it } from "vitest";
import { edge, node, sampleState, sequentialIds, stateOf } from "../test/fixtures";
import { groupNodes } from "./groups";
import {
  EMPTY_HISTORY,
  HISTORY_LIMIT,
  diffStates,
  recordEntry,
  revertOperation,
  step,
  type History,
  type HistoryEntry,
} from "./history";
import { applyOperation, deleteNodes, type Operation } from "./operations";
import type { DiagramLayout, DocumentState } from "./types";

const apply = (state: DocumentState, op: Operation) => applyOperation(state, op).state;

/** Applies `op` and returns the new state with its history entry. */
function edit(state: DocumentState, op: Operation): { state: DocumentState; entry: HistoryEntry } {
  const next = apply(state, op);
  const entry = diffStates(state, next);
  if (!entry) throw new Error("expected a change");
  return { state: next, entry };
}

function undo(state: DocumentState, entry: HistoryEntry): DocumentState {
  const op = revertOperation(state, entry, "undo");
  return op ? apply(state, op) : state;
}

function redo(state: DocumentState, entry: HistoryEntry): DocumentState {
  const op = revertOperation(state, entry, "redo");
  return op ? apply(state, op) : state;
}

const LAYOUT: DiagramLayout = {
  engine: "dagre",
  direction: "TB",
  manual: { nodes: { c: { x: 600, y: 100, width: 100, height: 50 } }, edges: {} },
};

describe("diffStates", () => {
  it("returns null when nothing changed", () => {
    const state = sampleState();
    expect(diffStates(state, state)).toBeNull();
    expect(
      diffStates(state, apply(state, { type: "node.update", id: "c", fields: { position: { x: 600, y: 100 } } })),
    ).toBeNull();
  });

  it("records only the entities whose objects changed, with before and after", () => {
    const state = sampleState();
    const { entry } = edit(state, {
      type: "batch",
      ops: [
        { type: "node.update", id: "c", fields: { z: 9 } },
        { type: "edge.remove", id: "ab" },
      ],
    });
    expect(entry.nodes).toEqual([{ id: "c", before: state.nodes.c, after: { ...state.nodes.c, z: 9 } }]);
    expect(entry.edges).toEqual([{ id: "ab", before: state.edges.ab, after: null }]);
    expect(entry.layout).toBeNull();
  });

  it("records additions, cascaded removals and layout switches", () => {
    const state = sampleState();
    const removed = edit(state, { type: "node.remove", id: "g" }).entry;
    expect(removed.nodes.map((change) => change.id).sort()).toEqual(["a", "b", "g"]);
    expect(removed.edges.map((change) => change.id).sort()).toEqual(["ab", "bc"]);
    const added = edit(state, { type: "node.add", node: node("n", { number: 9 }) }).entry;
    expect(added.nodes).toEqual([{ id: "n", before: null, after: node("n", { number: 9 }) }]);
    const layout = edit(state, { type: "layout.set", layout: LAYOUT }).entry;
    expect(layout).toEqual({ nodes: [], edges: [], layout: { before: null, after: LAYOUT } });
  });
});

describe("revertOperation", () => {
  it("undoes and redoes a move exactly", () => {
    const start = sampleState();
    const { state, entry } = edit(start, { type: "node.update", id: "c", fields: { position: { x: 640.5, y: 133 } } });
    const undone = undo(state, entry);
    expect(undone.nodes.c?.position).toEqual({ x: 600, y: 100 });
    expect(redo(undone, entry).nodes.c?.position).toEqual({ x: 640.5, y: 133 });
  });

  it("restores only the fields this person changed and keeps a collaborator's other edits", () => {
    const { state, entry } = edit(sampleState(), {
      type: "node.update",
      id: "c",
      fields: { position: { x: 0, y: 0 } },
    });
    const theirs = apply(state, {
      type: "node.update",
      id: "c",
      fields: { data: { text: "Theirs" }, size: { width: 300, height: 90 } },
    });
    const undone = undo(theirs, entry);
    expect(undone.nodes.c).toMatchObject({
      position: { x: 600, y: 100 },
      size: { width: 300, height: 90 },
      data: { text: "Theirs" },
    });
  });

  it("never overwrites a field a collaborator changed after this person", () => {
    const { state, entry } = edit(sampleState(), {
      type: "node.update",
      id: "c",
      fields: { position: { x: 0, y: 0 } },
    });
    const theirs = apply(state, { type: "node.update", id: "c", fields: { position: { x: 5, y: 5 } } });
    expect(revertOperation(theirs, entry, "undo")).toBeNull();
  });

  it("merges data and style per key", () => {
    const start = stateOf([
      node("n", { data: { text: "Cut", color: "#111111" }, style: { fill: "#ffffff", stroke: "#000000" } }),
    ]);
    const { state, entry } = edit(start, {
      type: "node.update",
      id: "n",
      fields: {
        data: { color: "#222222", shape: "circle" },
        style: { fill: "#ff0000", stroke: "#000000", borderWidth: 2 },
      },
    });
    const theirs = apply(state, {
      type: "node.update",
      id: "n",
      fields: { data: { text: "Glue" }, style: { fill: "#ff0000", stroke: "#00ff00", borderWidth: 2 } },
    });
    const undone = undo(theirs, entry);
    expect(undone.nodes.n?.data).toEqual({ text: "Glue", color: "#111111" });
    expect(undone.nodes.n?.style).toEqual({ fill: "#ffffff", stroke: "#00ff00" });
    expect(redo(undone, entry).nodes.n?.style).toEqual({ fill: "#ff0000", stroke: "#00ff00", borderWidth: 2 });
  });

  it("skips entities a collaborator removed, and re-additions that already exist", () => {
    const moved = edit(sampleState(), { type: "node.update", id: "c", fields: { z: 7 } });
    expect(revertOperation(apply(moved.state, { type: "node.remove", id: "c" }), moved.entry, "undo")).toBeNull();
    const removed = edit(sampleState(), { type: "edge.remove", id: "bc" });
    const readded = apply(removed.state, { type: "edge.add", edge: edge("bc", "b", "c") });
    expect(revertOperation(readded, removed.entry, "undo")).toBeNull();
    const added = edit(sampleState(), { type: "node.add", node: node("n", { number: 8 }) });
    expect(revertOperation(apply(added.state, { type: "node.remove", id: "n" }), added.entry, "undo")).toBeNull();
  });

  it("brings back a deleted group with its children and connectors, parents first", () => {
    const start = sampleState();
    const { state, entry } = edit(start, deleteNodes(start, ["g"]));
    expect(Object.keys(state.nodes)).toEqual(["c"]);
    const op = revertOperation(state, entry, "undo");
    expect(op?.type).toBe("batch");
    const kinds = op?.type === "batch" ? op.ops.map((inner) => inner.type) : [];
    expect(kinds.indexOf("node.add")).toBeLessThan(kinds.indexOf("edge.add"));
    expect(op?.type === "batch" && op.ops[0]?.type === "node.add" ? op.ops[0].node.id : null).toBe("g");
    const undone = apply(state, op ?? { type: "batch", ops: [] });
    expect(undone.nodes).toEqual(start.nodes);
    expect(undone.edges).toEqual(start.edges);
    expect(redo(undone, entry).nodes).toEqual(state.nodes);
  });

  it("re-adds three levels of nesting in parent order", () => {
    const start = stateOf([
      node("outer", { kind: "group", size: { width: 500, height: 500 } }),
      node("inner", { kind: "group", parentId: "outer", size: { width: 300, height: 300 }, number: 2 }),
      node("leaf", { parentId: "inner", number: 3 }),
    ]);
    const { state, entry } = edit(start, {
      type: "batch",
      ops: [
        { type: "node.remove", id: "leaf" },
        { type: "node.remove", id: "inner" },
        { type: "node.remove", id: "outer" },
      ],
    });
    expect(undo(state, entry).nodes).toEqual(start.nodes);
  });

  it("undoes grouping: children leave the group before it is removed", () => {
    const free = stateOf([
      node("p", { position: { x: 10, y: 10 } }),
      node("q", { position: { x: 200, y: 40 }, number: 2 }),
    ]);
    const grouped = groupNodes(free, ["p", "q"], { newId: sequentialIds("grp") });
    if (!grouped) throw new Error("expected a group");
    const { state, entry } = edit(free, grouped.op);
    const undone = undo(state, entry);
    expect(undone.nodes).toEqual(free.nodes);
  });

  it("undoes and redoes connector changes field by field", () => {
    const start = sampleState();
    const { state, entry } = edit(start, {
      type: "edge.update",
      id: "ab",
      fields: { route: { style: "spline", points: [] }, style: { stroke: "#ff0000" } },
    });
    const theirs = apply(state, { type: "edge.update", id: "ab", fields: { label: { text: "glue" } } });
    const undone = undo(theirs, entry);
    expect(undone.edges.ab).toMatchObject({ route: { style: "step" }, style: {}, label: { text: "glue" } });
    expect(redo(undone, entry).edges.ab).toMatchObject({ route: { style: "spline" }, style: { stroke: "#ff0000" } });
  });

  it("switches the layout back only while it still holds this person's value", () => {
    const { state, entry } = edit(sampleState(), { type: "layout.set", layout: LAYOUT });
    expect(undo(state, entry).layout).toBeNull();
    const other: DiagramLayout = { ...LAYOUT, direction: "LR" };
    expect(revertOperation(apply(state, { type: "layout.set", layout: other }), entry, "undo")).toBeNull();
  });
});

describe("history stacks", () => {
  const entryFor = (id: string): HistoryEntry => ({
    nodes: [{ id, before: null, after: node(id) }],
    edges: [],
    layout: null,
  });

  it("keeps the newest entries up to the limit and clears redo on a new edit", () => {
    let history: History = EMPTY_HISTORY;
    for (let index = 0; index < HISTORY_LIMIT + 5; index += 1)
      history = recordEntry(history, entryFor(`n${String(index)}`));
    expect(history.past).toHaveLength(HISTORY_LIMIT);
    expect(history.past[0]?.nodes[0]?.id).toBe("n5");
    const withFuture: History = { past: history.past, future: [entryFor("f")] };
    expect(recordEntry(withFuture, entryFor("x"), 3)).toEqual({
      past: [...history.past.slice(-2), entryFor("x")],
      future: [],
    });
  });

  it("moves entries between the stacks and drops ones that no longer change anything", () => {
    const start = sampleState();
    const first = edit(start, { type: "node.update", id: "c", fields: { z: 10 } });
    const second = edit(first.state, { type: "node.update", id: "a", fields: { z: 20 } });
    // A collaborator puts "a" back themselves, so the newest entry has nothing left to undo.
    const current = apply(second.state, { type: "node.update", id: "a", fields: { z: 30 } });
    const history: History = { past: [first.entry, second.entry], future: [] };
    const undone = step(history, current, "undo");
    expect(undone.history).toEqual({ past: [], future: [first.entry] });
    const after = apply(current, undone.op ?? { type: "batch", ops: [] });
    expect(after.nodes.c?.z).toBe(start.nodes.c?.z);
    const redone = step(undone.history, after, "redo");
    expect(redone.history).toEqual({ past: [first.entry], future: [] });
    expect(apply(after, redone.op ?? { type: "batch", ops: [] }).nodes.c?.z).toBe(10);
  });

  it("returns no operation from an empty stack", () => {
    expect(step(EMPTY_HISTORY, sampleState(), "undo")).toEqual({ history: EMPTY_HISTORY, op: null });
    expect(step(EMPTY_HISTORY, sampleState(), "redo").op).toBeNull();
  });
});
