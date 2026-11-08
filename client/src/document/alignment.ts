import {
  distribute,
  lineUp,
  type DistributeAxis,
  type LineUpCommand,
  type PlacedBox,
  type Placements,
} from "../geometry/align";
import { absoluteBox, isAncestor } from "./groups";
import { absolutePosition, type Operation } from "./operations";
import type { DocumentState } from "./types";

// The selection toolbar's align, justify and distribute commands as one
// operation. The maths runs on absolute boxes, so steps in different groups
// line up on screen; each new position is converted back into its own
// parent's space by subtracting the parent's absolute position. A node whose
// group is also selected moves with the group and is left out, so it is not
// moved twice.

/** The selected nodes that act on their own (no selected ancestor), with their absolute boxes. */
export function arrangeable(state: DocumentState, ids: readonly string[]): PlacedBox[] {
  const selected = ids.filter((id) => id in state.nodes);
  return selected
    .filter((id) => !selected.some((other) => other !== id && isAncestor(state, other, id)))
    .map((id) => ({ id, box: absoluteBox(state, id) }))
    .filter((item): item is PlacedBox => item.box !== null);
}

function moveTo(state: DocumentState, placements: Placements): Operation | null {
  const ops: Operation[] = [];
  for (const [id, target] of Object.entries(placements)) {
    const node = state.nodes[id];
    if (!node) continue;
    const origin = node.parentId === null ? { x: 0, y: 0 } : absolutePosition(state, node.parentId);
    const position = { x: target.x - origin.x, y: target.y - origin.y };
    if (position.x !== node.position.x || position.y !== node.position.y)
      ops.push({ type: "node.update", id, fields: { position } });
  }
  if (ops.length === 0) return null;
  return { type: "batch", ops };
}

/** Lines up two or more nodes; null when fewer are selected or nothing would move. */
export function lineUpOperation(
  state: DocumentState,
  ids: readonly string[],
  command: LineUpCommand,
): Operation | null {
  const items = arrangeable(state, ids);
  return items.length < 2 ? null : moveTo(state, lineUp(items, command));
}

/** Spaces three or more nodes evenly; null when fewer are selected or nothing would move. */
export function distributeOperation(
  state: DocumentState,
  ids: readonly string[],
  axis: DistributeAxis,
): Operation | null {
  return moveTo(state, distribute(arrangeable(state, ids), axis));
}
