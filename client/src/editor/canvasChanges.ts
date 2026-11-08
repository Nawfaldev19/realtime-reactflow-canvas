import type { EdgeChange, NodeChange } from "@xyflow/react";
import { boxStyle } from "../document/nodeData";
import { KIND_TRAITS } from "../document/nodeKinds";
import { SIDES, type Point, type Side, type Size } from "../document/types";
import { NO_GUIDES } from "../geometry/guides";
import { perfFlags } from "../perf/flags";
import { dropTargetAt, nodeAtPoint, type NodeHit } from "../routing/connect";
import type { CanvasEdge, CanvasNode } from "./flowAdapter";
import type { SnapView, Snapper } from "./snapping";
import type { EditorStoreApi, ResizeChange } from "./store";

// Translates the canvas library's change events into store actions. Drag
// frames only update ephemeral positions; the release commits one operation.
// A resize arrives as a batch with a "dimensions" change that carries a
// `resizing` flag (plus position changes for the resized node and for any
// children it keeps in place); it becomes live fields and, when the flag
// turns false, one operation. Measured sizes are personal and never saved.
// A finished connection gesture is decided by connectionOutcome().
//
// With a snapper, drag and resize frames are rewritten first so the moving
// box lands on alignment guides; the guides go to the store for the overlay
// and are cleared when the gesture ends.
//
// The `no-batch` debug flag (measurement only) writes every drag frame
// to the document as its own operation instead, the render storm that the
// ephemeral drag positions avoid. Dropping into groups is skipped then.

export interface SnapContext {
  readonly snapper: Snapper;
  /** The viewport and canvas size of the current frame. */
  readonly view: () => SnapView;
}

function resizeBatch(changes: readonly NodeChange<CanvasNode>[]): Record<string, ResizeChange> | null {
  if (!changes.some((change) => change.type === "dimensions" && change.resizing !== undefined)) return null;
  const boxes: Record<string, { position?: Point; size?: Size }> = {};
  for (const change of changes) {
    if (change.type === "position" && change.position)
      boxes[change.id] = { ...boxes[change.id], position: change.position };
    if (change.type === "dimensions" && change.dimensions)
      boxes[change.id] = { ...boxes[change.id], size: change.dimensions };
  }
  return boxes;
}

/** Snaps the resized node's box; children kept in place by a group resize get the opposite shift. */
function snapResizeBatch(
  boxes: Record<string, ResizeChange>,
  api: EditorStoreApi,
  snap: SnapContext,
): Record<string, ResizeChange> {
  const state = api.getState();
  const primary = Object.keys(boxes).find((id) => boxes[id]?.size !== undefined);
  const node = primary === undefined ? undefined : state.doc.nodes[primary];
  const change = primary === undefined ? undefined : boxes[primary];
  if (primary === undefined || !node || !change?.size || boxStyle(node).keepAspectRatio) return boxes;
  const position = change.position ?? state.live[primary]?.position ?? node.position;
  const snapped = snap.snapper.resize(
    state.doc,
    primary,
    { position, size: change.size },
    snap.view(),
    state.snapping,
    KIND_TRAITS[node.kind].minSize,
  );
  state.setGuides(snapped.guides);
  const dx = snapped.position.x - position.x;
  const dy = snapped.position.y - position.y;
  const result: Record<string, ResizeChange> = {};
  for (const [id, box] of Object.entries(boxes)) {
    if (id === primary) result[id] = { position: snapped.position, size: snapped.size };
    else result[id] = box.position ? { ...box, position: { x: box.position.x - dx, y: box.position.y - dy } } : box;
  }
  return result;
}

export interface ChangeOptions {
  /** Drag frames stay ephemeral until release (true) or each becomes an operation (the `no-batch` flag). */
  readonly batch?: boolean;
}

function moveNow(api: EditorStoreApi, moved: Readonly<Record<string, Point>>): void {
  api.getState().apply({
    type: "batch",
    ops: Object.entries(moved).map(([id, position]) => ({ type: "node.update", id, fields: { position } })),
  });
}

export function handleNodeChanges(
  changes: readonly NodeChange<CanvasNode>[],
  api: EditorStoreApi,
  snap?: SnapContext,
  { batch = perfFlags.batch }: ChangeOptions = {},
): void {
  const state = api.getState();
  const resize = resizeBatch(changes);
  if (resize) {
    const ended = changes.some((change) => change.type === "dimensions" && change.resizing === false);
    state.resizeLive(snap && state.canEdit ? snapResizeBatch(resize, api, snap) : resize);
    if (ended) {
      snap?.snapper.end();
      state.setGuides(NO_GUIDES);
      state.commitResize();
    }
    return;
  }

  const moved: Record<string, Point> = {};
  const sizes: Record<string, Size> = {};
  const removed: string[] = [];
  let selection: Set<string> | null = null;
  let released = false;

  for (const change of changes) {
    switch (change.type) {
      case "position":
        if (change.position) moved[change.id] = change.position;
        if (change.dragging !== true) released = true;
        break;
      case "dimensions":
        if (change.dimensions) sizes[change.id] = change.dimensions;
        break;
      case "select":
        selection ??= new Set(state.selectedNodeIds);
        if (change.selected) selection.add(change.id);
        else selection.delete(change.id);
        break;
      case "remove":
        removed.push(change.id);
        break;
      default:
        break;
    }
  }

  if (Object.keys(sizes).length > 0) state.setMeasured(sizes);
  if (Object.keys(moved).length > 0 && state.canEdit) {
    // Only pointer drags snap (keyboard nudges must be able to move off a guide); the release frame of a snapped drag does too.
    const dragging = changes.some((change) => change.type === "position" && change.dragging === true);
    if (!batch && dragging) {
      moveNow(api, moved);
    } else if (snap && (dragging || snap.snapper.active)) {
      const snapped = snap.snapper.move(state.doc, moved, snap.view(), state.snapping);
      state.setGuides(released ? NO_GUIDES : snapped.guides);
      state.setDragPositions(snapped.positions);
    } else {
      state.setDragPositions(moved);
    }
  }
  if (released) {
    snap?.snapper.end();
    if (snap) state.setGuides(NO_GUIDES);
    state.commitDrag();
  }
  if (selection) state.setSelection([...selection], state.selectedEdgeIds);
  if (removed.length > 0) state.deleteElements(removed, []);
}

export function handleEdgeChanges(changes: readonly EdgeChange<CanvasEdge>[], api: EditorStoreApi): void {
  const state = api.getState();
  const removed: string[] = [];
  let selection: Set<string> | null = null;

  for (const change of changes) {
    if (change.type === "select") {
      selection ??= new Set(state.selectedEdgeIds);
      if (change.selected) selection.add(change.id);
      else selection.delete(change.id);
    } else if (change.type === "remove") {
      removed.push(change.id);
    }
  }

  if (selection) state.setSelection(state.selectedNodeIds, [...selection]);
  if (removed.length > 0) state.deleteElements([], removed);
}

export const sideOf = (handle: string | null | undefined): Side | null =>
  SIDES.includes(handle as Side) ? (handle as Side) : null;

export type ConnectionOutcome =
  | { readonly kind: "connect"; readonly target: string; readonly targetSide: Side | null }
  | { readonly kind: "drop" }
  | { readonly kind: "none" };

export interface ConnectionEnd {
  /** The canvas library's validity flag: the pointer is over (or near) a valid handle. */
  readonly isValid: boolean | null;
  readonly toNode: string | null;
  readonly toHandle: string | null;
  /** The release point in canvas coordinates. */
  readonly point: Point;
  readonly hits: readonly NodeHit[];
  /** The step the drag started from. */
  readonly from: string;
}

/**
 * What a released connection does: inside a step's drop zone (its central
 * 70%) it connects with automatic sides; elsewhere near a port the library
 * found valid, it connects to that port; over empty canvas it opens the
 * drop-to-create menu. Releasing anywhere else on a step does nothing.
 */
export function connectionOutcome({ isValid, toNode, toHandle, point, hits, from }: ConnectionEnd): ConnectionOutcome {
  const zoned = dropTargetAt(hits, point, new Set([from]));
  if (zoned) return { kind: "connect", target: zoned, targetSide: null };
  if (isValid === true && toNode !== null && toNode !== from)
    return { kind: "connect", target: toNode, targetSide: sideOf(toHandle) };
  return nodeAtPoint(hits, point) ? { kind: "none" } : { kind: "drop" };
}
