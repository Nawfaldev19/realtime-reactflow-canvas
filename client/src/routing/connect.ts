import { containsPoint, type Box, type Vec } from "../geometry/vector";

// Hit tests for finishing a connection gesture. While a connection is being
// dragged, the central 70% of every other step is a drop zone (inset 15%
// from each edge), so a connection does not have to land on a tiny port.

export const DROP_ZONE_INSET = 0.15;

export interface NodeHit {
  readonly id: string;
  /** Absolute box in canvas coordinates. */
  readonly box: Box;
  /** Stacking rank; higher is in front. */
  readonly rank: number;
  readonly connectable: boolean;
}

/** The central 70% of a box. */
export function dropZone(box: Box): Box {
  return {
    x: box.x + box.width * DROP_ZONE_INSET,
    y: box.y + box.height * DROP_ZONE_INSET,
    width: box.width * (1 - 2 * DROP_ZONE_INSET),
    height: box.height * (1 - 2 * DROP_ZONE_INSET),
  };
}

/** The front-most node whose box contains the point. */
export function nodeAtPoint(nodes: readonly NodeHit[], point: Vec): NodeHit | null {
  let best: NodeHit | null = null;
  for (const node of nodes) if (containsPoint(node.box, point) && (!best || node.rank > best.rank)) best = node;
  return best;
}

/**
 * The node to connect to when a connection is released at `point`: the
 * front-most node under the pointer, if the pointer is inside its drop zone,
 * it can take connections and it is not one of the excluded sources.
 */
export function dropTargetAt(nodes: readonly NodeHit[], point: Vec, exclude: ReadonlySet<string>): string | null {
  const hit = nodeAtPoint(nodes, point);
  if (!hit?.connectable || exclude.has(hit.id) || !containsPoint(dropZone(hit.box), point)) return null;
  return hit.id;
}
