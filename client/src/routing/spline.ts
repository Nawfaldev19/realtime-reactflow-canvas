import type { Side } from "../document/types";
import type { Path, PathSegment } from "../geometry/path";
import { sameXY } from "./orthogonal";
import { NORMALS } from "./anchors";
import type { Vec } from "../geometry/vector";

// Smooth curves through route points: uniform Catmull-Rom splines emitted as
// cubic Béziers.
//
// Derivation of the conversion. A uniform Catmull-Rom segment from A to B
// (neighbours Z before A and Y after B) has the end tangents
//   T_A = (B − Z) / 2   and   T_B = (Y − A) / 2.
// A cubic Bézier P0 P1 P2 P3 has end tangents 3(P1 − P0) and 3(P3 − P2).
// Matching the two at both ends gives
//   P0 = A,  P1 = A + T_A / 3 = A + (B − Z) / 6,
//   P2 = B − T_B / 3 = B − (Y − A) / 6,  P3 = B,
// the "divide by six" rule. (See any text on cubic Hermite splines, for
// example Foley et al., "Computer Graphics: Principles and Practice", on
// Catmull-Rom and Bézier forms.)
//
// Two flavours differ only at the ends:
// - plain: a missing neighbour is the end point itself (Z = A, Y = B), so
//   the curve heads straight toward its neighbour;
// - handle-aware: a ghost neighbour is chosen so that the end control point
//   equals the canvas library's standard Bézier control point. With
//   P1 = A + (B − Z)/6 and the wanted P1 = K, solving gives Z = B + 6(A − K).
//   The curve then leaves and enters perpendicular to the port sides, and
//   with no points it is exactly the standard curve.
//
// The standard curve is the open-source React Flow Bézier edge (MIT); its
// control-point rule (controlOffset below) follows the library's documented
// behaviour and is checked against getBezierPath in the tests. See
// docs/REFERENCES.md.

/** The standard curve's control distance for a signed offset δ along the port normal. */
export function controlOffset(delta: number, curvature = 0.25): number {
  return delta >= 0 ? 0.5 * delta : curvature * 25 * Math.sqrt(-delta);
}

/**
 * The standard curve's control point at `anchor` on `side`: the anchor moved
 * along the side's outward normal by controlOffset(δ), where δ is the signed
 * distance from the anchor to `other` along that normal.
 */
export function standardControl(anchor: Vec, side: Side, other: Vec): Vec {
  const normal = NORMALS[side];
  const delta = (other.x - anchor.x) * normal.x + (other.y - anchor.y) * normal.y;
  const offset = controlOffset(delta);
  return { x: anchor.x + normal.x * offset, y: anchor.y + normal.y * offset };
}

export interface Ghosts {
  /** Neighbour before the first point. Defaults to the first point itself. */
  readonly start?: Vec;
  /** Neighbour after the last point. Defaults to the last point itself. */
  readonly end?: Vec;
}

/**
 * Ghost neighbours that make the first and last control points equal the
 * standard curve's control points at the source and target ports.
 */
export function handleAwareGhosts(points: readonly Vec[], sourceSide: Side, targetSide: Side): Ghosts {
  const first = points[0];
  const second = points[1];
  const last = points[points.length - 1];
  const beforeLast = points[points.length - 2];
  if (!first || !second || !last || !beforeLast) return {};
  const kSource = standardControl(first, sourceSide, second);
  const kTarget = standardControl(last, targetSide, beforeLast);
  return {
    start: { x: second.x + 6 * (first.x - kSource.x), y: second.y + 6 * (first.y - kSource.y) },
    end: { x: beforeLast.x + 6 * (last.x - kTarget.x), y: beforeLast.y + 6 * (last.y - kTarget.y) },
  };
}

interface Neighbourhood {
  readonly z: Vec;
  readonly a: Vec;
  readonly b: Vec;
  readonly y: Vec;
}

function neighbourhoods(points: readonly Vec[], ghosts: Ghosts): Neighbourhood[] {
  const result: Neighbourhood[] = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    const a = points[index];
    const b = points[index + 1];
    if (!a || !b) continue;
    const z = points[index - 1] ?? ghosts.start ?? a;
    const y = points[index + 2] ?? ghosts.end ?? b;
    result.push({ z, a, b, y });
  }
  return result;
}

/**
 * The Bézier form of the Catmull-Rom spline through `points`. Zero-length
 * pieces are skipped but their points still shape their neighbours.
 */
export function catmullRomPath(points: readonly Vec[], ghosts: Ghosts = {}): Path {
  const segments: PathSegment[] = [];
  for (const { z, a, b, y } of neighbourhoods(points, ghosts)) {
    if (sameXY(a, b)) continue;
    segments.push({
      kind: "cubic",
      from: a,
      c1: { x: a.x + (b.x - z.x) / 6, y: a.y + (b.y - z.y) / 6 },
      c2: { x: b.x - (y.x - a.x) / 6, y: b.y - (y.y - a.y) / 6 },
      to: b,
    });
  }
  return segments;
}

/**
 * The point at parameter ½ of each piece, (−Z + 9A + 9B − Y) / 16, which
 * lies exactly on the drawn curve. These are the "add point" handles.
 */
export function splineMidpoints(points: readonly Vec[], ghosts: Ghosts = {}): Vec[] {
  return neighbourhoods(points, ghosts).map(({ z, a, b, y }) => ({
    x: (-z.x + 9 * a.x + 9 * b.x - y.x) / 16,
    y: (-z.y + 9 * a.y + 9 * b.y - y.y) / 16,
  }));
}
