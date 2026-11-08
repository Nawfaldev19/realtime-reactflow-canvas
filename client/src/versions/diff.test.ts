import { describe, expect, it } from "vitest";
import { edge, node, sampleState, stateOf } from "../test/fixtures";
import type { DiagramNode, DocumentState } from "../document/types";
import { diffDocuments, formatValue, GEOMETRY_TOLERANCE, matchKeys, sameContent } from "./diff";

/** The same diagram with every id replaced (as a version copy does), keys kept. */
function copied(state: DocumentState, prefix = "copy-"): DocumentState {
  const id = (old: string) => `${prefix}${old}`;
  return stateOf(
    Object.values(state.nodes).map((entry) => ({
      ...entry,
      id: id(entry.id),
      parentId: entry.parentId === null ? null : id(entry.parentId),
    })),
    Object.values(state.edges).map((entry) => ({
      ...entry,
      id: id(entry.id),
      source: id(entry.source),
      target: id(entry.target),
    })),
  );
}

const update = (state: DocumentState, id: string, fields: Partial<DiagramNode>): DocumentState => {
  const current = state.nodes[id];
  if (!current) throw new Error(`no node ${id}`);
  return { ...state, nodes: { ...state.nodes, [id]: { ...current, ...fields } } };
};

const statusOf = (state: DocumentState, older: DocumentState) => diffDocuments(older, state).newer.nodes;

describe("diffDocuments", () => {
  it("finds nothing between a document and itself", () => {
    const diff = diffDocuments(sampleState(), sampleState());

    expect(diff.identical).toBe(true);
    expect(diff.counts).toEqual({
      nodes: { added: 0, removed: 0, changed: 0 },
      edges: { added: 0, removed: 0, changed: 0 },
    });
    expect(Object.values(diff.newer.nodes)).toEqual(["unchanged", "unchanged", "unchanged", "unchanged"]);
  });

  it("matches by stable key, so a copy with every id remapped is unchanged, never removed and re-added", () => {
    const diff = diffDocuments(sampleState(), copied(sampleState()));

    expect(diff.identical).toBe(true);
    expect(diff.nodes.map((entry) => [entry.olderId, entry.newerId])).toContainEqual(["a", "copy-a"]);
    expect(diff.older.nodes).toEqual({ g: "unchanged", a: "unchanged", b: "unchanged", c: "unchanged" });
  });

  it("marks exactly the added, the removed and the edited step (one of each)", () => {
    const older = sampleState();
    let newer = update(older, "a", { data: { text: "Sand the legs" } });
    newer = stateOf(
      [...Object.values(newer.nodes).filter((entry) => entry.id !== "c"), node("d", { number: 5 })],
      [newer.edges.ab ?? edge("x", "a", "b")],
    );
    const diff = diffDocuments(older, newer);

    expect(diff.counts.nodes).toEqual({ added: 1, removed: 1, changed: 1 });
    expect(diff.counts.edges).toEqual({ added: 0, removed: 1, changed: 0 });
    expect(diff.newer.nodes).toEqual({ g: "unchanged", a: "changed", b: "unchanged", d: "added" });
    expect(diff.older.nodes).toEqual({ g: "unchanged", a: "changed", b: "unchanged", c: "removed" });
    expect(diff.older.edges).toEqual({ ab: "unchanged", bc: "removed" });
    expect(diff.nodes.find((entry) => entry.olderId === "a")?.changes).toEqual([
      { field: "data.text", description: "Text changed" },
    ]);
  });

  it("counts geometry beyond the tolerance as a change, and rounding within it as none", () => {
    const older = sampleState();

    expect(statusOf(update(older, "c", { position: { x: 600 + GEOMETRY_TOLERANCE / 2, y: 100 } }), older).c).toBe(
      "unchanged",
    );
    expect(
      diffDocuments(older, update(older, "c", { position: { x: 601, y: 100 } })).nodes.find(
        (entry) => entry.newerId === "c",
      )?.changes,
    ).toEqual([{ field: "position", description: "Moved" }]);
    expect(
      diffDocuments(older, update(older, "c", { size: { width: 100, height: 80 }, z: 9 })).nodes.find(
        (entry) => entry.newerId === "c",
      )?.changes,
    ).toEqual([
      { field: "size", description: "Resized" },
      { field: "z", description: "Stacking order changed" },
    ]);
  });

  it("describes kind, data and style changes key by key, independent of key order", () => {
    const older = update(sampleState(), "c", {
      style: { fill: "#ffffff", stroke: "#111111" },
      data: { text: "c", shape: "hexagon", points: [1, 2, 3] },
    });
    const reordered = update(older, "c", {
      style: { stroke: "#111111", fill: "#ffffff" },
      data: { points: [1, 2, 3], shape: "hexagon", text: "c" },
    });
    const edited = update(older, "c", {
      kind: "shape",
      style: { fill: "#fde68a", bold: true },
      data: { text: "c", shape: "circle", points: [1, 2] },
    });

    expect(sameContent(older, reordered)).toBe(true);
    expect(
      diffDocuments(older, edited)
        .nodes.find((entry) => entry.newerId === "c")
        ?.changes.map((change) => change.description),
    ).toEqual([
      "Kind: Step → Shape",
      "Points changed",
      "Shape: “hexagon” → “circle”",
      "Bold: none → on",
      "Fill: “#ffffff” → “#fde68a”",
      "Stroke: “#111111” → none",
    ]);
  });

  it("compares group membership through keys: joining, leaving and switching groups", () => {
    const older = stateOf([
      node("g", { kind: "group" }),
      node("h", { kind: "group", number: 2 }),
      node("a", { number: 3 }),
      node("b", { number: 4, parentId: "g" }),
      node("c", { number: 5, parentId: "g" }),
    ]);
    const newer = copied(
      stateOf([
        node("g", { kind: "group" }),
        node("h", { kind: "group", number: 2 }),
        node("a", { number: 3, parentId: "g" }),
        node("b", { number: 4 }),
        node("c", { number: 5, parentId: "h" }),
      ]),
    );
    const changes = Object.fromEntries(
      diffDocuments(older, newer).nodes.map((entry) => [
        entry.match,
        entry.changes.map((change) => change.description),
      ]),
    );

    expect(changes).toEqual({
      g: [],
      h: [],
      a: ["Moved into a group"],
      b: ["Moved out of its group"],
      c: ["Moved to another group"],
    });
  });

  it("treats a reference to a missing group as different from any real group", () => {
    const older = stateOf([node("a", { parentId: "ghost" })]);
    const newer = stateOf([node("a", { parentId: "elsewhere" })]);

    expect(diffDocuments(older, newer).nodes[0]?.changes).toEqual([
      { field: "parent", description: "Moved to another group" },
    ]);
    expect(sameContent(older, stateOf([node("a", { parentId: "ghost" })]))).toBe(true);
  });

  it("describes connector changes: ends by key, sides, route, label and style", () => {
    const older = stateOf(
      [node("a"), node("b", { number: 2 }), node("c", { number: 3 })],
      [edge("e", "a", "b", { label: { text: "yes" } })],
    );
    const moved = copied(
      stateOf(Object.values(older.nodes), [
        edge("e", "b", "c", {
          kind: "floating",
          sourceSide: "left",
          route: { style: "spline", points: [{ id: "p", x: 1, y: 2 }] },
          label: { text: "no" },
          style: { stroke: "#000000" },
        }),
      ]),
    );
    const restyledLabel = stateOf(Object.values(older.nodes), [
      edge("e", "a", "b", { label: { text: "yes", bold: true } }),
    ]);

    expect(diffDocuments(older, moved).edges[0]?.changes.map((change) => change.description)).toEqual([
      "Kind: connector → floating",
      "Starts at another step",
      "Ends at another step",
      "Attached to other sides",
      "Route: step → spline",
      "Route points changed",
      "Label text changed",
      "Stroke: none → “#000000”",
    ]);
    expect(diffDocuments(older, restyledLabel).edges[0]?.changes).toEqual([
      { field: "label", description: "Label style changed" },
    ]);
    expect(diffDocuments(older, copied(older)).identical).toBe(true);
  });

  it("reports added and removed connectors and a changed automatic layout", () => {
    const older = sampleState();
    const newer: DocumentState = {
      ...stateOf(Object.values(older.nodes), [edge("ac", "a", "c")]),
      layout: { engine: "dagre", direction: "LR", manual: { nodes: {}, edges: {} } },
    };
    const diff = diffDocuments(older, newer);

    expect(diff.counts.edges).toEqual({ added: 1, removed: 2, changed: 0 });
    expect(diff.layout).toEqual({ field: "layout", description: "Automatic layout: off → dagre LR" });
    expect(diff.identical).toBe(false);
    expect(diffDocuments(newer, { ...newer, layout: null }).layout?.description).toBe(
      "Automatic layout: dagre LR → off",
    );
  });

  it("matches duplicated keys by id instead of pairing them with the wrong twin", () => {
    const older = stateOf([node("a", { key: "k" }), node("b", { key: "k", number: 2 })]);
    const newer = stateOf([node("b", { key: "k", number: 2, data: { text: "edited" } }), node("a", { key: "k" })]);

    expect([...matchKeys(older.nodes).keys()]).toEqual(["k\u0000a", "k\u0000b"]);
    expect(diffDocuments(older, newer).newer.nodes).toEqual({ a: "unchanged", b: "changed" });
  });

  it("an empty document against a full one is all added, and the reverse all removed", () => {
    const empty = stateOf([]);

    expect(diffDocuments(empty, sampleState()).counts.nodes.added).toBe(4);
    expect(diffDocuments(sampleState(), empty).counts.nodes.removed).toBe(4);
    expect(diffDocuments(empty, empty).identical).toBe(true);
  });

  it("is symmetric: swapping the documents swaps added and removed", () => {
    const older = sampleState();
    const newer = stateOf(
      [...Object.values(older.nodes).filter((entry) => entry.id !== "b"), node("x", { number: 9 })],
      [edge("ac", "a", "c")],
    );
    const forward = diffDocuments(older, newer).counts;
    const backward = diffDocuments(newer, older).counts;

    expect([forward.nodes.added, forward.nodes.removed, forward.edges.added, forward.edges.removed]).toEqual([
      backward.nodes.removed,
      backward.nodes.added,
      backward.edges.removed,
      backward.edges.added,
    ]);
  });
});

describe("formatValue", () => {
  it("formats plain values for a diff card", () => {
    expect([
      formatValue(undefined),
      formatValue(null),
      formatValue(true),
      formatValue(false),
      formatValue(1.23456),
    ]).toEqual(["none", "none", "on", "off", "1.23"]);
    expect(formatValue("  two\n lines ")).toBe("“two lines”");
    expect(formatValue("x".repeat(40))).toBe(`“${"x".repeat(31)}…”`);
  });
});
