import type { DiagramNode, DocumentState, Point } from "../document/types";

// Coordinate transforms for presence. Cursors are sent in canvas (diagram)
// coordinates, so a peer's pointer sits over the same spot of the diagram on
// every screen whatever each viewer's pan and zoom:
//
//   flow   = (screen − pane origin − pan) / zoom
//   screen = flow × zoom + pan + pane origin
//
// Cursors, name tags and badges are drawn inside the canvas's own
// transformed layer, so pan and zoom are applied once, by the canvas. Each
// overlay gets exactly one transform: translate to its canvas point, then
// scale by 1 / zoom around that point (transform origin at the top-left), so
// it keeps the same size on screen at every zoom level.

export interface Viewport {
  readonly x: number;
  readonly y: number;
  readonly zoom: number;
}

export function screenToFlow(screen: Point, pane: Point, viewport: Viewport): Point {
  return { x: (screen.x - pane.x - viewport.x) / viewport.zoom, y: (screen.y - pane.y - viewport.y) / viewport.zoom };
}

const css = (value: number) => String(Math.round(value * 1000) / 1000);

/** The single transform of an overlay anchored at a canvas point, counter-scaled to stay the same size on screen. */
export function overlayTransform(point: Point, zoom: number): string {
  return `translate(${css(point.x)}px, ${css(point.y)}px) scale(${css(1 / zoom)})`;
}

/**
 * The absolute canvas position of a node's top-left corner: its own position
 * plus every ancestor group's, recursively. `overrides` replaces a node's
 * stored (relative) position, for nodes being dragged right now. Null when the
 * node does not exist.
 */
export function absoluteCorner(
  doc: DocumentState,
  id: string,
  overrides: Readonly<Record<string, Point>> = {},
): Point | null {
  if (!doc.nodes[id]) return null;
  let x = 0;
  let y = 0;
  const seen = new Set<string>();
  for (
    let node: DiagramNode | undefined = doc.nodes[id];
    node && !seen.has(node.id);
    node = node.parentId === null ? undefined : doc.nodes[node.parentId]
  ) {
    seen.add(node.id);
    const position = overrides[node.id] ?? node.position;
    x += position.x;
    y += position.y;
  }
  return { x, y };
}

/** Rounds a canvas point for sending (a tenth of a unit is far below a pixel at any zoom). */
export function roundPoint(point: Point): Point {
  return { x: Math.round(point.x * 10) / 10, y: Math.round(point.y * 10) / 10 };
}
