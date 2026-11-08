import { clamp, cyclic, distance, round2, type Vec } from "./vector";

// Outlines for the shape library, derived from one vertex list per shape.
// The same list draws the outline, places the four connection handles where
// the outline crosses the box's centre lines, and produces the two float
// polygons that make text wrap inside the shape (CSS shape-outside).

export const SHAPE_KINDS = ["diamond", "hexagon", "circle", "triangle", "parallelogram", "cylinder"] as const;
export type ShapeKind = (typeof SHAPE_KINDS)[number];

export const isShapeKind = (value: unknown): value is ShapeKind => SHAPE_KINDS.includes(value as ShapeKind);

/** Corner softening radius. Fixed in pixels so the rounding looks the same at every aspect ratio. */
export const CORNER_RADIUS = 4;
/** Below this width or height the wrap guides are dropped, so text is never squeezed to nothing. */
export const MIN_WRAP_SIZE = 40;
/** Samples per side of the ellipse (64 around the whole outline). */
const ELLIPSE_SAMPLES_PER_SIDE = 16;

/** Vertex fractions of the box for the straight-edged shapes. */
const POLYGON_FRACTIONS: Readonly<
  Record<"diamond" | "hexagon" | "triangle" | "parallelogram", readonly (readonly [number, number])[]>
> = {
  diamond: [
    [0.5, 0],
    [1, 0.5],
    [0.5, 1],
    [0, 0.5],
  ],
  hexagon: [
    [0.23, 0],
    [0.77, 0],
    [1, 0.5],
    [0.77, 1],
    [0.23, 1],
    [0, 0.5],
  ],
  triangle: [
    [0.5, 0],
    [1, 1],
    [0, 1],
  ],
  parallelogram: [
    [0.2, 0],
    [1, 0],
    [0.8, 1],
    [0, 1],
  ],
};

/** Height of the cylinder's elliptical cap (its vertical radius). */
export function cylinderCap(width: number, height: number): number {
  return Math.min(height * 0.12, width * 0.25);
}

function ellipsePoints(cx: number, cy: number, rx: number, ry: number, from: number, to: number, steps: number): Vec[] {
  const points: Vec[] = [];
  for (let index = 0; index <= steps; index += 1) {
    const angle = from + ((to - from) * index) / steps;
    points.push({ x: cx + rx * Math.cos(angle), y: cy + ry * Math.sin(angle) });
  }
  return points;
}

/**
 * The outline as a closed polygon in box coordinates, inset by `inset` on
 * every side (half the stroke width keeps the stroke inside the box).
 * Curved shapes are sampled finely enough for wrapping and hit tests.
 */
export function outlinePolygon(kind: ShapeKind, width: number, height: number, inset = 0): Vec[] {
  const w = Math.max(0, width - inset * 2);
  const h = Math.max(0, height - inset * 2);
  const at = (x: number, y: number): Vec => ({ x: inset + x, y: inset + y });
  switch (kind) {
    case "circle":
      return ellipsePoints(w / 2, h / 2, w / 2, h / 2, 0, Math.PI * 2, ELLIPSE_SAMPLES_PER_SIDE * 4)
        .slice(0, -1)
        .map((point) => at(point.x, point.y));
    case "cylinder": {
      const cap = cylinderCap(w, h);
      const top = ellipsePoints(w / 2, cap, w / 2, cap, Math.PI, Math.PI * 2, ELLIPSE_SAMPLES_PER_SIDE);
      const bottom = ellipsePoints(w / 2, h - cap, w / 2, cap, 0, Math.PI, ELLIPSE_SAMPLES_PER_SIDE);
      return [...top, ...bottom].map((point) => at(point.x, point.y));
    }
    default:
      return POLYGON_FRACTIONS[kind].map(([fx, fy]) => at(fx * w, fy * h));
  }
}

const n = (value: number) => String(round2(value));
const pair = (point: Vec) => `${n(point.x)} ${n(point.y)}`;

/**
 * A closed path with softened corners: each vertex V becomes a line to the
 * point `radius` before V on the incoming edge, then a quadratic curve with V
 * as the control point to the point `radius` after V. The radius shrinks on
 * short edges so neighbouring corners never overlap.
 */
export function roundedPolygonPath(points: readonly Vec[], radius = CORNER_RADIUS): string {
  if (points.length < 3) return "";
  const corners = points.map((vertex, index) => {
    const previous = cyclic(points, index - 1);
    const next = cyclic(points, index + 1);
    const inLength = distance(previous, vertex);
    const outLength = distance(vertex, next);
    const r = Math.min(radius, inLength / 2, outLength / 2);
    const before =
      inLength === 0
        ? vertex
        : {
            x: vertex.x + ((previous.x - vertex.x) * r) / inLength,
            y: vertex.y + ((previous.y - vertex.y) * r) / inLength,
          };
    const after =
      outLength === 0
        ? vertex
        : { x: vertex.x + ((next.x - vertex.x) * r) / outLength, y: vertex.y + ((next.y - vertex.y) * r) / outLength };
    return { vertex, before, after };
  });
  const segments = corners.map(
    ({ vertex, before, after }, index) => `${index === 0 ? "M" : "L"} ${pair(before)} Q ${pair(vertex)} ${pair(after)}`,
  );
  return `${segments.join(" ")} Z`;
}

export interface ShapePaths {
  /** The filled and stroked outline. */
  readonly outline: string;
  /** Extra strokes drawn on top (the front rim of the cylinder's top cap). */
  readonly detail: string | null;
}

/** SVG paths for a shape at the given size, inset by half the stroke width. */
export function shapePaths(kind: ShapeKind, width: number, height: number, strokeWidth = 1): ShapePaths {
  const inset = strokeWidth / 2;
  const w = Math.max(0, width - strokeWidth);
  const h = Math.max(0, height - strokeWidth);
  if (kind === "circle") {
    const rx = w / 2;
    const ry = h / 2;
    const cy = inset + ry;
    return {
      outline: `M ${n(inset)} ${n(cy)} A ${n(rx)} ${n(ry)} 0 1 0 ${n(inset + w)} ${n(cy)} A ${n(rx)} ${n(ry)} 0 1 0 ${n(inset)} ${n(cy)} Z`,
      detail: null,
    };
  }
  if (kind === "cylinder") {
    const cap = cylinderCap(w, h);
    const rx = w / 2;
    const left = inset;
    const right = inset + w;
    const top = inset + cap;
    const bottom = inset + h - cap;
    return {
      outline: [
        `M ${n(left)} ${n(top)}`,
        `A ${n(rx)} ${n(cap)} 0 0 1 ${n(right)} ${n(top)}`,
        `L ${n(right)} ${n(bottom)}`,
        `A ${n(rx)} ${n(cap)} 0 0 1 ${n(left)} ${n(bottom)} Z`,
      ].join(" "),
      detail: `M ${n(left)} ${n(top)} A ${n(rx)} ${n(cap)} 0 0 0 ${n(right)} ${n(top)}`,
    };
  }
  return { outline: roundedPolygonPath(outlinePolygon(kind, width, height, inset)), detail: null };
}

/** The interior that text may use. The cylinder's text sits below its top cap. */
export function textPolygon(kind: ShapeKind, width: number, height: number): Vec[] {
  if (kind !== "cylinder") return outlinePolygon(kind, width, height);
  const cap = cylinderCap(width, height);
  return [
    { x: 0, y: cap * 2 },
    { x: width, y: cap * 2 },
    { x: width, y: height - cap },
    { x: 0, y: height - cap },
  ];
}

/** Where a horizontal line at `y` crosses a convex polygon: [left, right], or null if it misses. */
export function horizontalSpan(polygon: readonly Vec[], y: number): readonly [number, number] | null {
  return span(polygon, y, "y");
}

/** Where a vertical line at `x` crosses a convex polygon: [top, bottom], or null if it misses. */
export function verticalSpan(polygon: readonly Vec[], x: number): readonly [number, number] | null {
  return span(polygon, x, "x");
}

function span(polygon: readonly Vec[], at: number, axis: "x" | "y"): readonly [number, number] | null {
  const other = axis === "y" ? "x" : "y";
  const hits: number[] = [];
  polygon.forEach((a, index) => {
    const b = cyclic(polygon, index + 1);
    const low = Math.min(a[axis], b[axis]);
    const high = Math.max(a[axis], b[axis]);
    if (at < low || at > high) return;
    if (a[axis] === b[axis]) {
      hits.push(a[other], b[other]);
      return;
    }
    hits.push(a[other] + ((at - a[axis]) * (b[other] - a[other])) / (b[axis] - a[axis]));
  });
  return hits.length === 0 ? null : [Math.min(...hits), Math.max(...hits)];
}

export interface SideAnchors {
  readonly top: Vec;
  readonly right: Vec;
  readonly bottom: Vec;
  readonly left: Vec;
}

/**
 * Where the box's centre lines meet the outline. For most shapes these are
 * the box side midpoints; for the triangle and parallelogram the left and
 * right anchors move inward onto the slanted edges, so handles always touch
 * the drawn shape without any per-shape anchor table.
 */
export function sideAnchors(kind: ShapeKind, width: number, height: number): SideAnchors {
  const polygon = outlinePolygon(kind, width, height);
  const [top, bottom] = verticalSpan(polygon, width / 2) ?? [0, height];
  const [left, right] = horizontalSpan(polygon, height / 2) ?? [0, width];
  return {
    top: { x: width / 2, y: top },
    right: { x: right, y: height / 2 },
    bottom: { x: width / 2, y: bottom },
    left: { x: left, y: height / 2 },
  };
}

export interface WrapGuides {
  /** Float polygon for the left half, in its own coordinates (width w/2, height h). */
  readonly left: readonly Vec[];
  /** Float polygon for the right half, in its own coordinates (origin at x = w/2). */
  readonly right: readonly Vec[];
}

/**
 * The two float shapes that keep text inside the outline. Each covers the
 * empty area outside the text interior on its side, so inline text flows only
 * through the interior. Rows are taken at every vertex height plus `rows`
 * even steps; `padding` keeps glyphs off the stroke. Returns null below
 * MIN_WRAP_SIZE.
 */
export function wrapGuides(
  kind: ShapeKind,
  width: number,
  height: number,
  { padding = 6, rows = 24 } = {},
): WrapGuides | null {
  if (width < MIN_WRAP_SIZE || height < MIN_WRAP_SIZE) return null;
  const polygon = textPolygon(kind, width, height);
  const half = width / 2;
  const levels = new Set<number>();
  for (let index = 0; index <= rows; index += 1) levels.add((height * index) / rows);
  for (const point of polygon) levels.add(clamp(point.y, 0, height));
  const ys = [...levels].sort((a, b) => a - b);

  const left: Vec[] = [{ x: 0, y: 0 }];
  const right: Vec[] = [{ x: half, y: 0 }];
  const push = (leftEdge: number, rightEdge: number, y: number) => {
    left.push({ x: round2(leftEdge), y: round2(y) });
    right.push({ x: round2(rightEdge - half), y: round2(y) });
  };
  // Between a blocked row and an open row the guide steps straight across,
  // so the straight segment between them can never open a gap outside the shape.
  let previous: { y: number; open: boolean } | null = null;
  for (const y of ys) {
    const hit = horizontalSpan(polygon, y);
    const open = hit !== null && hit[0] + padding < hit[1] - padding;
    if (previous && previous.open !== open) push(half, half, open ? y : previous.y);
    if (open) push(clamp(hit[0] + padding, 0, half), clamp(hit[1] - padding, half, width), y);
    else push(half, half, y);
    previous = { y, open };
  }
  left.push({ x: 0, y: height });
  right.push({ x: half, y: height });
  return { left, right };
}

/** A CSS polygon() value for shape-outside. */
export function cssPolygon(points: readonly Vec[]): string {
  return `polygon(${points.map((point) => `${n(point.x)}px ${n(point.y)}px`).join(", ")})`;
}

/** The top margin that centres a block of `textHeight` vertically in `boxHeight`. */
export function centredOffset(boxHeight: number, textHeight: number): number {
  return Math.max(0, (boxHeight - textHeight) / 2);
}
