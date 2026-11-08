// Stroke patterns for connectors and the marching-ants animation.
//
// Dash and gap both equal the width (dotted) or five times the width
// (dashed). Dotted lines are drawn as zero-length dashes with round caps, so
// each dot is a true circle of the line's width and the visible gap equals
// the dot; the pattern period is the same as for a width-long dash and gap.
//
// The animation moves stroke-dashoffset from one full period P = 2 × dash to
// 0 over P / speed seconds and repeats. Because one cycle shifts the pattern
// by exactly one period, the first and last frames are identical at every
// width (no visible jump), and the apparent speed is the same for any width.

export const STROKE_PATTERNS = ["solid", "dotted", "dashed"] as const;
export type StrokePattern = (typeof STROKE_PATTERNS)[number];

export interface DashStyle {
  /** The SVG stroke-dasharray, or null for a solid line. */
  readonly dashArray: string | null;
  readonly lineCap: "butt" | "round";
  /** Length of one dash plus one gap; 0 for solid lines. */
  readonly period: number;
}

/** Nominal dash length: the width for dotted lines, five widths for dashed ones. */
export function dashLength(pattern: StrokePattern, width: number): number {
  if (pattern === "dotted") return width;
  if (pattern === "dashed") return width * 5;
  return 0;
}

export function dashStyle(pattern: StrokePattern, width: number): DashStyle {
  const dash = dashLength(pattern, width);
  if (dash <= 0) return { dashArray: null, lineCap: pattern === "dotted" ? "round" : "butt", period: 0 };
  if (pattern === "dotted") return { dashArray: `0 ${String(dash * 2)}`, lineCap: "round", period: dash * 2 };
  return { dashArray: `${String(dash)} ${String(dash)}`, lineCap: "butt", period: dash * 2 };
}

/** Travel speed of the marching ants, in canvas units per second. */
export const ANT_SPEED = 20;

export interface MarchingAnts {
  /** stroke-dashoffset at the start of a cycle (one period). */
  readonly from: number;
  /** stroke-dashoffset at the end of a cycle. */
  readonly to: number;
  readonly durationSeconds: number;
}

/** The seamless loop for a pattern period, or null when there is nothing to animate. */
export function marchingAnts(period: number, speed = ANT_SPEED): MarchingAnts | null {
  if (period <= 0 || speed <= 0) return null;
  return { from: period, to: 0, durationSeconds: period / speed };
}

/** The dash offset `seconds` into the animation; equal offsets give identical frames. */
export function antOffset(ants: MarchingAnts, seconds: number): number {
  const progress = (seconds / ants.durationSeconds) % 1;
  return ants.from + (ants.to - ants.from) * progress;
}
