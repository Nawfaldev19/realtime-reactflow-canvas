import type { EdgeFields, NodeFields, Operation } from "../../document/operations";
import type { ClipboardPayload } from "../../document/clipboard";
import type { LibraryPayload } from "../../document/library";
import type { SketchStyle } from "../../document/factory";
import type { History } from "../../document/history";
import type { LoadReport } from "../../document/serialize";
import type {
  DiagramEdge,
  DiagramNode,
  DocumentState,
  EdgeKind,
  LayoutDirection,
  LayoutEngineName,
  NodeKind,
  Point,
  Route,
  RoutePoint,
  RouteStyle,
  Side,
  Size,
} from "../../document/types";
import type { ArrangeCommand } from "../../document/zorder";
import type { CommittedStroke } from "../../geometry/freehand";
import type { DistributeAxis, LineUpCommand } from "../../geometry/align";
import type { ActiveGuides } from "../../geometry/guides";
import type { CompoundResult } from "../../layout/compound";
import type { ShapeKind } from "../../geometry/shapes";
import type { ConflictOutcome, SaveSnapshot, SaveStatus } from "../../persistence/autosave";
import type { SnapSettings } from "../snapping";
import type { ViewSettings } from "../../viewport/settings";
import type { OpMessage } from "../../collab/protocol";
import type { PendingOperation } from "../../collab/reconcile";
import type { SyncStatus } from "../../collab/syncMachine";

// The shape of the editor store: its state and every action. The actions are
// implemented in the slices next to this file and composed in ../store.ts.

export type { PendingOperation };

/** A message about live collaboration shown above the canvas. */
export interface CollabNotice {
  readonly kind: "off" | "on" | "refused";
  readonly message: string;
}

export interface MergeNotice {
  readonly updatedBy: string | null;
  /** Local changes that could not be replayed because their targets were removed elsewhere. */
  readonly dropped: number;
}

export interface LoadedDiagram {
  readonly id: string;
  readonly title: string;
  readonly revision: number;
  readonly document: unknown;
  readonly canEdit: boolean;
  /** The stored view settings; missing parts fall back to the defaults. */
  readonly viewSettings?: unknown;
  /** The diagram's live-collaboration switch; off when absent. */
  readonly collaborationEnabled?: boolean;
}

export type ViewSettingsStatus = "idle" | "saving" | "saved" | "failed";

/** Fields shown on the canvas during a gesture, before they are committed. */
export type LiveFields = Partial<Pick<DiagramNode, "position" | "size" | "data">>;

/** A box change reported by the canvas while a resize handle is dragged. */
export interface ResizeChange {
  readonly position?: Point;
  readonly size?: Size;
}

/** Page defaults for new connectors. */
export interface ConnectorDefaults {
  readonly kind: EdgeKind;
  readonly style: RouteStyle;
}

/** A connection being dragged from a port. */
export interface ConnectionSession {
  /** The dragged step first, then the rest of a multi-selection. */
  readonly sources: readonly string[];
  /** The port side the drag started from (every source uses the same side). */
  readonly side: Side | null;
  /** Space is held: pointer moves are recorded as route points. */
  readonly sketching: boolean;
  readonly sketch: readonly Point[];
}

/** A connection released on empty canvas: a ghost step waits for a shape choice. */
export interface PendingDrop {
  /** Centre of the ghost step, in canvas coordinates. */
  readonly position: Point;
  /** Where to open the shape menu, relative to the canvas element. */
  readonly screen: Point;
  readonly sources: readonly string[];
  readonly side: Side | null;
  readonly sketch: readonly Point[];
}

/** Routes cleared by a style switch, kept so the switch can be undone from the notice. */
export interface RouteNotice {
  readonly previous: Readonly<Record<string, Route>>;
}

export interface LabelEditing {
  readonly edgeId: string;
  /** "quick": the editor with presets above the label; "inline": a text field in place. */
  readonly mode: "quick" | "inline";
}

export type EdgeEnd = "source" | "target";

export interface EditorState {
  readonly diagramId: string | null;
  readonly title: string;
  readonly canEdit: boolean;
  readonly doc: DocumentState;
  /** The server revision `doc` was last synchronized with; while collaborating, the last applied sequence number. */
  readonly revision: number;
  /** Local operations not yet included in a saved revision (or, collaborating, not yet acknowledged), oldest first. */
  readonly pending: readonly PendingOperation[];
  /** Collaborating: the server's document at `revision`, without the pending operations. */
  readonly confirmed: DocumentState;
  /** This tab's collaboration session id, as the server minted it in its last sync reply; empty until then. */
  readonly sessionId: string;
  /** Edits go to the collaboration room (true) or are autosaved (false). */
  readonly collaborating: boolean;
  /** The diagram's live-collaboration switch, as last announced. */
  readonly collaborationEnabled: boolean;
  readonly syncStatus: SyncStatus;
  readonly collabNotice: CollabNotice | null;
  /** Sequence number of the latest local operation. */
  readonly localSeq: number;
  /** This person's undo and redo stacks (personal: never saved or sent). */
  readonly history: History;
  readonly loadReport: LoadReport | null;
  readonly selectedNodeIds: readonly string[];
  readonly selectedEdgeIds: readonly string[];
  readonly dragPositions: Readonly<Record<string, Point>>;
  readonly live: Readonly<Record<string, LiveFields>>;
  readonly measured: Readonly<Record<string, Size>>;
  readonly editingNodeId: string | null;
  /** The text typed so far in the open editor; null until the first keystroke. */
  readonly editDraft: string | null;
  /** Alt is held: children may be dragged out of their group. */
  readonly detachMode: boolean;
  readonly drawMode: boolean;
  readonly drawStyle: SketchStyle;
  /** Sketches drawn since draw mode was switched on, oldest first (for "remove last stroke"). */
  readonly drawnStrokes: readonly string[];
  readonly saveStatus: SaveStatus;
  readonly mergeNotice: MergeNotice | null;
  readonly connectorDefaults: ConnectorDefaults;
  readonly connection: ConnectionSession | null;
  readonly pendingDrop: PendingDrop | null;
  readonly routeNotice: RouteNotice | null;
  readonly labelEditing: LabelEditing | null;
  /** Snapping: on/off and nearest K are stored in the view settings; the reference step is personal. */
  readonly snapping: SnapSettings;
  /** How the diagram opens and looks; saved next to the document, not inside it. */
  readonly viewSettings: ViewSettings;
  /** Increments with every local change of the view settings (the view-settings saver watches it). */
  readonly viewSettingsSeq: number;
  readonly viewSettingsStatus: ViewSettingsStatus;
  /** The guides shown while a step is dragged or resized. */
  readonly guides: ActiveGuides;
  /** The last copy made in this tab (used when the system clipboard is not available). */
  readonly clipboard: ClipboardPayload | null;
  readonly searchOpen: boolean;
  /** A node to highlight for a moment (a search result); `seq` restarts the highlight for the same node. */
  readonly pulse: { readonly id: string; readonly seq: number } | null;
  /** A slow automatic layout is still running. */
  readonly layoutBusy: boolean;
  /** The highest version number someone announced saving while this editor is open; 0 until then. */
  readonly announcedVersion: number;
  /** Mount every node and connector, also off-screen ones (export captures the DOM). */
  readonly renderAll: boolean;
}

export interface EditorActions {
  load: (diagram: LoadedDiagram) => void;
  /** Applies a local operation and records it for undo. Returns false when it changed nothing. */
  apply: (op: Operation) => boolean;
  /** Reverts this person's latest change (or re-applies the latest undone one), leaving other people's edits alone. */
  undo: () => boolean;
  redo: () => boolean;
  setSelection: (nodeIds: readonly string[], edgeIds: readonly string[]) => void;
  setDragPositions: (positions: Readonly<Record<string, Point>>) => void;
  /** Turns the current drag into one operation, including joining or leaving groups. */
  commitDrag: () => void;
  setMeasured: (sizes: Readonly<Record<string, Size>>) => void;
  /** Shows (or, with null, clears) live fields for nodes. */
  setLive: (entries: Readonly<Record<string, LiveFields | null>>) => void;
  /** Applies `fields` to a node as one operation and drops its live fields. */
  commitLive: (id: string, fields: NodeFields) => void;
  /** A resize frame: the dragged node's box, plus any children kept in place. Other selected nodes scale with it. */
  resizeLive: (changes: Readonly<Record<string, ResizeChange>>) => void;
  /** Ends the resize as one operation. */
  commitResize: () => void;
  addNode: (kind: NodeKind, position: Point, options?: { shape?: ShapeKind }) => string | null;
  connect: (source: string, target: string, sourceSide?: Side | null, targetSide?: Side | null) => boolean;
  deleteSelection: () => void;
  deleteElements: (nodeIds: readonly string[], edgeIds: readonly string[]) => void;
  /** Applies per-node fields to several nodes as one operation. */
  updateNodes: (ids: readonly string[], fieldsFor: (node: DiagramNode) => NodeFields | null) => boolean;
  startEditing: (id: string) => boolean;
  setEditDraft: (text: string) => void;
  /** Ends text editing, saving the draft and any grown height in one operation. */
  finishEditing: () => void;
  setDetachMode: (on: boolean) => void;
  arrangeSelection: (command: ArrangeCommand) => boolean;
  groupSelection: () => boolean;
  ungroupSelection: () => boolean;
  setDrawMode: (on: boolean) => void;
  setDrawStyle: (style: Partial<SketchStyle>) => void;
  addSketch: (stroke: CommittedStroke) => string | null;
  removeLastStroke: () => void;
  setTitle: (title: string) => void;
  // Collaboration (driven by collab/client.ts).
  /** Switches between sending operations to the room and autosaving. */
  setCollaborating: (collaborating: boolean) => void;
  setCollaborationEnabled: (enabled: boolean) => void;
  setSyncStatus: (status: SyncStatus) => void;
  setCollabNotice: (notice: CollabNotice | null) => void;
  /** Records the session id the server assigned to this tab (its own operations are recognised by it). */
  setSessionId: (sessionId: string) => void;
  /** Applies ordered server operations; returns the local sequence numbers they acknowledged. */
  receiveOps: (messages: readonly OpMessage[]) => readonly number[];
  /** Replaces the confirmed copy after a resync snapshot, replaying pending operations on it. */
  receiveSnapshot: (document: unknown, revision: number) => void;
  /** Forgets one pending operation (refused, or already stored), showing the document without it. */
  dropPending: (seq: number) => void;
  // Autosave target.
  snapshot: () => SaveSnapshot;
  markSaved: (revision: number, changeId: number) => void;
  rebase: (conflict: ConflictOutcome) => void;
  setSaveStatus: (status: SaveStatus) => void;
  dismissMergeNotice: () => void;
  // Connectors.
  setConnectorDefaults: (defaults: Partial<ConnectorDefaults>) => void;
  /** Starts drawing a connection from `source`; a multi-selection containing it connects from every selected step. */
  startConnection: (source: string, side: Side | null) => void;
  setSketching: (on: boolean) => void;
  /** Records a sketch point when the pointer has moved far enough from the last one (`origin` is the source port). */
  recordSketch: (pointer: Point, origin: Point) => void;
  endConnection: () => void;
  /** Connects every source to `target` as one operation and selects the new connectors. The sketch shapes the first one. */
  connectMany: (
    sources: readonly string[],
    target: string,
    sourceSide: Side | null,
    targetSide: Side | null,
    sketch?: readonly Point[],
  ) => string[];
  /** Turns the current connection into a ghost step at `position`, waiting for a shape choice. */
  openDrop: (position: Point, screen: Point) => void;
  cancelDrop: () => void;
  /** Replaces the ghost with a real step, connected from every source, as one operation. */
  completeDrop: (kind: NodeKind, options?: { shape?: ShapeKind }) => string | null;
  /** Stores a connector's route points as one operation. */
  commitRoute: (edgeId: string, points: readonly RoutePoint[]) => boolean;
  /** Applies per-edge fields to several connectors as one operation. */
  updateEdges: (ids: readonly string[], fieldsFor: (edge: DiagramEdge) => EdgeFields | null) => boolean;
  /** Switches route styles, clearing route points; the notice can undo it. */
  setRouteStyle: (ids: readonly string[], style: RouteStyle) => boolean;
  undoRouteStyle: () => void;
  dismissRouteNotice: () => void;
  /** Moves one end of a connector to another step, keeping its id, label and style. */
  reconnect: (edgeId: string, end: EdgeEnd, nodeId: string, side: Side | null) => boolean;
  startLabelEdit: (edgeId: string, mode: LabelEditing["mode"]) => void;
  stopLabelEdit: () => void;
  // Editor tools.
  setGuides: (guides: ActiveGuides) => void;
  /** Turns visible-only rendering off (true) or back on while something reads the DOM. */
  setRenderAll: (on: boolean) => void;
  /** Changes snapping; on/off and nearest K are also written to the view settings (editors only). */
  setSnapping: (settings: Partial<SnapSettings>) => void;
  /** Changes the view settings locally (editors only); the saver stores them. */
  setViewSettings: (patch: Partial<ViewSettings>) => void;
  setViewSettingsStatus: (status: ViewSettingsStatus) => void;
  /** Justifies (left, centre, right) or aligns (top, middle, bottom) the selection in absolute coordinates. */
  lineUpSelection: (command: LineUpCommand) => boolean;
  distributeSelection: (axis: DistributeAxis) => boolean;
  /** Copies the selection (with group contents and internal connectors); also kept in `clipboard`. */
  copySelection: () => ClipboardPayload | null;
  /** Pastes with the copy's top-left at `origin`; the top-level nodes go into the group under that point. Selects the result. */
  paste: (payload: ClipboardPayload, origin: Point) => boolean;
  duplicateSelection: () => boolean;
  /** Applies a finished automatic layout as one operation (the first one also stores the manual arrangement). */
  applyLayout: (result: CompoundResult, engine: LayoutEngineName, direction: LayoutDirection) => boolean;
  /** Restores the manual arrangement and leaves automatic layout. */
  restoreManualLayout: () => boolean;
  setLayoutBusy: (busy: boolean) => void;
  /**
   * Makes the diagram show `target` (a version's document) with one
   * operation: one undo step, saved and sent like any edit. False when it
   * already does or editing is not allowed.
   */
  restoreVersion: (target: DocumentState) => boolean;
  noteVersionSaved: (number: number) => void;
  setSearchOpen: (open: boolean) => void;
  pulseNode: (id: string) => void;
  /** Adds a library item with its top-left corner at `position` (inside the group there, if any), selected and ready for typing. */
  addFromLibrary: (item: LibraryPayload, position: Point) => string | null;
}

export type EditorStore = EditorState & EditorActions;

export interface EditorStoreOptions {
  /** No-op guards on the per-frame setters; off only for measurement (the `no-guards` flag). */
  readonly guards?: boolean;
}
