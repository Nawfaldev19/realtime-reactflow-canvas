import { describe, expect, it } from "vitest";
import { serializeDocument } from "../document/serialize";
import { edge, node, sampleState, stateOf } from "../test/fixtures";
import { createEditorStore, hasUnsavedChanges, type LoadedDiagram } from "./store";

function loaded(overrides: Partial<LoadedDiagram> = {}): LoadedDiagram {
  return {
    id: "d1",
    title: "Walnut table",
    revision: 3,
    document: serializeDocument(sampleState()),
    canEdit: true,
    ...overrides,
  };
}

function storeWith(overrides: Partial<LoadedDiagram> = {}) {
  const store = createEditorStore();
  store.getState().load(loaded(overrides));
  return store;
}

describe("loading", () => {
  it("parses the document and starts a clean session", () => {
    const store = storeWith();
    const state = store.getState();

    expect(state.diagramId).toBe("d1");
    expect(state.revision).toBe(3);
    expect(Object.keys(state.doc.nodes)).toEqual(["g", "c", "a", "b"]);
    expect(state.loadReport?.detached).toEqual([]);
    expect(hasUnsavedChanges(state)).toBe(false);
    expect(state.saveStatus).toEqual({ kind: "idle" });
  });

  it("replaces the previous session entirely", () => {
    const store = storeWith();
    store.getState().setSelection(["a"], []);
    store.getState().load(loaded({ id: "d2", document: { nodes: [] } }));

    expect(store.getState().selectedNodeIds).toEqual([]);
    expect(store.getState().doc.nodes).toEqual({});
  });
});

describe("local operations", () => {
  it("applies an operation, numbers it and records it as pending", () => {
    const store = storeWith();
    const changed = store.getState().apply({ type: "node.update", id: "c", fields: { position: { x: 1, y: 2 } } });
    const state = store.getState();

    expect(changed).toBe(true);
    expect(state.doc.nodes.c?.position).toEqual({ x: 1, y: 2 });
    expect(state.localSeq).toBe(1);
    expect(state.pending).toHaveLength(1);
  });

  it("ignores operations that change nothing", () => {
    const store = storeWith();
    const before = store.getState();
    const changed = store.getState().apply({ type: "node.update", id: "c", fields: { position: { x: 600, y: 100 } } });

    expect(changed).toBe(false);
    expect(store.getState()).toBe(before);
  });

  it("viewers cannot change the document", () => {
    const store = storeWith({ canEdit: false });

    expect(store.getState().apply({ type: "node.remove", id: "c" })).toBe(false);
    expect(store.getState().doc.nodes.c).toBeDefined();
    expect(store.getState().addNode("step", { x: 0, y: 0 })).toBeNull();
  });
});

describe("dragging", () => {
  it("keeps drag frames ephemeral and commits one operation on release", () => {
    const store = storeWith();
    store.getState().setDragPositions({ c: { x: 610, y: 100 } });
    store.getState().setDragPositions({ c: { x: 650, y: 120 }, a: { x: 30, y: 40 } });

    expect(store.getState().pending).toHaveLength(0);
    store.getState().commitDrag();

    const state = store.getState();
    expect(state.pending).toHaveLength(1);
    expect(state.pending[0]?.op.type).toBe("batch");
    expect(state.doc.nodes.c?.position).toEqual({ x: 650, y: 120 });
    expect(state.dragPositions).toEqual({});
  });

  it("a single dragged node commits a single update, and an empty release commits nothing", () => {
    const store = storeWith();
    store.getState().commitDrag();
    expect(store.getState().pending).toHaveLength(0);

    store.getState().setDragPositions({ c: { x: 1, y: 1 } });
    store.getState().commitDrag();
    expect(store.getState().pending[0]?.op).toEqual({
      type: "node.update",
      id: "c",
      fields: { position: { x: 1, y: 1 } },
    });
  });

  it("measured sizes never become operations", () => {
    const store = storeWith();
    store.getState().setMeasured({ c: { width: 100, height: 60 } });

    expect(store.getState().measured.c).toEqual({ width: 100, height: 60 });
    expect(store.getState().pending).toHaveLength(0);
  });
});

describe("selection", () => {
  it("is personal state and does not create operations", () => {
    const store = storeWith();
    store.getState().setSelection(["a", "b"], ["ab"]);

    expect(store.getState().selectedNodeIds).toEqual(["a", "b"]);
    expect(store.getState().pending).toHaveLength(0);
  });

  it("keeps the same arrays when the selection did not change", () => {
    const store = storeWith();
    store.getState().setSelection(["a"], []);
    const before = store.getState();
    store.getState().setSelection(["a"], []);

    expect(store.getState()).toBe(before);
  });
});

describe("editing helpers", () => {
  it("adds a node with the next number and selects it", () => {
    const store = storeWith();
    const id = store.getState().addNode("note", { x: 5, y: 5 });
    const state = store.getState();

    expect(id).not.toBeNull();
    expect(state.doc.nodes[id ?? ""]).toMatchObject({ kind: "note", number: 5 });
    expect(state.doc.nextNumber).toBe(6);
    expect(state.selectedNodeIds).toEqual([id]);
  });

  it("connects two nodes once and never to itself", () => {
    const store = storeWith();
    store.getState().connect("c", "a");
    store.getState().connect("c", "a");
    store.getState().connect("c", "c");

    expect(Object.values(store.getState().doc.edges).filter((entry) => entry.source === "c")).toHaveLength(1);
  });

  it("deletes the selection with attached edges and children, in one operation", () => {
    const store = storeWith();
    store.getState().setSelection(["g"], ["bc"]);
    store.getState().deleteSelection();
    const state = store.getState();

    expect(Object.keys(state.doc.nodes)).toEqual(["c"]);
    expect(state.doc.edges).toEqual({});
    expect(state.pending).toHaveLength(1);
    expect(state.selectedNodeIds).toEqual([]);
    expect(state.selectedEdgeIds).toEqual([]);
  });

  it("updates the title", () => {
    const store = storeWith();
    store.getState().setTitle("Walnut table v2");

    expect(store.getState().title).toBe("Walnut table v2");
  });
});

describe("saving and rebasing", () => {
  it("snapshots the document with its base revision and latest change", () => {
    const store = storeWith();
    store.getState().apply({ type: "node.remove", id: "c" });
    const snapshot = store.getState().snapshot();

    expect(snapshot.baseRevision).toBe(3);
    expect(snapshot.changeId).toBe(1);
    expect(snapshot.document.nodes.map((entry) => entry.id)).toEqual(["g", "a", "b"]);
  });

  it("markSaved advances the revision and drops only the saved operations", () => {
    const store = storeWith();
    store.getState().apply({ type: "node.update", id: "c", fields: { z: 10 } });
    store.getState().apply({ type: "node.update", id: "c", fields: { z: 11 } });
    store.getState().markSaved(4, 1);

    expect(store.getState().revision).toBe(4);
    expect(store.getState().pending.map((entry) => entry.seq)).toEqual([2]);
  });

  it("rebase replays unsaved operations on the server copy, so both people's changes survive", () => {
    const store = storeWith();
    store.getState().setSelection(["c", "b"], ["ab"]);
    store.getState().apply({ type: "node.update", id: "c", fields: { position: { x: 700, y: 100 } } });
    store.getState().apply({ type: "node.update", id: "b", fields: { data: { text: "mine" } } });

    const theirs = sampleState();
    const server = serializeDocument({
      ...theirs,
      nodes: { ...theirs.nodes, a: node("a", { ...theirs.nodes.a, data: { text: "theirs" } }) },
      edges: { bc: edge("bc", "b", "c") },
    });
    const withoutB = { ...server, nodes: server.nodes.filter((entry) => entry.id !== "b"), edges: [] };
    store.getState().rebase({ kind: "conflict", revision: 9, document: withoutB, updatedBy: "Ben Lindqvist" });
    const state = store.getState();

    expect(state.revision).toBe(9);
    expect(state.doc.nodes.c?.position).toEqual({ x: 700, y: 100 });
    expect(state.doc.nodes.a?.data.text).toBe("theirs");
    expect(state.doc.nodes.b).toBeUndefined();
    expect(state.mergeNotice).toEqual({ updatedBy: "Ben Lindqvist", dropped: 1 });
    expect(state.selectedNodeIds).toEqual(["c"]);
    expect(state.selectedEdgeIds).toEqual([]);
    expect(state.pending).toHaveLength(2);

    store.getState().dismissMergeNotice();
    expect(store.getState().mergeNotice).toBeNull();
  });

  it("records the save status for the interface", () => {
    const store = storeWith();
    store.getState().setSaveStatus({ kind: "saving" });

    expect(store.getState().saveStatus).toEqual({ kind: "saving" });
  });
});

describe("live fields and resizing", () => {
  it("shows live fields without operations, and commits them as one", () => {
    const store = storeWith();
    store.getState().setLive({ c: { size: { width: 300, height: 80 } } });
    expect(store.getState().live.c).toEqual({ size: { width: 300, height: 80 } });
    expect(store.getState().pending).toHaveLength(0);
    store.getState().setLive({ c: null });
    expect(store.getState().live).toEqual({});

    store.getState().setLive({ c: { size: { width: 300, height: 80 } } });
    store.getState().commitLive("c", { size: { width: 300, height: 80 } });
    expect(store.getState().live).toEqual({});
    expect(store.getState().doc.nodes.c?.size).toEqual({ width: 300, height: 80 });
    expect(store.getState().pending).toHaveLength(1);
  });

  it("resizing one of three selected nodes by 1.5× scales all three, in one operation", () => {
    const store = storeWith();
    store.getState().setSelection(["a", "b", "c"], []);
    store.getState().resizeLive({ c: { size: { width: 120, height: 60 } } });
    store.getState().resizeLive({ c: { size: { width: 150, height: 75 } } });
    expect(store.getState().live.a).toEqual({ position: { x: 20, y: 40 }, size: { width: 150, height: 75 } });
    expect(store.getState().pending).toHaveLength(0);
    store.getState().commitResize();

    const { doc, pending, live } = store.getState();
    expect(["a", "b", "c"].map((id) => doc.nodes[id]?.size)).toEqual([
      { width: 150, height: 75 },
      { width: 150, height: 75 },
      { width: 150, height: 75 },
    ]);
    expect(pending).toHaveLength(1);
    expect(live).toEqual({});
  });

  it("moves the others by the dragged node's top-left offset and clamps them to their minimum", () => {
    const store = storeWith();
    store.getState().setSelection(["a", "c"], []);
    store.getState().resizeLive({ c: { position: { x: 590, y: 95 }, size: { width: 20, height: 10 } } });
    store.getState().commitResize();
    expect(store.getState().doc.nodes.a).toMatchObject({ position: { x: 10, y: 35 }, size: { width: 25, height: 25 } });
    expect(store.getState().doc.nodes.c).toMatchObject({
      position: { x: 590, y: 95 },
      size: { width: 20, height: 10 },
    });
  });

  it("keeps position-only changes for children held in place, and resizes an unselected node alone", () => {
    const store = storeWith();
    store.getState().resizeLive({
      g: { position: { x: 90, y: 100 }, size: { width: 310, height: 200 } },
      a: { position: { x: 30, y: 40 } },
    });
    store.getState().commitResize();
    expect(store.getState().doc.nodes.g).toMatchObject({
      position: { x: 90, y: 100 },
      size: { width: 310, height: 200 },
    });
    expect(store.getState().doc.nodes.a?.position).toEqual({ x: 30, y: 40 });
    expect(store.getState().doc.nodes.b?.position).toEqual({ x: 20, y: 120 });
  });

  it("a resized line takes its new clipped length", () => {
    const store = createEditorStore();
    const line = node("l", { kind: "line", size: { width: 160, height: 20 }, data: { rotation: 90, length: 160 } });
    store.getState().load(loaded({ document: serializeDocument(stateOf([line])) }));
    store.getState().resizeLive({ l: { size: { width: 240, height: 20 } } });
    store.getState().commitResize();
    expect(store.getState().doc.nodes.l?.data).toMatchObject({ rotation: 90, length: 240 });
  });

  it("ignores resizes from viewers, for missing nodes, and commits without a session do nothing", () => {
    const store = storeWith({ canEdit: false });
    store.getState().resizeLive({ c: { size: { width: 10, height: 10 } } });
    expect(store.getState().live).toEqual({});
    const editor = storeWith();
    editor.getState().commitResize();
    editor.getState().resizeLive({ ghost: { size: { width: 10, height: 10 } } });
    editor.getState().commitResize();
    expect(editor.getState().pending).toHaveLength(0);
  });
});

describe("text editing state", () => {
  it("starts only on text kinds, saves the draft once, and leaves an unchanged text alone", () => {
    const store = createEditorStore();
    store
      .getState()
      .load(loaded({ document: serializeDocument(stateOf([node("s"), node("l", { kind: "line", number: 2 })])) }));
    expect(store.getState().startEditing("l")).toBe(false);
    expect(store.getState().startEditing("ghost")).toBe(false);
    expect(store.getState().startEditing("s")).toBe(true);
    expect(store.getState().startEditing("s")).toBe(true);
    store.getState().finishEditing();
    expect(store.getState().pending).toHaveLength(0);

    store.getState().startEditing("s");
    store.getState().setEditDraft("Sand");
    store.getState().finishEditing();
    store.getState().finishEditing();
    expect(store.getState().doc.nodes.s?.data.text).toBe("Sand");
    expect(store.getState().pending).toHaveLength(1);
    store.getState().setEditDraft("ignored");
    expect(store.getState().editDraft).toBeNull();
  });

  it("switching to another node or to draw mode ends the current edit with its draft", () => {
    const store = createEditorStore();
    store.getState().load(loaded({ document: serializeDocument(stateOf([node("s"), node("t", { number: 2 })])) }));
    store.getState().startEditing("s");
    store.getState().setEditDraft("One");
    store.getState().startEditing("t");
    expect(store.getState().doc.nodes.s?.data.text).toBe("One");
    store.getState().setEditDraft("Two");
    store.getState().setDrawMode(true);
    expect(store.getState().doc.nodes.t?.data.text).toBe("Two");
    expect(store.getState().editingNodeId).toBeNull();
  });

  it("drops the edit when its node disappears in a rebase", () => {
    const store = storeWith();
    store.getState().startEditing("c");
    store.getState().setLive({ c: { size: { width: 1, height: 1 } } });
    const server = serializeDocument(sampleState());
    store.getState().rebase({
      kind: "conflict",
      revision: 5,
      document: { ...server, nodes: server.nodes.filter((entry) => entry.id !== "c"), edges: [] },
      updatedBy: null,
    });
    expect(store.getState().editingNodeId).toBeNull();
    expect(store.getState().live).toEqual({});
    store.getState().finishEditing();
  });
});

describe("structure commands", () => {
  it("connects with sides and refuses invalid pairs", () => {
    const store = storeWith();
    expect(store.getState().connect("c", "a", "left", "right")).toBe(true);
    const created = Object.values(store.getState().doc.edges).find((entry) => entry.source === "c");
    expect(created).toMatchObject({ sourceSide: "left", targetSide: "right" });
    expect(store.getState().connect("g", "a")).toBe(false);
  });

  it("drag commits joining a group in the same operation as the move", () => {
    const store = storeWith();
    store.getState().setDragPositions({ c: { x: 150, y: 150 } });
    store.getState().commitDrag();
    expect(store.getState().doc.nodes.c?.parentId).toBe("g");
    expect(store.getState().pending).toHaveLength(1);
  });

  it("arranges, groups and ungroups the selection", () => {
    const store = storeWith();
    store.getState().setSelection(["a"], []);
    expect(store.getState().arrangeSelection("front")).toBe(true);
    expect(store.getState().arrangeSelection("front")).toBe(false);
    store.getState().setSelection(["a", "c"], []);
    expect(store.getState().groupSelection()).toBe(false);
    store.getState().setSelection(["a", "b"], []);
    expect(store.getState().groupSelection()).toBe(true);
    expect(store.getState().selectedNodeIds).toEqual([]);
    store.getState().setSelection(["c"], []);
    expect(store.getState().ungroupSelection()).toBe(false);
  });

  it("updates several nodes in one operation and skips the ones that change nothing", () => {
    const store = storeWith();
    expect(store.getState().updateNodes(["a", "b", "ghost"], (entry) => (entry.id === "a" ? { z: 9 } : null))).toBe(
      true,
    );
    expect(store.getState().updateNodes(["a"], () => null)).toBe(false);
    expect(store.getState().pending).toHaveLength(1);
  });

  it("adds a shape with the requested outline", () => {
    const store = storeWith();
    const id = store.getState().addNode("shape", { x: 0, y: 0 }, { shape: "triangle" });
    expect(store.getState().doc.nodes[id ?? ""]?.data.shape).toBe("triangle");
  });
});

describe("draw mode", () => {
  it("adds sketches with the current style and removes the most recent one", () => {
    const store = storeWith();
    store.getState().setDrawMode(true);
    store.getState().setDrawStyle({ strokeSize: 11 });
    const stroke = { box: { x: 0, y: 0, width: 30, height: 30 }, points: [0, 0, 0.5, 20, 20, 0.5] };
    const first = store.getState().addSketch(stroke);
    const second = store.getState().addSketch(stroke);
    expect(store.getState().drawnStrokes).toEqual([first, second]);
    expect(store.getState().doc.nodes[first ?? ""]?.data.strokeSize).toBe(11);
    store.getState().removeLastStroke();
    expect(store.getState().doc.nodes[second ?? ""]).toBeUndefined();
    expect(store.getState().drawnStrokes).toEqual([first]);
    store.getState().removeLastStroke();
    store.getState().removeLastStroke();
    expect(store.getState().drawnStrokes).toEqual([]);
  });

  it("refuses a stroke larger than the node size limit", () => {
    const store = storeWith();
    expect(
      store.getState().addSketch({ box: { x: 0, y: 0, width: 2600, height: 30 }, points: [0, 0, 0.5, 2590, 20, 0.5] }),
    ).toBeNull();
  });

  it("viewers cannot add sketches", () => {
    const store = storeWith({ canEdit: false });
    expect(store.getState().addSketch({ box: { x: 0, y: 0, width: 30, height: 30 }, points: [] })).toBeNull();
  });
});
