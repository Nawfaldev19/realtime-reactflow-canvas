import type { Vec } from "./vector";

// Angles in degrees with the canvas convention used by line nodes: 0° points
// straight up and 90° points right (clockwise on screen, where y grows down).

export const CARDINALS = [0, 90, 180, 270] as const;
/** Within this many degrees of a cardinal angle, a rotation snaps to it. */
export const SNAP_THRESHOLD = 7;

export const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;
export const toDegrees = (radians: number): number => (radians * 180) / Math.PI;

/** Normalizes into [0, 360). Never returns −0 or 360. */
export function normalizeAngle(degrees: number): number {
  const remainder = degrees % 360;
  const normalized = remainder < 0 ? remainder + 360 : remainder;
  return normalized >= 360 ? 0 : normalized + 0;
}

/** Unwraps a difference of two angles into (−180, 180], the shortest signed turn. */
export function unwrapDelta(delta: number): number {
  const normalized = normalizeAngle(delta);
  return normalized > 180 ? normalized - 360 : normalized;
}

/** The shortest distance between two angles around the circle, in [0, 180]. */
export function circularDistance(a: number, b: number): number {
  const difference = Math.abs(a - b) % 360;
  return Math.min(difference, 360 - difference);
}

/** The angle of `point` seen from `pivot`: atan2(dx, −dy), so "up" is 0°. */
export function pointerAngle(pivot: Vec, point: Vec): number {
  return normalizeAngle(toDegrees(Math.atan2(point.x - pivot.x, -(point.y - pivot.y))));
}

export interface SnapResult {
  /** The angle to use: the cardinal when snapped, otherwise the normalized input. */
  readonly angle: number;
  readonly snapped: boolean;
}

/** Snaps to the nearest of 0°, 90°, 180° or 270° when within `threshold` degrees. */
export function snapToCardinal(angle: number, threshold = SNAP_THRESHOLD): SnapResult {
  const candidate = nearestOf(angle, CARDINALS);
  return circularDistance(angle, candidate) <= threshold
    ? { angle: normalizeAngle(candidate), snapped: true }
    : { angle: normalizeAngle(angle), snapped: false };
}

/** The candidate closest to `angle` around the circle; the first wins a tie. */
export function nearestOf(angle: number, candidates: readonly number[]): number {
  let best = candidates[0] ?? 0;
  for (const candidate of candidates) {
    if (circularDistance(angle, candidate) < circularDistance(angle, best)) best = candidate;
  }
  return best;
}
