import { boundsOf, boxCentre, containsPoint, type Box, type Vec } from "../geometry/vector";
import { createNode, randomId, type IdFactory } from "./factory";
import {
  absolutePosition,
  applyOperation,
  deleteNodes,
  type BatchOperation,
  type NodeFields,
  type Operation,
} from "./operations";
import type { DocumentState } from "./types";

// Group nodes and the coordinate spaces they create. A child's position is
// relative to its parent group; absolute (canvas) positions are derived by
// adding parent offsets. Every function here returns operations, so grouping,
// ungrouping and re-parenting are saved, replayed and undone like any edit.

/** Space between a new group's frame and the nodes inside it. */
export const GROUP_PADDING = 25;

export function absoluteBox(state: DocumentState, id: string): Box | null {
  const node = state.nodes[id];
  if (!node) return null;
  return { ...absolutePosition(state, id), ...node.size };
}

/** True when `ancestorId` is a parent, grandparent… of `id` (a node is not its own ancestor). */
export function isAncestor(state: DocumentState, ancestorId: string, id: string): boolean {
  const seen = new Set<string>();
  for (
    let current = state.nodes[id]?.parentId ?? null;
    current !== null && !seen.has(current);
    current = state.nodes[current]?.parentId ?? null
  ) {
    if (current === ancestorId) return true;
    seen.add(current);
  }
  return false;
}

/** Nesting depth: 0 at the top level. */
const parentSets = new WeakMap<DocumentState, ReadonlySet<string>>();

/** The ids of every node that has at least one child, computed once per document object. */
export function parentsOf(state: DocumentState): ReadonlySet<string> {
  let parents = parentSets.get(state);
  if (!parents) {
    const found = new Set<string>();
    for (const node of Object.values(state.nodes)) if (node.parentId !== null) found.add(node.parentId);
    parents = found;
    parentSets.set(state, parents);
  }
  return parents;
}

export function depthOf(state: DocumentState, id: string): number {
  let depth = 0;
  const seen = new Set<string>();
  for (
    let current = state.nodes[id]?.parentId ?? null;
    current !== null && !seen.has(current);
    current = state.nodes[current]?.parentId ?? null
  ) {
    seen.add(current);
    depth += 1;
  }
  return depth;
}

/** Fields that move a node under `parentId` (or to the top level) without moving it on screen. */
export function reparentFields(state: DocumentState, id: string, parentId: string | null): NodeFields {
  const absolute = absolutePosition(state, id);
  const origin: Vec = parentId === null ? { x: 0, y: 0 } : absolutePosition(state, parentId);
  return { parentId, position: { x: absolute.x - origin.x, y: absolute.y - origin.y } };
}

export type GroupCheck =
  | { readonly ok: true; readonly parentId: string | null }
  | { readonly ok: false; readonly reason: string };

/** Grouping needs two or more nodes that share one parent (the top level or the same group). */
export function canGroup(state: DocumentState, ids: readonly string[]): GroupCheck {
  const nodes = ids.map((id) => state.nodes[id]).filter((node) => node !== undefined);
  if (nodes.length < 2) return { ok: false, reason: "Select two or more nodes to group them." };
  const parents = new Set(nodes.map((node) => node.parentId));
  const [parentId] = parents;
  if (parents.size > 1 || parentId === undefined)
    return { ok: false, reason: "These nodes are in different groups. Move them into the same group first." };
  return { ok: true, parentId };
}

export interface GroupResult {
  readonly op: BatchOperation;
  readonly groupId: string;
}

/**
 * Wraps the nodes in a new group around their combined bounds plus padding,
 * inside their common parent. Children keep their on-screen positions:
 * child position = absolute position − group's absolute position.
 */
export function groupNodes(
  state: DocumentState,
  ids: readonly string[],
  { newId = randomId }: { newId?: IdFactory } = {},
): GroupResult | null {
  const check = canGroup(state, ids);
  if (!check.ok) return null;
  const members = ids.filter((id) => id in state.nodes);
  const bounds = boundsOf(members.map((id) => absoluteBox(state, id)).filter((box) => box !== null));
  if (!bounds) return null;
  const origin: Vec = check.parentId === null ? { x: 0, y: 0 } : absolutePosition(state, check.parentId);
  const groupAbsolute = { x: bounds.x - GROUP_PADDING, y: bounds.y - GROUP_PADDING };
  const group = {
    ...createNode(
      state,
      "group",
      { x: groupAbsolute.x - origin.x, y: groupAbsolute.y - origin.y },
      { newId, parentId: check.parentId },
    ),
    size: { width: bounds.width + GROUP_PADDING * 2, height: bounds.height + GROUP_PADDING * 2 },
  };
  const moves: Operation[] = members.map((id) => {
    const absolute = absolutePosition(state, id);
    return {
      type: "node.update",
      id,
      fields: { parentId: group.id, position: { x: absolute.x - groupAbsolute.x, y: absolute.y - groupAbsolute.y } },
    };
  });
  return { op: { type: "batch", ops: [{ type: "node.add", node: group }, ...moves] }, groupId: group.id };
}

/**
 * Releases a group's children into the group's own parent at the same
 * on-screen positions (child position + group position), then removes the
 * group and the edges attached to it.
 */
export function ungroupNodes(state: DocumentState, groupId: string): BatchOperation | null {
  const group = state.nodes[groupId];
  if (group?.kind !== "group") return null;
  const releases: Operation[] = Object.values(state.nodes)
    .filter((node) => node.parentId === groupId)
    .map((child) => ({
      type: "node.update",
      id: child.id,
      fields: {
        parentId: group.parentId,
        position: { x: child.position.x + group.position.x, y: child.position.y + group.position.y },
      },
    }));
  const released = applyOperation(state, { type: "batch", ops: releases }).state;
  return { type: "batch", ops: [...releases, ...deleteNodes(released, [groupId]).ops] };
}

/**
 * The group a node would drop into at `point`: the deepest group containing
 * the point (the top-most on a tie), never the node itself or one of its
 * descendants.
 */
export function dropTarget(state: DocumentState, id: string, point: Vec): string | null {
  let best: { id: string; depth: number; z: number } | null = null;
  for (const candidate of Object.values(state.nodes)) {
    if (candidate.kind !== "group" || candidate.id === id || isAncestor(state, id, candidate.id)) continue;
    const box = absoluteBox(state, candidate.id);
    if (!box || !containsPoint(box, point)) continue;
    const depth = depthOf(state, candidate.id);
    if (!best || depth > best.depth || (depth === best.depth && candidate.z > best.z))
      best = { id: candidate.id, depth, z: candidate.z };
  }
  return best?.id ?? null;
}

/**
 * Re-parenting after a drag. A node whose centre was released inside a group
 * joins it (the deepest one). Leaving the current parent (for the top level
 * or another group) only happens when `allowLeave` is set (the Alt key).
 * Nodes dragged along with an ancestor keep their parent.
 */
export function dropReparent(
  state: DocumentState,
  movedIds: readonly string[],
  { allowLeave }: { allowLeave: boolean },
): Operation[] {
  const moved = new Set(movedIds);
  const ops: Operation[] = [];
  for (const id of movedIds) {
    const node = state.nodes[id];
    if (!node || [...moved].some((other) => isAncestor(state, other, id))) continue;
    const box = absoluteBox(state, id);
    if (!box) continue;
    const target = dropTarget(state, id, boxCentre(box));
    if (target === node.parentId) continue;
    const staysInside = node.parentId === null || (target !== null && isAncestor(state, node.parentId, target));
    if (!staysInside && !allowLeave) continue;
    ops.push({ type: "node.update", id, fields: reparentFields(state, id, target) });
  }
  return ops;
}
