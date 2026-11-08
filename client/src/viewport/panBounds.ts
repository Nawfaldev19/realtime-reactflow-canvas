import type { Box } from "../geometry/vector";
import type { CanvasSize, Viewport } from "./viewport";

// Pan bounds: how far the view can move away from the diagram. The extent is
// the diagram's absolute bounds grown by a margin on every side, in flow
// units, in the canvas library's translate-extent form [[minX, minY], [maxX, maxY]].

export type Extent = readonly [readonly [number, number], readonly [number, number]];

/** Flow units of empty canvas allowed beyond the diagram on every side. */
export const PAN_PADDING = 800;

/** The diagram bounds plus exactly `padding` on each side; null (unbounded) for an empty diagram. */
export function panExtent(bounds: Box | null, padding = PAN_PADDING): Extent | null {
  if (!bounds) return null;
  return [
    [bounds.x - padding, bounds.y - padding],
    [bounds.x + bounds.width + padding, bounds.y + bounds.height + padding],
  ];
}

function constrainAxis(translate: number, zoom: number, length: number, min: number, max: number): number {
  // Visible edges relative to the extent, in flow units (d0 < 0: the view starts before the extent).
  const d0 = -translate / zoom - min;
  const d1 = (length - translate) / zoom - max;
  // A view wider than the extent centres it; otherwise the nearer edge is pulled back inside.
  const shift = d1 > d0 ? (d0 + d1) / 2 : Math.min(0, d0) || Math.max(0, d1);
  return translate + zoom * shift;
}

/**
 * Moves a viewport back inside the extent the way the canvas library does
 * (d3-zoom's default constraint, ISC): panning past an edge is impossible,
 * and an extent smaller than the canvas is centred.
 */
export function constrainViewport(viewport: Viewport, extent: Extent | null, size: CanvasSize): Viewport {
  if (!extent) return viewport;
  const [[minX, minY], [maxX, maxY]] = extent;
  return {
    x: constrainAxis(viewport.x, viewport.zoom, size.width, minX, maxX),
    y: constrainAxis(viewport.y, viewport.zoom, size.height, minY, maxY),
    zoom: viewport.zoom,
  };
}
