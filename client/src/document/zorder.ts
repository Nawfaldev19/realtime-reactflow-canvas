import { intersects } from "../geometry/vector";
import { absoluteBox, depthOf } from "./groups";
import type { Operation } from "./operations";
import type { DiagramNode, DocumentState } from "./types";

// Stacking order as an ordered stack of integers (z), not a few fixed levels.
// Groups and other nodes are separate bands: groups always draw below edges
// and every other node draws above them, so commands only reorder a node
// among the peers of its own band. Ties are broken by number, then id, the
// same order the canvas renders in.

export const ARRANGE_COMMANDS = ["front", "forward", "backward", "back"] as const;
export type ArrangeCommand = (typeof ARRANGE_COMMANDS)[number];

const isGroup = (node: DiagramNode) => node.kind === "group";

/** Stack order: lower first. */
export function compareStack(a: DiagramNode, b: DiagramNode): number {
  return a.z - b.z || a.number - b.number || a.id.localeCompare(b.id);
}

/**
 * Reorders the given nodes and returns one operation, or null when nothing
 * changes. Front = band maximum + 1 and back = band minimum − 1, applied in
 * stack order so the selection keeps its own relative order. Forward and
 * backward swap with the nearest overlapping peer above or below. Orders
 * that fall below 1 or tie with a swap partner are renumbered to a dense
 * 1..n range in the same operation.
 */
export function arrange(state: DocumentState, ids: readonly string[], command: ArrangeCommand): Operation | null {
  const z = new Map(Object.values(state.nodes).map((node) => [node.id, node.z]));
  /** The working order of a node (every node is in the map). */
  const zOf = (node: DiagramNode): number => z.get(node.id) ?? node.z;
  const current = (node: DiagramNode): DiagramNode => ({ ...node, z: zOf(node) });
  const targets = ids.map((id) => state.nodes[id]).filter((node) => node !== undefined);
  if (targets.length === 0) return null;

  const peersOf = (node: DiagramNode) =>
    Object.values(state.nodes)
      .filter((other) => isGroup(other) === isGroup(node))
      .map(current);
  const ordered = [...targets].map(current).sort(compareStack);

  const others = (node: DiagramNode) => peersOf(node).filter((peer) => peer.id !== node.id);

  switch (command) {
    case "front":
      for (const node of ordered) {
        const top = Math.max(...others(node).map((peer) => peer.z));
        if (zOf(node) <= top) z.set(node.id, top + 1);
      }
      break;
    case "back":
      for (const node of ordered.reverse()) {
        const bottom = Math.min(...others(node).map((peer) => peer.z));
        if (zOf(node) >= bottom) z.set(node.id, bottom - 1);
      }
      break;
    case "forward":
    case "backward": {
      const up = command === "forward";
      if (up) ordered.reverse();
      for (const target of ordered) {
        const node = current(target);
        const box = absoluteBox(state, node.id);
        const neighbour = peersOf(node)
          .filter((peer) => peer.id !== node.id && (up ? compareStack(peer, node) > 0 : compareStack(peer, node) < 0))
          .filter((peer) => {
            const other = absoluteBox(state, peer.id);
            return box !== null && other !== null && intersects(box, other);
          })
          .sort((a, b) => (up ? compareStack(a, b) : compareStack(b, a)))[0];
        if (!neighbour) continue;
        if (neighbour.z === node.z) renumber(state, z);
        const mine = zOf(node);
        z.set(node.id, zOf(neighbour));
        z.set(neighbour.id, mine);
      }
      break;
    }
  }

  if (Math.min(...z.values()) < 1) renumber(state, z);
  const ops: Operation[] = Object.values(state.nodes)
    .filter((node) => zOf(node) !== node.z)
    .map((node) => ({ type: "node.update", id: node.id, fields: { z: zOf(node) } }));
  if (ops.length === 0) return null;
  return ops.length === 1 && ops[0] ? ops[0] : { type: "batch", ops };
}

/** Rewrites the working orders to a dense 1..n range, keeping the stack order. */
function renumber(state: DocumentState, z: Map<string, number>): void {
  Object.values(state.nodes)
    .map((node) => ({ ...node, z: z.get(node.id) ?? node.z }))
    .sort(compareStack)
    .forEach((node, index) => z.set(node.id, index + 1));
}

/** Groups draw at negative z-indices (below edges at 0), ordered by nesting depth, then stack. */
export function groupLayers(state: DocumentState): Map<string, number> {
  const groups = Object.values(state.nodes)
    .filter(isGroup)
    .map((node) => ({ node, depth: depthOf(state, node.id) }))
    .sort((a, b) => a.depth - b.depth || compareStack(a.node, b.node));
  return new Map(groups.map(({ node }, index) => [node.id, index - groups.length]));
}
