import type { RouteStyle } from "../document/types";
import { distance, type Vec } from "../geometry/vector";

// Sketching a route while connecting (hold Space): a point is recorded each
// time the pointer has moved far enough from the last recorded point. For
// the orthogonal style each new point keeps the x or the y of the previous
// point, whichever is closer to the pointer, so the sketch is already a
// chain of right angles.

/** Minimum spacing of recorded points: wider for the splines, which need fewer points to look smooth. */
export function sketchSpacing(style: RouteStyle): number {
  return style === "spline" || style === "bezier" ? 50 : 25;
}

/** Keeps the previous point's x or y, whichever leaves the result closer to the pointer. */
export function snapRightAngle(previous: Vec, pointer: Vec): Vec {
  return Math.abs(pointer.x - previous.x) < Math.abs(pointer.y - previous.y)
    ? { x: previous.x, y: pointer.y }
    : { x: pointer.x, y: previous.y };
}

export interface SketchOptions {
  readonly spacing: number;
  readonly orthogonal: boolean;
}

/**
 * Adds the pointer to the sketch when it is more than `spacing` from the last
 * recorded point (or from `origin`, the source anchor, for the first point).
 * Returns the same array when nothing was recorded.
 */
export function recordSketchPoint(
  points: readonly Vec[],
  origin: Vec,
  pointer: Vec,
  { spacing, orthogonal }: SketchOptions,
): readonly Vec[] {
  const last = points[points.length - 1] ?? origin;
  if (distance(last, pointer) <= spacing) return points;
  return [...points, orthogonal ? snapRightAngle(last, pointer) : { x: pointer.x, y: pointer.y }];
}
