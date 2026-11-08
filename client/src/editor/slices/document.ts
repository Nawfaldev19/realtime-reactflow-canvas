import { absolutePosition, applyOperation, deleteNodes, type Operation } from "../../document/operations";
import { distributeOperation, lineUpOperation } from "../../document/alignment";
import { copyPayload, duplicateTarget, pasteOperation } from "../../document/clipboard";
import { createNode } from "../../document/factory";
import { dropTarget, groupNodes, ungroupNodes } from "../../document/groups";
import { diffStates, recordEntry, step, type Direction } from "../../document/history";
import { KIND_TRAITS } from "../../document/nodeKinds";
import { parseDocument } from "../../document/serialize";
import { arrange } from "../../document/zorder";
import { layoutOperation, restoreManualOperation } from "../../layout/documentLayout";
import { parseViewSettings } from "../../viewport/settings";
import { restoreOperation } from "../../versions/restore";
import { INITIAL, single, type SliceContext } from "./shared";
import type { EditorActions } from "./types";

// The shared document: loading, applying local operations (each one recorded
// for undo and queued as pending), this person's undo and redo, and the
// commands that turn into one document operation (add, delete, group,
// arrange, align, paste, layout, restore a version).

export type DocumentSlice = Pick<
  EditorActions,
  | "load"
  | "apply"
  | "undo"
  | "redo"
  | "addNode"
  | "deleteElements"
  | "deleteSelection"
  | "updateNodes"
  | "arrangeSelection"
  | "groupSelection"
  | "ungroupSelection"
  | "setTitle"
  | "lineUpSelection"
  | "distributeSelection"
  | "copySelection"
  | "paste"
  | "duplicateSelection"
  | "applyLayout"
  | "restoreManualLayout"
  | "setLayoutBusy"
  | "restoreVersion"
  | "noteVersionSaved"
  | "addFromLibrary"
>;

export function documentSlice({
  set,
  get,
  gesture,
  prepare,
  validReference,
  tidyAfter,
  applyAndSelect,
}: SliceContext): DocumentSlice {
  /** Applies the next undo or redo step as a local operation (saved and sent like any edit) without recording it again. */
  const travel = (direction: Direction): boolean => {
    const { doc, canEdit, history, localSeq, pending, editingNodeId } = get();
    if (!canEdit || editingNodeId !== null) return false;
    const { history: next, op: raw } = step(history, doc, direction);
    if (!raw) {
      set({ history: next });
      return false;
    }
    const op = prepare(raw);
    const { state } = applyOperation(doc, op);
    const seq = localSeq + 1;
    const { selectedNodeIds, selectedEdgeIds } = get();
    set({
      doc: state,
      history: next,
      localSeq: seq,
      pending: [...pending, { seq, op }],
      selectedNodeIds: selectedNodeIds.filter((id) => id in state.nodes),
      selectedEdgeIds: selectedEdgeIds.filter((id) => id in state.edges),
      routeNotice: null,
      ...validReference(state),
    });
    return true;
  };

  return {
    load: (diagram) => {
      const { state, report } = parseDocument(diagram.document);
      const viewSettings = parseViewSettings(diagram.viewSettings);
      gesture.resize = null;
      set({
        ...INITIAL,
        connectorDefaults: get().connectorDefaults,
        snapping: { ...get().snapping, ...viewSettings.snapping, referenceId: null },
        viewSettings,
        diagramId: diagram.id,
        title: diagram.title,
        canEdit: diagram.canEdit,
        doc: state,
        confirmed: state,
        // A reload keeps the session and its counter, so client operation ids are never reused.
        sessionId: get().sessionId,
        localSeq: get().localSeq,
        collaborating: diagram.collaborationEnabled === true,
        collaborationEnabled: diagram.collaborationEnabled === true,
        syncStatus: diagram.collaborationEnabled === true ? "connecting" : "stopped",
        revision: diagram.revision,
        loadReport: report,
      });
    },

    apply: (raw) => {
      const { doc, canEdit, localSeq, pending, history } = get();
      if (!canEdit) return false;
      const op = prepare(raw);
      const { state } = applyOperation(doc, op);
      if (state === doc) return false;
      const seq = localSeq + 1;
      const entry = diffStates(doc, state);
      set({
        doc: state,
        localSeq: seq,
        pending: [...pending, { seq, op }],
        history: entry ? recordEntry(history, entry) : history,
        ...validReference(state),
      });
      return true;
    },

    undo: () => travel("undo"),
    redo: () => travel("redo"),

    addNode: (kind, position, options = {}) => {
      const { doc, apply } = get();
      const node = createNode(doc, kind, position, options);
      if (!apply({ type: "node.add", node })) return null;
      set({ selectedNodeIds: [node.id], selectedEdgeIds: [] });
      return node.id;
    },

    deleteElements: (nodeIds, edgeIds) => {
      const { doc, apply, editingNodeId } = get();
      const nodes = nodeIds.filter((id) => id !== editingNodeId);
      const edgeOps: Operation[] = edgeIds.map((id) => ({ type: "edge.remove", id }));
      apply({ type: "batch", ops: [...edgeOps, ...deleteNodes(doc, nodes).ops] });
      const { doc: after, selectedNodeIds, selectedEdgeIds, drawnStrokes, labelEditing } = get();
      set({
        selectedNodeIds: selectedNodeIds.filter((id) => id in after.nodes),
        selectedEdgeIds: selectedEdgeIds.filter((id) => id in after.edges),
        drawnStrokes: drawnStrokes.filter((id) => id in after.nodes),
        labelEditing: labelEditing && labelEditing.edgeId in after.edges ? labelEditing : null,
      });
    },

    deleteSelection: () => {
      const { selectedNodeIds, selectedEdgeIds, deleteElements } = get();
      deleteElements(selectedNodeIds, selectedEdgeIds);
    },

    updateNodes: (ids, fieldsFor) => {
      const { doc, apply } = get();
      const ops: Operation[] = [];
      for (const id of ids) {
        const node = doc.nodes[id];
        const fields = node ? fieldsFor(node) : null;
        if (fields) ops.push({ type: "node.update", id, fields });
      }
      const op = single(ops);
      return op ? apply(op) : false;
    },

    arrangeSelection: (command) => {
      const { doc, selectedNodeIds, apply } = get();
      const op = arrange(doc, selectedNodeIds, command);
      return op ? apply(op) : false;
    },

    groupSelection: () => {
      const { doc, selectedNodeIds, apply } = get();
      const result = groupNodes(doc, selectedNodeIds);
      if (!result || !apply(result.op)) return false;
      set({ selectedNodeIds: [], selectedEdgeIds: [] });
      return true;
    },

    ungroupSelection: () => {
      const { doc, selectedNodeIds, apply } = get();
      let state = doc;
      const ops: Operation[] = [];
      const released: string[] = [];
      for (const id of selectedNodeIds) {
        const op = ungroupNodes(state, id);
        if (!op) continue;
        released.push(
          ...Object.values(state.nodes)
            .filter((node) => node.parentId === id)
            .map((node) => node.id),
        );
        ops.push(op);
        state = applyOperation(state, op).state;
      }
      const op = single(ops);
      if (!op || !apply(op)) return false;
      set({ selectedNodeIds: released.filter((id) => id in get().doc.nodes), selectedEdgeIds: [] });
      return true;
    },

    setTitle: (title) => {
      set({ title });
    },

    lineUpSelection: (command) => {
      const { doc, selectedNodeIds, apply } = get();
      const op = lineUpOperation(doc, selectedNodeIds, command);
      return op ? apply(op) : false;
    },

    distributeSelection: (axis) => {
      const { doc, selectedNodeIds, apply } = get();
      const op = distributeOperation(doc, selectedNodeIds, axis);
      return op ? apply(op) : false;
    },

    copySelection: () => {
      const { doc, selectedNodeIds } = get();
      const payload = copyPayload(doc, selectedNodeIds);
      if (payload) set({ clipboard: payload });
      return payload;
    },

    paste: (payload, origin) => {
      const { doc, canEdit } = get();
      if (!canEdit) return false;
      const { op, nodeIds, edgeIds } = pasteOperation(doc, payload, origin, { parentId: dropTarget(doc, "", origin) });
      return applyAndSelect(op, nodeIds, edgeIds);
    },

    duplicateSelection: () => {
      const { doc, selectedNodeIds, canEdit } = get();
      const payload = copyPayload(doc, selectedNodeIds);
      const target = duplicateTarget(doc, selectedNodeIds);
      if (!canEdit || !payload || !target) return false;
      const { op, nodeIds, edgeIds } = pasteOperation(doc, payload, target.origin, { parentId: target.parentId });
      return applyAndSelect(op, nodeIds, edgeIds);
    },

    applyLayout: (result, engine, direction) => {
      const { doc, apply } = get();
      return apply(layoutOperation(doc, result, engine, direction));
    },

    restoreManualLayout: () => {
      const { doc, apply } = get();
      const op = restoreManualOperation(doc);
      return op ? apply(op) : false;
    },

    setLayoutBusy: (layoutBusy) => {
      if (get().layoutBusy !== layoutBusy) set({ layoutBusy });
    },

    restoreVersion: (target) => {
      if (!get().canEdit) return false;
      get().finishEditing();
      const op = restoreOperation(get().doc, target);
      if (!op || !get().apply(op)) return false;
      set({ ...tidyAfter(get().doc), routeNotice: null, connection: null, pendingDrop: null });
      return true;
    },

    noteVersionSaved: (number) => {
      if (number > get().announcedVersion) set({ announcedVersion: number });
    },

    addFromLibrary: (item, position) => {
      if (!get().canEdit) return null;
      if (get().editingNodeId !== null) get().finishEditing();
      const { doc, apply, startEditing } = get();
      const parentId = dropTarget(doc, "", position);
      const origin = parentId === null ? { x: 0, y: 0 } : absolutePosition(doc, parentId);
      const at = { x: Math.round(position.x - origin.x), y: Math.round(position.y - origin.y) };
      const base = createNode(doc, item.kind, at, { parentId, ...(item.shape ? { shape: item.shape } : {}) });
      const node = item.style ? { ...base, style: { ...base.style, ...item.style } } : base;
      if (!apply({ type: "node.add", node })) return null;
      set({ selectedNodeIds: [node.id], selectedEdgeIds: [], drawMode: false });
      if (KIND_TRAITS[node.kind].hasText) startEditing(node.id);
      return node.id;
    },
  };
}
