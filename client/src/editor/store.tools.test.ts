import { describe, expect, it } from "vitest";
import { copyPayload } from "../document/clipboard";
import { absoluteBox } from "../document/groups";
import { serializeDocument } from "../document/serialize";
import type { DocumentState } from "../document/types";
import { NO_GUIDES, type Guide } from "../geometry/guides";
import { layoutCompound } from "../layout/compound";
import { dagreLayout } from "../layout/dagre";
import { layoutTreeOf } from "../layout/documentLayout";
import { edge, node, sampleState, stateOf } from "../test/fixtures";
import { createEditorStore } from "./store";

function storeWith(doc: DocumentState = sampleState(), canEdit = true) {
  const store = createEditorStore();
  store.getState().load({ id: "d", title: "Plan", revision: 1, document: serializeDocument(doc), canEdit });
  return store;
}

const move = (x: number, y: number) => ({ position: { x, y } });

describe("undo and redo", () => {
  it("undoes and redoes a drag exactly, as local operations that are saved", () => {
    const store = storeWith();
    store.getState().setDragPositions({ c: { x: 640, y: 130 } });
    store.getState().commitDrag();
    expect(store.getState().history.past).toHaveLength(1);
    expect(store.getState().undo()).toBe(true);
    expect(store.getState().doc.nodes.c?.position).toEqual({ x: 600, y: 100 });
    expect(store.getState().history).toMatchObject({ past: [], future: [expect.anything()] });
    expect(store.getState().pending).toHaveLength(2);
    expect(store.getState().redo()).toBe(true);
    expect(store.getState().doc.nodes.c?.position).toEqual({ x: 640, y: 130 });
    expect(store.getState().redo()).toBe(false);
  });

  it("a new edit after an undo clears redo", () => {
    const store = storeWith();
    store.getState().updateNodes(["c"], () => move(1, 1));
    store.getState().undo();
    store.getState().updateNodes(["c"], () => move(2, 2));
    expect(store.getState().history.future).toHaveLength(0);
  });

  it("drops removed nodes from the selection and is refused while editing text or for viewers", () => {
    const store = storeWith();
    store.getState().addNode("step", { x: 0, y: 0 });
    const [added = ""] = store.getState().selectedNodeIds;
    store.getState().undo();
    expect(store.getState().doc.nodes[added]).toBeUndefined();
    expect(store.getState().selectedNodeIds).toEqual([]);

    store.getState().redo();
    store.getState().startEditing(added);
    expect(store.getState().undo()).toBe(false);
    expect(storeWith(sampleState(), false).getState().undo()).toBe(false);
  });

  it("skips entries a collaborator already overwrote (via a rebase) and says nothing changed", () => {
    const store = storeWith();
    store.getState().updateNodes(["c"], () => move(5, 5));
    const theirs = {
      ...sampleState(),
      nodes: { ...sampleState().nodes, c: node("c", { number: 4, position: { x: 9, y: 9 }, z: 4 }) },
    };
    store.getState().markSaved(2, store.getState().localSeq);
    store.getState().rebase({ kind: "conflict", document: serializeDocument(theirs), revision: 3, updatedBy: "Ben" });
    expect(store.getState().undo()).toBe(false);
    expect(store.getState().doc.nodes.c?.position).toEqual({ x: 9, y: 9 });
    expect(store.getState().history.past).toHaveLength(0);
  });
});

describe("align and distribute", () => {
  it("lines up and spreads the selection as one operation each", () => {
    const store = storeWith(
      stateOf([
        node("a", { position: { x: 0, y: 0 } }),
        node("b", { number: 2, position: { x: 150, y: 37 } }),
        node("c", { number: 3, position: { x: 500, y: 90 } }),
      ]),
    );
    store.getState().setSelection(["a", "b", "c"], []);
    expect(store.getState().lineUpSelection("top")).toBe(true);
    expect(Object.values(store.getState().doc.nodes).map((entry) => entry.position.y)).toEqual([0, 0, 0]);
    expect(store.getState().distributeSelection("horizontal")).toBe(true);
    expect(store.getState().doc.nodes.b?.position.x).toBe(250);
    expect(store.getState().distributeSelection("horizontal")).toBe(false);
    store.getState().setSelection(["a"], []);
    expect(store.getState().lineUpSelection("left")).toBe(false);
    expect(store.getState().history.past).toHaveLength(2);
  });
});

describe("clipboard", () => {
  it("copies into the session clipboard and pastes a group with new ids at a point", () => {
    const store = storeWith();
    store.getState().setSelection(["g"], []);
    const payload = store.getState().copySelection();
    expect(store.getState().clipboard).toBe(payload);
    if (!payload) throw new Error("expected a copy");
    expect(store.getState().paste(payload, { x: 900, y: 500 })).toBe(true);
    const { doc, selectedNodeIds, selectedEdgeIds } = store.getState();
    expect(Object.keys(doc.nodes)).toHaveLength(7);
    expect(selectedNodeIds).toHaveLength(3);
    expect(selectedEdgeIds).toHaveLength(1);
    const [group = ""] = selectedNodeIds;
    expect(absoluteBox(doc, group)).toMatchObject({ x: 900, y: 500 });
    // One paste is one undo step.
    store.getState().undo();
    expect(Object.keys(store.getState().doc.nodes)).toHaveLength(4);
  });

  it("pastes into the group under the point, and not for viewers", () => {
    const store = storeWith();
    const payload = copyPayload(store.getState().doc, ["c"]);
    if (!payload) throw new Error("expected a copy");
    store.getState().paste(payload, { x: 150, y: 250 });
    const [pasted = ""] = store.getState().selectedNodeIds;
    expect(store.getState().doc.nodes[pasted]?.parentId).toBe("g");
    expect(storeWith(sampleState(), false).getState().paste(payload, { x: 0, y: 0 })).toBe(false);
    store.getState().setSelection([], []);
    expect(store.getState().copySelection()).toBeNull();
  });

  it("duplicates in place, offset by 50, into the same group", () => {
    const store = storeWith();
    store.getState().setSelection(["a", "b"], []);
    expect(store.getState().duplicateSelection()).toBe(true);
    const { doc, selectedNodeIds } = store.getState();
    expect(selectedNodeIds.map((id) => doc.nodes[id]?.parentId)).toEqual(["g", "g"]);
    expect(selectedNodeIds.map((id) => absoluteBox(doc, id))).toMatchObject([
      { x: 170, y: 190 },
      { x: 170, y: 270 },
    ]);
    expect(store.getState().doc.edges).toHaveProperty(store.getState().selectedEdgeIds[0] ?? "missing");
    store.getState().setSelection([], []);
    expect(store.getState().duplicateSelection()).toBe(false);
  });
});

describe("layout", () => {
  const chain = () =>
    stateOf(
      [
        node("p", { position: { x: 400, y: 0 } }),
        node("q", { number: 2, position: { x: 0, y: 300 } }),
        node("r", { number: 3, position: { x: 200, y: 50 } }),
      ],
      [edge("pq", "p", "q"), edge("qr", "q", "r")],
    );

  it("applies a layout and restores the manual arrangement, each as one undo step", () => {
    const store = storeWith(chain());
    const result = layoutCompound(layoutTreeOf(store.getState().doc), dagreLayout, {
      direction: "TB",
      nodeSep: 80,
      rankSep: 100,
    });
    expect(store.getState().applyLayout(result, "dagre", "TB")).toBe(true);
    const { doc } = store.getState();
    expect(doc.layout).toMatchObject({ engine: "dagre", direction: "TB" });
    expect((doc.nodes.q?.position.y ?? 0) > (doc.nodes.p?.position.y ?? 0)).toBe(true);
    expect(store.getState().restoreManualLayout()).toBe(true);
    expect(store.getState().doc.nodes).toEqual(chain().nodes);
    expect(store.getState().doc.layout).toBeNull();
    expect(store.getState().restoreManualLayout()).toBe(false);
    store.getState().undo();
    expect(store.getState().doc.layout).toMatchObject({ engine: "dagre" });
    store.getState().undo();
    expect(store.getState().doc.nodes).toEqual(chain().nodes);
  });

  it("tracks the busy flag without needless updates", () => {
    const store = storeWith();
    store.getState().setLayoutBusy(true);
    const before = store.getState();
    store.getState().setLayoutBusy(true);
    expect(store.getState()).toBe(before);
    store.getState().setLayoutBusy(false);
    expect(store.getState().layoutBusy).toBe(false);
  });
});

describe("snapping state", () => {
  const guide: Guide = {
    orientation: "vertical",
    value: 0,
    ownerId: "c",
    box: { x: 0, y: 0, width: 1, height: 1 },
    anchor: "left",
    color: null,
  };

  it("stores guides only when they change", () => {
    const store = storeWith();
    const before = store.getState();
    store.getState().setGuides(NO_GUIDES);
    expect(store.getState()).toBe(before);
    store.getState().setGuides({ horizontal: null, vertical: guide });
    expect(store.getState().guides.vertical).toBe(guide);
  });

  it("clears the reference step when it is removed, and reads stored settings on a reload", () => {
    const store = storeWith();
    store.getState().setSnapping({ referenceId: "c", nearest: 3 });
    store.getState().deleteElements(["c"], []);
    expect(store.getState().snapping.referenceId).toBeNull();
    store.getState().setSnapping({ referenceId: "a" });
    store.getState().undo();
    store.getState().deleteElements(["a"], []);
    store.getState().undo();
    expect(store.getState().snapping).toMatchObject({ nearest: 3 });
    expect(store.getState().viewSettings.snapping).toEqual({ enabled: true, nearest: 3 });
    store.getState().setSnapping({ referenceId: "b" });
    const viewSettings = { ...store.getState().viewSettings, snapping: { enabled: false, nearest: 5 } };
    store.getState().load({
      id: "d",
      title: "Plan",
      revision: 1,
      document: serializeDocument(sampleState()),
      canEdit: true,
      viewSettings,
    });
    expect(store.getState().snapping).toMatchObject({ enabled: false, nearest: 5, referenceId: null });
  });

  it("clears a removed reference on undo and on rebase too", () => {
    const store = storeWith();
    store.getState().addNode("step", { x: 0, y: 0 });
    const [added = ""] = store.getState().selectedNodeIds;
    store.getState().setSnapping({ referenceId: added });
    store.getState().undo();
    expect(store.getState().snapping.referenceId).toBeNull();
    store.getState().setSnapping({ referenceId: "c" });
    store
      .getState()
      .rebase({ kind: "conflict", document: serializeDocument(stateOf([node("a")])), revision: 2, updatedBy: null });
    expect(store.getState().snapping.referenceId).toBeNull();
  });
});

describe("search and library", () => {
  it("opens search and restarts a pulse for the same node", () => {
    const store = storeWith();
    store.getState().setSearchOpen(true);
    const before = store.getState();
    store.getState().setSearchOpen(true);
    expect(store.getState()).toBe(before);
    store.getState().pulseNode("c");
    store.getState().pulseNode("c");
    expect(store.getState().pulse).toEqual({ id: "c", seq: 2 });
  });

  it("adds a library item at a point, inside the group there, selected and editing", () => {
    const store = storeWith();
    const id = store.getState().addFromLibrary({ kind: "note", style: { fill: "#fff3b0" } }, { x: 150, y: 250 });
    const { doc, selectedNodeIds, editingNodeId } = store.getState();
    expect(doc.nodes[id ?? ""]).toMatchObject({
      kind: "note",
      parentId: "g",
      position: { x: 50, y: 150 },
      style: { fill: "#fff3b0" },
    });
    expect(selectedNodeIds).toEqual([id]);
    expect(editingNodeId).toBe(id);
    const line = store.getState().addFromLibrary({ kind: "line" }, { x: 900.4, y: 900.6 });
    expect(store.getState().doc.nodes[line ?? ""]?.position).toEqual({ x: 900, y: 901 });
    expect(store.getState().editingNodeId).toBeNull();
    const shape = store.getState().addFromLibrary({ kind: "shape", shape: "circle" }, { x: 2000, y: 0 });
    expect(store.getState().doc.nodes[shape ?? ""]?.data.shape).toBe("circle");
    expect(storeWith(sampleState(), false).getState().addFromLibrary({ kind: "step" }, { x: 0, y: 0 })).toBeNull();
  });
});

describe("view settings", () => {
  it("loads the stored settings, with defaults for missing parts", () => {
    const store = createEditorStore();
    store.getState().load({
      id: "d",
      title: "Plan",
      revision: 1,
      document: serializeDocument(sampleState()),
      canEdit: true,
      viewSettings: { animateOnOpen: true },
    });
    expect(store.getState().viewSettings.animateOnOpen).toBe(true);
    expect(store.getState().viewSettings.openingView.mode).toBe("fitWidth");
    expect(store.getState().viewSettingsSeq).toBe(0);
  });

  it("changes them locally for editors and counts each change for the saver", () => {
    const store = storeWith();
    store.getState().setViewSettings({ animateOnOpen: true });
    store.getState().setViewSettings({ openingView: { mode: "custom", customPercent: 90, savedViewport: null } });
    expect(store.getState().viewSettings).toMatchObject({
      animateOnOpen: true,
      openingView: { mode: "custom", customPercent: 90 },
    });
    expect(store.getState().viewSettingsSeq).toBe(2);
  });

  it("ignores changes from viewers", () => {
    const store = storeWith(sampleState(), false);
    store.getState().setViewSettings({ animateOnOpen: true });
    store.getState().setSnapping({ nearest: 4 });
    expect(store.getState().viewSettings.animateOnOpen).toBe(false);
    expect(store.getState().viewSettingsSeq).toBe(0);
  });

  it("writes snapping on/off and nearest K to the view settings, but not the reference step", () => {
    const store = storeWith();
    store.getState().setSnapping({ referenceId: "c" });
    expect(store.getState().viewSettingsSeq).toBe(0);
    store.getState().setSnapping({ enabled: false, nearest: 4 });
    expect(store.getState().viewSettings.snapping).toEqual({ enabled: false, nearest: 4 });
    expect(store.getState().viewSettingsSeq).toBe(1);
  });

  it("keeps the save status, storing only changes", () => {
    const store = storeWith();
    store.getState().setViewSettingsStatus("saving");
    const before = store.getState();
    store.getState().setViewSettingsStatus("saving");
    expect(store.getState()).toBe(before);
    store.getState().setViewSettingsStatus("saved");
    expect(store.getState().viewSettingsStatus).toBe("saved");
  });
});
