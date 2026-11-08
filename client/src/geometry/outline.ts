import type { Side } from "../document/types";
import type { Box, Vec } from "./vector";

// Where a ray from a shape's centre leaves its outline. Floating connectors
// touch each step exactly where the line between the two centres crosses the
// step's true outline: rectangles, rounded rectangles, ellipses, diamonds
// and (for the other library shapes) any convex polygon.
//
// The rectangle case is adapted from the React Flow Floating Edges example
// (MIT): scale the direction so that its larger normalised component reaches
// the box edge. See docs/REFERENCES.md.

export type Outline =
  | { readonly kind: "rect" }
  | { readonly kind: "rounded"; readonly radius: number }
  | { readonly kind: "ellipse" }
  | { readonly kind: "diamond" }
  /** Vertices relative to the box's top-left corner, in order around a convex outline. */
  | { readonly kind: "polygon"; readonly points: readonly Vec[] };

const centreOf = (box: Box): Vec => ({ x: box.x + box.width / 2, y: box.y + box.height / 2 });

/**
 * Rectangle: C + d / max(|dx|/w, |dy|/h), with half-size (w, h). The
 * L∞-style normalisation makes exactly one component reach the edge, which
 * is the first side the ray meets. A zero direction gives the top centre.
 */
export function rayToRect(box: Box, direction: Vec): Vec {
  const c = centreOf(box);
  const w = box.width / 2;
  const h = box.height / 2;
  const scale = Math.max(w === 0 ? 0 : Math.abs(direction.x) / w, h === 0 ? 0 : Math.abs(direction.y) / h);
  if (scale === 0) return { x: c.x, y: c.y - h };
  return { x: c.x + direction.x / scale, y: c.y + direction.y / scale };
}

/** Ellipse with radii (w, h): C + d / √((dx/w)² + (dy/h)²). */
export function rayToEllipse(box: Box, direction: Vec): Vec {
  const c = centreOf(box);
  const w = box.width / 2;
  const h = box.height / 2;
  if (w === 0 || h === 0) return rayToRect(box, direction);
  const scale = Math.hypot(direction.x / w, direction.y / h);
  if (scale === 0) return { x: c.x, y: c.y - h };
  return { x: c.x + direction.x / scale, y: c.y + direction.y / scale };
}

/** Diamond through the side midpoints: C + d / (|dx|/w + |dy|/h) (the L1 unit ball). */
export function rayToDiamond(box: Box, direction: Vec): Vec {
  const c = centreOf(box);
  const w = box.width / 2;
  const h = box.height / 2;
  if (w === 0 || h === 0) return rayToRect(box, direction);
  const scale = Math.abs(direction.x) / w + Math.abs(direction.y) / h;
  if (scale === 0) return { x: c.x, y: c.y - h };
  return { x: c.x + direction.x / scale, y: c.y + direction.y / scale };
}

/** The farther root of |origin + t·direction − centre|² = r², or null if the ray misses. */
function rayCircle(origin: Vec, direction: Vec, centre: Vec, radius: number): number | null {
  const fx = origin.x - centre.x;
  const fy = origin.y - centre.y;
  const a = direction.x * direction.x + direction.y * direction.y;
  const b = 2 * (fx * direction.x + fy * direction.y);
  const c = fx * fx + fy * fy - radius * radius;
  const discriminant = b * b - 4 * a * c;
  if (a === 0 || discriminant < 0) return null;
  return (-b + Math.sqrt(discriminant)) / (2 * a);
}

/** Rounded rectangle: the rectangle hit, pulled onto the corner arc when it lands inside a corner's square. */
export function rayToRoundedRect(box: Box, radius: number, direction: Vec): Vec {
  const hit = rayToRect(box, direction);
  const r = Math.max(0, Math.min(radius, box.width / 2, box.height / 2));
  if (r === 0) return hit;
  const c = centreOf(box);
  const innerW = box.width / 2 - r;
  const innerH = box.height / 2 - r;
  const dx = hit.x - c.x;
  const dy = hit.y - c.y;
  if (Math.abs(dx) <= innerW || Math.abs(dy) <= innerH) return hit;
  const corner = { x: c.x + Math.sign(dx) * innerW, y: c.y + Math.sign(dy) * innerH };
  const t = rayCircle(c, direction, corner, r);
  return t === null ? hit : { x: c.x + direction.x * t, y: c.y + direction.y * t };
}

/** Convex polygon: the farthest crossing of the ray from the centre with any edge. */
export function rayToPolygon(box: Box, points: readonly Vec[], direction: Vec): Vec {
  const c = centreOf(box);
  if (points.length < 3 || (direction.x === 0 && direction.y === 0)) return rayToRect(box, direction);
  let best: number | null = null;
  for (let index = 0; index < points.length; index += 1) {
    const a = points[index];
    const b = points[(index + 1) % points.length];
    if (!a || !b) continue;
    const ax = box.x + a.x - c.x;
    const ay = box.y + a.y - c.y;
    const ex = b.x - a.x;
    const ey = b.y - a.y;
    // Solve t·d = A + s·E for t ≥ 0 and s ∈ [0, 1].
    const denominator = direction.x * ey - direction.y * ex;
    if (Math.abs(denominator) < 1e-12) continue;
    const t = (ax * ey - ay * ex) / denominator;
    const s = (ax * direction.y - ay * direction.x) / denominator;
    if (t >= 0 && s >= -1e-9 && s <= 1 + 1e-9 && (best === null || t > best)) best = t;
  }
  return best === null ? rayToRect(box, direction) : { x: c.x + direction.x * best, y: c.y + direction.y * best };
}

/** Where a ray from the box centre in `direction` leaves the outline. */
export function rayToOutline(box: Box, outline: Outline, direction: Vec): Vec {
  switch (outline.kind) {
    case "rect":
      return rayToRect(box, direction);
    case "rounded":
      return rayToRoundedRect(box, outline.radius, direction);
    case "ellipse":
      return rayToEllipse(box, direction);
    case "diamond":
      return rayToDiamond(box, direction);
    case "polygon":
      return rayToPolygon(box, outline.points, direction);
  }
}

/**
 * The side of the box a boundary point touches, with a 1-unit tolerance:
 * left, then right, then top, then bottom. Points of curved or slanted
 * outlines that touch no box edge take the side their normalised offset
 * from the centre points to.
 */
export function sideOfPoint(box: Box, point: Vec, tolerance = 1): Side {
  if (point.x <= box.x + tolerance) return "left";
  if (point.x >= box.x + box.width - tolerance) return "right";
  if (point.y <= box.y + tolerance) return "top";
  if (point.y >= box.y + box.height - tolerance) return "bottom";
  const c = centreOf(box);
  const dx = (point.x - c.x) / Math.max(box.width, 1e-9);
  const dy = (point.y - c.y) / Math.max(box.height, 1e-9);
  if (Math.abs(dx) > Math.abs(dy)) return dx < 0 ? "left" : "right";
  return dy < 0 ? "top" : "bottom";
}

/**
 * The anchor of a floating connector on `box`: the outline point toward the
 * other box's centre. Overlapping centres keep `previous` when given.
 */
export function floatingAnchor(box: Box, outline: Outline, toward: Vec, previous: Vec | null = null): Vec {
  const c = centreOf(box);
  const direction = { x: toward.x - c.x, y: toward.y - c.y };
  if (direction.x === 0 && direction.y === 0 && previous) return previous;
  return rayToOutline(box, outline, direction);
}
