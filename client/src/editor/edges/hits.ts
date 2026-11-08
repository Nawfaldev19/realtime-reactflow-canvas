import type { InternalNode } from "@xyflow/react";
import { KIND_TRAITS } from "../../document/nodeKinds";
import { SIDES, type Side } from "../../document/types";
import { distance, type Vec } from "../../geometry/vector";
import { portPoint } from "../../routing/anchors";
import { dropTargetAt, nodeAtPoint, type NodeHit } from "../../routing/connect";
import { portOffsetsOf } from "../../routing/nodeGeometry";
import { GHOST_NODE_ID, type CanvasNode } from "../flowAdapter";

// Hit testing against the canvas library's live nodes, for finishing a
// connection or a reconnect: which step is under the pointer, whether the
// pointer is in its drop zone, and whether it is close to one of its ports.

/** Ports within this many screen pixels catch a connection. */
export const PORT_RADIUS = 30;

export function nodeHits(lookup: ReadonlyMap<string, InternalNode<CanvasNode>>): NodeHit[] {
  const hits: NodeHit[] = [];
  for (const internal of lookup.values()) {
    if (internal.id === GHOST_NODE_ID) continue;
    const width = internal.measured.width ?? internal.width ?? 0;
    const height = internal.measured.height ?? internal.height ?? 0;
    const { x, y } = internal.internals.positionAbsolute;
    hits.push({
      id: internal.id,
      box: { x, y, width, height },
      rank: internal.internals.z,
      connectable: KIND_TRAITS[internal.data.node.kind].connectable,
    });
  }
  return hits;
}

/** The side of the port of `id` nearest to `point`, if it is within `radius` canvas units. */
export function nearPort(
  lookup: ReadonlyMap<string, InternalNode<CanvasNode>>,
  id: string,
  point: Vec,
  radius: number,
): Side | null {
  const internal = lookup.get(id);
  if (!internal) return null;
  const width = internal.measured.width ?? internal.width ?? 0;
  const height = internal.measured.height ?? internal.height ?? 0;
  const box = { ...internal.internals.positionAbsolute, width, height };
  const offsets = portOffsetsOf(internal.data.node, { width, height });
  let best: Side | null = null;
  let bestDistance = Infinity;
  for (const side of SIDES) {
    const d = distance(portPoint(box, side, offsets), point);
    if (d <= radius && d < bestDistance) {
      best = side;
      bestDistance = d;
    }
  }
  return best;
}

export interface EndTarget {
  readonly nodeId: string;
  /** An explicit port when the pointer is near one, otherwise automatic. */
  readonly side: Side | null;
}

/**
 * Where a dragged connector end lands: anywhere in a step's drop zone (with
 * automatic sides), or otherwise on a port within PORT_RADIUS screen pixels.
 */
export function endTargetAt(
  lookup: ReadonlyMap<string, InternalNode<CanvasNode>>,
  point: Vec,
  zoom: number,
  exclude: ReadonlySet<string>,
): EndTarget | null {
  const hits = nodeHits(lookup);
  const zoned = dropTargetAt(hits, point, exclude);
  if (zoned) return { nodeId: zoned, side: null };
  const radius = PORT_RADIUS / (zoom > 0 ? zoom : 1);
  for (const hit of hits) {
    if (!hit.connectable || exclude.has(hit.id)) continue;
    const side = nearPort(lookup, hit.id, point, radius);
    if (side) return { nodeId: hit.id, side };
  }
  return null;
}

/** True when nothing is under the pointer (a drop on empty canvas). */
export const isEmptyCanvas = (lookup: ReadonlyMap<string, InternalNode<CanvasNode>>, point: Vec): boolean =>
  nodeAtPoint(nodeHits(lookup), point) === null;
