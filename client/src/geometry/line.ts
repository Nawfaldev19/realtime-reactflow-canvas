import { normalizeAngle, toRadians } from "./angles";
import { MAX_NODE_SIZE } from "./sizing";
import { add, clamp, length, midpoint, normalize, perpendicular, scale, sub, type Box, type Vec } from "./vector";

// Geometry of the line node. A line is stored as a rotation and a length; its
// box is derived from them. The line is drawn through the centre of the box,
// clipped to the box by slab clipping, so it also follows the box while the
// user resizes it.

/** The box never gets thinner than this, so a horizontal line can still be grabbed. */
export const MIN_LINE_BOX = 20;
/**
 * The shortest line. Above 20·√2 at most one side of the box is clamped to
 * MIN_LINE_BOX, and then slab clipping returns exactly the stored length.
 */
export const MIN_LINE_LENGTH = 30;
/** The longest line, so a vertical or horizontal box never exceeds the node size limit. */
export const MAX_LINE_LENGTH = MAX_NODE_SIZE;
/** Distance of the rotate handle from the line's midpoint, along the perpendicular. */
export const HANDLE_OFFSET = 26;
export const HANDLE_RADIUS = 11;
export const HANDLE_HIT_RADIUS = 18;

const EPSILON = 0.0001;

/** The unit direction for an angle: d = (sin θ, −cos θ), so 0° is up and 90° is right. */
export function direction(angle: number): Vec {
  const radians = toRadians(angle);
  return { x: Math.sin(radians) + 0, y: -Math.cos(radians) + 0 };
}

/** How far a ray from `origin` along `dir` travels before leaving the box [0, size]. */
export function slabExit(origin: Vec, dir: Vec, width: number, height: number): number {
  const exit = (start: number, step: number, extent: number) =>
    Math.abs(step) > EPSILON ? Math.max((0 - start) / step, (extent - start) / step) : Infinity;
  return Math.min(exit(origin.x, dir.x, width), exit(origin.y, dir.y, height));
}

export interface Segment {
  readonly start: Vec;
  readonly end: Vec;
}

/** The line through the box centre at `angle`, clipped to the box (box-local coordinates). */
export function lineEndpoints(width: number, height: number, angle: number): Segment {
  const centre = { x: width / 2, y: height / 2 };
  const dir = direction(angle);
  const forward = slabExit(centre, dir, width, height);
  const backward = slabExit(centre, scale(dir, -1), width, height);
  return { start: sub(centre, scale(dir, backward)), end: add(centre, scale(dir, forward)) };
}

/** The visible length of a line at `angle` inside a box of this size. */
export function lengthInBox(width: number, height: number, angle: number): number {
  const { start, end } = lineEndpoints(width, height, angle);
  return length(sub(end, start));
}

/** The rotate handle: the midpoint pushed `offset` along the unit perpendicular (−v_y, v_x)/|v|. */
export function handlePoint({ start, end }: Segment, offset = HANDLE_OFFSET): Vec {
  const mid = midpoint(start, end);
  return add(mid, scale(normalize(perpendicular(sub(end, start))), offset));
}

/** Where the dotted stem from the midpoint stops, `gap` short of the handle centre. */
export function stemEnd(segment: Segment, offset = HANDLE_OFFSET, gap = HANDLE_RADIUS): Vec {
  return handlePoint(segment, Math.max(0, offset - gap));
}

/**
 * The box for a line of `lineLength` at `angle` around `centre`:
 * w = max(L·|sin θ|, 20), h = max(L·|cos θ|, 20), positioned so its centre stays put.
 */
export function boxForLine(centre: Vec, lineLength: number, angle: number): Box {
  const dir = direction(angle);
  const width = Math.max(lineLength * Math.abs(dir.x), MIN_LINE_BOX);
  const height = Math.max(lineLength * Math.abs(dir.y), MIN_LINE_BOX);
  return { x: centre.x - width / 2, y: centre.y - height / 2, width, height };
}

export interface LineGeometry {
  readonly box: Box;
  readonly rotation: number;
  readonly length: number;
}

/**
 * Rotates a line to `angle` about the centre of its box. The length comes from
 * the stored value, never from the box diagonal, so repeated rotations cannot
 * make the line drift longer or shorter. Lengths are kept within
 * [MIN_LINE_LENGTH, MAX_LINE_LENGTH].
 */
export function rotateLine(box: Box, lineLength: number, angle: number): LineGeometry {
  const rotation = normalizeAngle(angle);
  const safeLength = clamp(lineLength, MIN_LINE_LENGTH, MAX_LINE_LENGTH);
  const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  return { box: boxForLine(centre, safeLength, rotation), rotation, length: safeLength };
}

/**
 * After a resize the line spans the new box at its current angle, so its new
 * length is the clipped length. A line shorter than the minimum is rebuilt
 * at the minimum length around the same centre.
 */
export function resizeLine(box: Box, angle: number): LineGeometry {
  const rotation = normalizeAngle(angle);
  const visible = lengthInBox(box.width, box.height, rotation);
  if (visible >= MIN_LINE_LENGTH) return { box, rotation, length: visible };
  return rotateLine(box, MIN_LINE_LENGTH, rotation);
}
