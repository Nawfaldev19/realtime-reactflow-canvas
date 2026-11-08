import { applyOperation, type NodeFields, type Operation } from "../../document/operations";
import { createSketchNode } from "../../document/factory";
import { dropReparent } from "../../document/groups";
import { lineResizeFields } from "../../document/lines";
import { nodeText } from "../../document/nodeData";
import { KIND_TRAITS } from "../../document/nodeKinds";
import { MAX_NODE_SIZE, scaleSelection } from "../../geometry/sizing";
import type { Box } from "../../geometry/vector";
import { boxOf, EMPTY_POSITIONS, limitsOf, single, withoutKeys, type SliceContext } from "./shared";
import type { EditorActions, LiveFields } from "./types";

// Ephemeral gesture state: positions while dragging, live fields while
// resizing, rotating or growing a node, measured sizes, text editing and
// freehand drawing. These change on every pointer frame; each gesture becomes
// one operation when it ends.

export type GestureSlice = Pick<
  EditorActions,
  | "setDragPositions"
  | "commitDrag"
  | "setMeasured"
  | "setLive"
  | "commitLive"
  | "resizeLive"
  | "commitResize"
  | "startEditing"
  | "setEditDraft"
  | "finishEditing"
  | "setDetachMode"
  | "setDrawMode"
  | "setDrawStyle"
  | "addSketch"
  | "removeLastStroke"
>;

export function gestureSlice({ set, get, gesture, mergePositions, mergeSizes }: SliceContext): GestureSlice {
  return {
    setDragPositions: (positions) => {
      const current = get().dragPositions;
      const next = mergePositions(current, positions);
      if (next !== current) set({ dragPositions: next });
    },

    commitDrag: () => {
      const { dragPositions, apply, doc, detachMode } = get();
      const moves: Operation[] = Object.entries(dragPositions).map(([id, position]) => ({
        type: "node.update",
        id,
        fields: { position },
      }));
      set({ dragPositions: EMPTY_POSITIONS });
      if (moves.length === 0) return;
      const moved = applyOperation(doc, { type: "batch", ops: moves }).state;
      const reparents = dropReparent(moved, Object.keys(dragPositions), { allowLeave: detachMode });
      const op = single([...moves, ...reparents]);
      if (op) apply(op);
    },

    setMeasured: (sizes) => {
      const current = get().measured;
      const next = mergeSizes(current, sizes);
      if (next !== current) set({ measured: next });
    },

    setLive: (entries) => {
      const cleared = Object.keys(entries).filter((id) => !entries[id]);
      const added = Object.entries(entries).filter((entry): entry is [string, LiveFields] => entry[1] !== null);
      set({ live: { ...withoutKeys(get().live, cleared), ...Object.fromEntries(added) } });
    },

    commitLive: (id, fields) => {
      set({ live: withoutKeys(get().live, [id]) });
      get().apply({ type: "node.update", id, fields });
    },

    resizeLive: (changes) => {
      const { doc, selectedNodeIds, live, canEdit } = get();
      if (!canEdit) return;
      const primary = Object.keys(changes).find((id) => changes[id]?.size !== undefined);
      if (!gesture.resize) {
        const ids = new Set(Object.keys(changes));
        if (primary !== undefined && selectedNodeIds.includes(primary)) for (const id of selectedNodeIds) ids.add(id);
        const start: Record<string, Box> = {};
        for (const id of ids) {
          const node = doc.nodes[id];
          if (node) start[id] = boxOf(node);
        }
        gesture.resize = { start, touched: new Set() };
      }
      const session = gesture.resize;
      const next: Record<string, LiveFields> = {};
      for (const [id, change] of Object.entries(changes)) {
        const node = doc.nodes[id];
        if (!node) continue;
        next[id] = {
          ...live[id],
          ...(change.position ? { position: change.position } : {}),
          ...(change.size ? { size: change.size } : {}),
        };
      }
      const origin = primary === undefined ? undefined : session.start[primary];
      const primaryLive = primary === undefined ? undefined : next[primary];
      if (primary !== undefined && origin && primaryLive?.size) {
        const position = primaryLive.position ?? origin;
        const box = { x: position.x, y: position.y, ...primaryLive.size };
        const followers = withoutKeys(session.start, Object.keys(changes));
        const scaled = scaleSelection({ ...followers, [primary]: origin }, primary, box, (id) => limitsOf(doc, id));
        for (const id of Object.keys(followers)) {
          const target = scaled[id];
          if (target) {
            next[id] = { position: { x: target.x, y: target.y }, size: { width: target.width, height: target.height } };
          }
        }
      }
      for (const id of Object.keys(next)) session.touched.add(id);
      set({ live: { ...live, ...next } });
    },

    commitResize: () => {
      const session = gesture.resize;
      gesture.resize = null;
      if (!session) return;
      const { doc, live, apply } = get();
      const ops: Operation[] = [];
      for (const id of session.touched) {
        const node = doc.nodes[id];
        const fields = live[id];
        if (!node || !fields) continue;
        const box: Box = { ...(fields.position ?? node.position), ...(fields.size ?? node.size) };
        const update: NodeFields =
          node.kind === "line" && fields.size
            ? lineResizeFields(node, box)
            : { position: { x: box.x, y: box.y }, size: { width: box.width, height: box.height } };
        ops.push({ type: "node.update", id, fields: update });
      }
      set({ live: withoutKeys(live, session.touched) });
      const op = single(ops);
      if (op) apply(op);
    },

    startEditing: (id) => {
      const { doc, canEdit, editingNodeId, finishEditing } = get();
      const node = doc.nodes[id];
      if (!canEdit || !node || !KIND_TRAITS[node.kind].hasText) return false;
      if (editingNodeId === id) return true;
      if (editingNodeId !== null) finishEditing();
      set({ editingNodeId: id, editDraft: null, selectedNodeIds: [id], selectedEdgeIds: [] });
      return true;
    },

    setEditDraft: (editDraft) => {
      if (get().editingNodeId !== null) set({ editDraft });
    },

    finishEditing: () => {
      const { editingNodeId: id, editDraft: text, doc, live, apply } = get();
      if (id === null) return;
      const node = doc.nodes[id];
      const grown = live[id]?.size;
      set({ editingNodeId: null, editDraft: null, live: withoutKeys(live, [id]) });
      if (!node) return;
      const fields: NodeFields = {
        ...(text !== null && text !== nodeText(node) ? { data: { text } } : {}),
        ...(grown ? { size: grown } : {}),
      };
      if (Object.keys(fields).length > 0) apply({ type: "node.update", id, fields });
    },

    setDetachMode: (detachMode) => {
      if (get().detachMode !== detachMode) set({ detachMode });
    },

    setDrawMode: (drawMode) => {
      const { editingNodeId, finishEditing } = get();
      if (drawMode && editingNodeId !== null) finishEditing();
      set({ drawMode, drawnStrokes: [], ...(drawMode ? { selectedNodeIds: [], selectedEdgeIds: [] } : {}) });
    },

    setDrawStyle: (style) => {
      set({ drawStyle: { ...get().drawStyle, ...style } });
    },

    addSketch: (stroke) => {
      const { doc, apply, drawStyle, drawnStrokes } = get();
      if (stroke.box.width > MAX_NODE_SIZE || stroke.box.height > MAX_NODE_SIZE) return null;
      const node = createSketchNode(doc, stroke, drawStyle);
      if (!apply({ type: "node.add", node })) return null;
      set({ drawnStrokes: [...drawnStrokes, node.id] });
      return node.id;
    },

    removeLastStroke: () => {
      const { drawnStrokes, deleteElements } = get();
      const last = drawnStrokes.at(-1);
      if (last === undefined) return;
      set({ drawnStrokes: drawnStrokes.slice(0, -1) });
      deleteElements([last], []);
    },
  };
}
