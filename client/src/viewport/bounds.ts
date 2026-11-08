import { absoluteBox } from "../document/groups";
import type { DocumentState } from "../document/types";
import { boundsOf, type Box } from "../geometry/vector";

/**
 * The box around every node in absolute canvas coordinates (children of groups
 * converted from relative positions), from the stored positions and sizes.
 * Null for an empty diagram. It never reads the DOM, so it is the same whether
 * the nodes are visible, hidden for the reveal animation, or not rendered.
 */
export function diagramBounds(doc: DocumentState): Box | null {
  const boxes: Box[] = [];
  for (const id of Object.keys(doc.nodes)) {
    const box = absoluteBox(doc, id);
    if (box) boxes.push(box);
  }
  return boundsOf(boxes);
}
