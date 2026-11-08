import type { StoreApi } from "zustand/vanilla";
import type { Operation } from "../../document/operations";
import { EMPTY_HISTORY } from "../../document/history";
import { KIND_TRAITS } from "../../document/nodeKinds";
import { EMPTY_STATE, type DiagramNode, type DocumentState, type Point, type Size } from "../../document/types";
import { NO_GUIDES } from "../../geometry/guides";
import type { Box } from "../../geometry/vector";
import { normalizeOperation } from "../../collab/protocol";
import type { Replica } from "../../collab/reconcile";
import { mergeRecord, samePoint, sameSize } from "../../perf/guards";
import { DEFAULT_VIEW_SETTINGS } from "../../viewport/settings";
import { DEFAULT_SNAP } from "../snapping";
import type { EditorState, EditorStore } from "./types";

// What the slices share: the initial state, small record helpers, and the
// context every slice is built with (the store's set and get, plus the steps
// several slices take: preparing an operation for the wire, tidying personal
// state after a remote change, storing a reconciled replica).

export const INITIAL: EditorState = {
  diagramId: null,
  title: "",
  canEdit: false,
  doc: EMPTY_STATE,
  revision: 0,
  pending: [],
  confirmed: EMPTY_STATE,
  sessionId: "",
  collaborating: false,
  collaborationEnabled: false,
  syncStatus: "stopped",
  collabNotice: null,
  localSeq: 0,
  history: EMPTY_HISTORY,
  loadReport: null,
  selectedNodeIds: [],
  selectedEdgeIds: [],
  dragPositions: {},
  live: {},
  measured: {},
  editingNodeId: null,
  editDraft: null,
  detachMode: false,
  drawMode: false,
  drawStyle: { color: null, strokeSize: 7 },
  drawnStrokes: [],
  saveStatus: { kind: "idle" },
  mergeNotice: null,
  connectorDefaults: { kind: "connector", style: "step" },
  connection: null,
  pendingDrop: null,
  routeNotice: null,
  labelEditing: null,
  snapping: DEFAULT_SNAP,
  viewSettings: DEFAULT_VIEW_SETTINGS,
  viewSettingsSeq: 0,
  viewSettingsStatus: "idle",
  guides: NO_GUIDES,
  clipboard: null,
  searchOpen: false,
  pulse: null,
  layoutBusy: false,
  announcedVersion: 0,
  renderAll: false,
};

export const EMPTY_POSITIONS: Readonly<Record<string, Point>> = {};

export function sameIds(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

export const single = (ops: readonly Operation[]): Operation | null =>
  ops.length === 0 ? null : ops.length === 1 && ops[0] ? ops[0] : { type: "batch", ops };

export const boxOf = (node: DiagramNode): Box => ({ ...node.position, ...node.size });

export function withoutKeys<T>(record: Readonly<Record<string, T>>, keys: Iterable<string>): Record<string, T> {
  const drop = new Set(keys);
  return Object.fromEntries(Object.entries(record).filter(([key]) => !drop.has(key)));
}

export const isConnectable = (doc: DocumentState, id: string): boolean => {
  const node = doc.nodes[id];
  return node !== undefined && KIND_TRAITS[node.kind].connectable;
};

export function limitsOf(doc: DocumentState, id: string) {
  const { width, height } = KIND_TRAITS[doc.nodes[id]?.kind ?? "step"].minSize;
  return { minWidth: width, minHeight: height };
}

const replaceRecord = <T>(
  current: Readonly<Record<string, T>>,
  patch: Readonly<Record<string, T>>,
): Readonly<Record<string, T>> => ({ ...current, ...patch });

type Merge<T> = (
  current: Readonly<Record<string, T>>,
  patch: Readonly<Record<string, T>>,
) => Readonly<Record<string, T>>;

interface ResizeSession {
  /** Committed boxes of every node taking part, at the start of the resize. */
  readonly start: Readonly<Record<string, Box>>;
  readonly touched: Set<string>;
}

export interface SliceContext {
  readonly set: StoreApi<EditorStore>["setState"];
  readonly get: StoreApi<EditorStore>["getState"];
  /** Drag frames that change nothing keep the same record, so no subscriber re-renders. */
  readonly mergePositions: Merge<Point>;
  /** The same for measurement frames. */
  readonly mergeSizes: Merge<Size>;
  /** The resize in progress (cleared by a load). */
  readonly gesture: { resize: ResizeSession | null };
  /** While collaborating, the operation exactly as the server and peers will see it. */
  readonly prepare: (op: Operation) => Operation;
  /** Snapping to a reference step stops when that step is removed. */
  readonly validReference: (state: DocumentState) => Partial<EditorState>;
  /** Personal and ephemeral state that refers to things a remote change removed. */
  readonly tidyAfter: (state: DocumentState) => Partial<EditorState>;
  /** Applies an operation that creates nodes and connectors, then selects them. */
  readonly applyAndSelect: (op: Operation, nodeIds: readonly string[], edgeIds: readonly string[]) => boolean;
  /** Stores a reconciled replica; the visible document is only replaced when it changed. */
  readonly storeReplica: (replica: Replica, extra?: Partial<EditorState>) => void;
  readonly replicaOf: () => Replica;
}

export function sliceContext(
  set: SliceContext["set"],
  get: SliceContext["get"],
  { guards }: { guards: boolean },
): SliceContext {
  const validReference = (state: DocumentState): Partial<EditorState> => {
    const { snapping } = get();
    return snapping.referenceId !== null && !(snapping.referenceId in state.nodes)
      ? { snapping: { ...snapping, referenceId: null } }
      : {};
  };

  const tidyAfter = (state: DocumentState): Partial<EditorState> => {
    const { selectedNodeIds, selectedEdgeIds, dragPositions, live, editingNodeId, labelEditing, drawnStrokes } = get();
    const editingGone = editingNodeId !== null && !(editingNodeId in state.nodes);
    return {
      selectedNodeIds: selectedNodeIds.filter((id) => id in state.nodes),
      selectedEdgeIds: selectedEdgeIds.filter((id) => id in state.edges),
      dragPositions: Object.fromEntries(Object.entries(dragPositions).filter(([id]) => id in state.nodes)),
      live: Object.fromEntries(Object.entries(live).filter(([id]) => id in state.nodes)),
      drawnStrokes: drawnStrokes.filter((id) => id in state.nodes),
      labelEditing: labelEditing && labelEditing.edgeId in state.edges ? labelEditing : null,
      ...(editingGone ? { editingNodeId: null, editDraft: null } : {}),
      ...validReference(state),
    };
  };

  return {
    set,
    get,
    mergePositions: guards ? (current, patch) => mergeRecord(current, patch, samePoint) : replaceRecord<Point>,
    mergeSizes: guards ? (current, patch) => mergeRecord(current, patch, sameSize) : replaceRecord<Size>,
    gesture: { resize: null },
    prepare: (op) => (get().collaborating ? normalizeOperation(op) : op),
    validReference,
    tidyAfter,
    applyAndSelect: (op, nodeIds, edgeIds) => {
      if (!get().apply(op)) return false;
      const { doc } = get();
      set({
        selectedNodeIds: nodeIds.filter((id) => id in doc.nodes),
        selectedEdgeIds: edgeIds.filter((id) => id in doc.edges),
      });
      return true;
    },
    storeReplica: (replica, extra = {}) => {
      const changed = replica.visible !== get().doc;
      set({
        confirmed: replica.confirmed,
        pending: replica.pending,
        ...extra,
        ...(changed ? { doc: replica.visible, ...tidyAfter(replica.visible) } : {}),
      });
    },
    replicaOf: () => {
      const { confirmed, doc, pending } = get();
      return { confirmed, visible: doc, pending };
    },
  };
}
