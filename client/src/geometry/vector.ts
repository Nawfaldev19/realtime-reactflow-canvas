// Small 2D vector helpers shared by the geometry modules. Framework-free.

export interface Vec {
  readonly x: number;
  readonly y: number;
}

export interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export const add = (a: Vec, b: Vec): Vec => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y });
export const scale = (a: Vec, factor: number): Vec => ({ x: a.x * factor, y: a.y * factor });
export const length = (a: Vec): number => Math.hypot(a.x, a.y);
export const distance = (a: Vec, b: Vec): number => Math.hypot(a.x - b.x, a.y - b.y);
export const midpoint = (a: Vec, b: Vec): Vec => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

/** The unit vector in the direction of `a`, or the zero vector for a zero input. */
export function normalize(a: Vec): Vec {
  const size = length(a);
  return size === 0 ? { x: 0, y: 0 } : { x: a.x / size, y: a.y / size };
}

/** `a` turned a quarter turn: (−y, x). In screen space (y down) this is clockwise. */
export const perpendicular = (a: Vec): Vec => ({ x: -a.y, y: a.x });

/** The entry at `index`, wrapping around both ends; throws on an empty list. */
export function cyclic<T>(list: readonly T[], index: number): T {
  const value = list[((index % list.length) + list.length) % list.length];
  if (value === undefined) throw new RangeError("cyclic() needs a non-empty list");
  return value;
}

/** Rounds to two decimals, so SVG strings and stored points stay short. */
export const round2 = (value: number): number => Math.round(value * 100) / 100 + 0;

export const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

export const boxCentre = (box: Box): Vec => ({ x: box.x + box.width / 2, y: box.y + box.height / 2 });

export function containsPoint(box: Box, point: Vec): boolean {
  return point.x >= box.x && point.x <= box.x + box.width && point.y >= box.y && point.y <= box.y + box.height;
}

/** True when the boxes overlap with a positive area (touching edges do not count). */
export function intersects(a: Box, b: Box): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

/** The smallest box containing every box; null for an empty list. */
export function boundsOf(boxes: readonly Box[]): Box | null {
  if (boxes.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const box of boxes) {
    minX = Math.min(minX, box.x);
    minY = Math.min(minY, box.y);
    maxX = Math.max(maxX, box.x + box.width);
    maxY = Math.max(maxY, box.y + box.height);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}
