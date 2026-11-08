import type { RoutePoint } from "../document/types";
import type { Vec } from "../geometry/vector";
import { pointIdBetween } from "./ids";

// Editing the free route styles (polyline and both splines) by hand: user
// points, the "add point" handle between each pair of neighbours, snapping
// to the anchors' axes in screen pixels, keyboard nudging and removal.

export const SOURCE_POINT = "source";
export const TARGET_POINT = "target";

export type RouteHandle =
  | { readonly kind: "add"; readonly id: string; readonly insertAt: number; readonly position: Vec }
  | { readonly kind: "point"; readonly id: string; readonly index: number; readonly position: Vec };

/**
 * Handles in the order [add0, point1, add1, point2, …, addN]. Add handle k
 * sits between point k and point k + 1 (the source counts as point 0) and
 * inserts at index k. Its id is the id the new point will get, derived from
 * the neighbours' ids, so converting it never remounts the element.
 */
export function routeHandles(points: readonly RoutePoint[], addPositions: readonly Vec[]): RouteHandle[] {
  const handles: RouteHandle[] = [];
  for (let k = 0; k <= points.length; k += 1) {
    const previous = k === 0 ? SOURCE_POINT : (points[k - 1]?.id ?? SOURCE_POINT);
    const next = k === points.length ? TARGET_POINT : (points[k]?.id ?? TARGET_POINT);
    const position = addPositions[k];
    if (position) handles.push({ kind: "add", id: pointIdBetween(previous, next), insertAt: k, position });
    const point = points[k];
    if (point) handles.push({ kind: "point", id: point.id, index: k, position: { x: point.x, y: point.y } });
  }
  return handles;
}

/** Inserts a user point at index `insertAt`. */
export function insertPoint(points: readonly RoutePoint[], insertAt: number, id: string, position: Vec): RoutePoint[] {
  const point: RoutePoint = { id, x: position.x, y: position.y, userCreated: true };
  return [...points.slice(0, insertAt), point, ...points.slice(insertAt)];
}

/** Moves the point with `id`; unknown ids leave the list unchanged. */
export function movePoint(points: readonly RoutePoint[], id: string, position: Vec): readonly RoutePoint[] {
  if (!points.some((point) => point.id === id)) return points;
  return points.map((point) => (point.id === id ? { ...point, x: position.x, y: position.y } : point));
}

export interface Removal {
  readonly points: RoutePoint[];
  /** The point to focus next: the previous user point, or null for the connector itself. */
  readonly focus: string | null;
}

/** Removes a point. The connector itself is never removed. */
export function removePoint(points: readonly RoutePoint[], id: string): Removal {
  const index = points.findIndex((point) => point.id === id);
  if (index < 0) return { points: [...points], focus: null };
  const previous = points
    .slice(0, index)
    .reverse()
    .find((point) => point.userCreated);
  return { points: points.filter((point) => point.id !== id), focus: previous?.id ?? null };
}

/** Snap distance in screen pixels. */
export const SNAP_PIXELS = 7;

export interface Snap {
  readonly point: Vec;
  /** The x of the vertical guide line to draw, or null. */
  readonly guideX: number | null;
  /** The y of the horizontal guide line to draw, or null. */
  readonly guideY: number | null;
}

/**
 * Snaps a dragged point to the x and/or y of the nearest anchor when it is
 * within SNAP_PIXELS screen pixels (SNAP_PIXELS / zoom canvas units). The
 * comparison uses the true signed difference on each axis, so a point on
 * either side of an anchor snaps the same way.
 */
export function snapToAnchors(pointer: Vec, anchors: readonly Vec[], zoom: number): Snap {
  const threshold = SNAP_PIXELS / (zoom > 0 ? zoom : 1);
  const nearest = (axis: "x" | "y"): number | null => {
    let best: number | null = null;
    let bestDistance = Infinity;
    for (const anchor of anchors) {
      const difference = pointer[axis] - anchor[axis];
      const size = Math.abs(difference);
      if (size <= threshold && size < bestDistance) {
        best = anchor[axis];
        bestDistance = size;
      }
    }
    return best;
  };
  const guideX = nearest("x");
  const guideY = nearest("y");
  return { point: { x: guideX ?? pointer.x, y: guideY ?? pointer.y }, guideX, guideY };
}

export const NUDGE = 5;
export const FINE_NUDGE = 1;

const ARROWS: Readonly<Record<string, Vec>> = {
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
};

/** The offset an arrow key moves a handle by: 5 units, or 1 with Alt. Null for other keys. */
export function arrowOffset(key: string, fine: boolean): Vec | null {
  const direction = ARROWS[key];
  if (!direction) return null;
  const step = fine ? FINE_NUDGE : NUDGE;
  return { x: direction.x * step, y: direction.y * step };
}
