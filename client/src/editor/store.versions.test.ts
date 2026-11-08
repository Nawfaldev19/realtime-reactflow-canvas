import { describe, expect, it } from "vitest";
import { serializeDocument } from "../document/serialize";
import { node, sampleState, stateOf } from "../test/fixtures";
import { diffDocuments } from "../versions/diff";
import { createEditorStore, type LoadedDiagram } from "./store";

function storeWith(overrides: Partial<LoadedDiagram> = {}) {
  const store = createEditorStore();
  store.getState().load({
    id: "d1",
    title: "Walnut table",
    revision: 3,
    document: serializeDocument(sampleState()),
    canEdit: true,
    ...overrides,
  });
  return store;
}

/** The sample diagram without the free step "c" and its connector, plus a new note. */
const version = () =>
  stateOf(
    [...Object.values(sampleState().nodes).filter((entry) => entry.id !== "c"), node("n", { kind: "note", number: 7 })],
    [sampleState().edges.ab ?? []].flat(),
  );

describe("restoring a version", () => {
  it("applies one operation that makes the diagram show the version, as one pending change and one undo step", () => {
    const store = storeWith();

    expect(store.getState().restoreVersion(version())).toBe(true);
    const state = store.getState();
    expect(diffDocuments(version(), state.doc).identical).toBe(true);
    expect(state.pending).toHaveLength(1);
    expect(state.pending[0]?.op.type).toBe("batch");
    expect(state.history.past).toHaveLength(1);

    expect(store.getState().undo()).toBe(true);
    expect(diffDocuments(sampleState(), store.getState().doc).identical).toBe(true);
    expect(store.getState().redo()).toBe(true);
    expect(diffDocuments(version(), store.getState().doc).identical).toBe(true);
  });

  it("clears selection and editing of what the restore removed", () => {
    const store = storeWith();
    store.getState().startEditing("c");
    store.getState().setSelection(["c", "a"], ["bc"]);

    store.getState().restoreVersion(version());
    expect(store.getState()).toMatchObject({ selectedNodeIds: ["a"], selectedEdgeIds: [], editingNodeId: null });
  });

  it("does nothing when the diagram already shows the version, or for a viewer", () => {
    expect(storeWith().getState().restoreVersion(sampleState())).toBe(false);
    const viewer = storeWith({ canEdit: false });

    expect(viewer.getState().restoreVersion(version())).toBe(false);
    expect(viewer.getState().pending).toEqual([]);
  });

  it("queues the restore for the room while collaborating, removing data keys the version did not have", () => {
    const store = storeWith({ collaborationEnabled: true });
    const current = store.getState().doc;
    const target = {
      ...current,
      nodes: { ...current.nodes, c: { ...node("c", { number: 4, position: { x: 600, y: 100 }, z: 4 }), data: {} } },
    };

    expect(store.getState().restoreVersion(target)).toBe(true);
    expect(store.getState()).toMatchObject({ collaborating: true, pending: [{ seq: 1 }] });
    expect(store.getState().doc.nodes.c?.data).toEqual({});
  });

  it("remembers the highest version number announced by others", () => {
    const store = storeWith();
    store.getState().noteVersionSaved(4);
    store.getState().noteVersionSaved(2);

    expect(store.getState().announcedVersion).toBe(4);
  });
});
