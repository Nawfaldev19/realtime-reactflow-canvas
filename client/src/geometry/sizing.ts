import { clamp, type Box } from "./vector";

// Node sizing rules: limits, proportional multi-node resizing, and the
// grow-only auto height used while editing text.

export const MIN_NODE_SIZE = 25;
export const MAX_NODE_SIZE = 2500;
/** Extra room added when typed text outgrows its node, so the next line fits too. */
export const GROW_ALLOWANCE = 17;

export interface SizeLimits {
  readonly minWidth: number;
  readonly minHeight: number;
}

export const DEFAULT_LIMITS: SizeLimits = { minWidth: MIN_NODE_SIZE, minHeight: MIN_NODE_SIZE };

export function clampSize(
  width: number,
  height: number,
  limits: SizeLimits = DEFAULT_LIMITS,
): { width: number; height: number } {
  return {
    width: clamp(width, limits.minWidth, MAX_NODE_SIZE),
    height: clamp(height, limits.minHeight, MAX_NODE_SIZE),
  };
}

/**
 * Proportional multi-resize. The dragged node goes from start box to `next`;
 * every other node is scaled by the same factors about its own top-left
 * corner (clamped to its limits) and shifted by the dragged node's top-left
 * offset. Returns a box per id in `start`.
 */
export function scaleSelection(
  start: Readonly<Record<string, Box>>,
  draggedId: string,
  next: Box,
  limitsFor: (id: string) => SizeLimits = () => DEFAULT_LIMITS,
): Record<string, Box> {
  const origin = start[draggedId];
  if (!origin) return {};
  const sx = origin.width > 0 ? next.width / origin.width : 1;
  const sy = origin.height > 0 ? next.height / origin.height : 1;
  const dx = next.x - origin.x;
  const dy = next.y - origin.y;
  const result: Record<string, Box> = {};
  for (const [id, box] of Object.entries(start)) {
    if (id === draggedId) {
      result[id] = next;
      continue;
    }
    const size = clampSize(box.width * sx, box.height * sy, limitsFor(id));
    result[id] = { x: box.x + dx, y: box.y + dy, ...size };
  }
  return result;
}

/** Overflow means the content needs more than 1px beyond the space it has. */
export function isOverflowing(contentHeight: number, chrome: number, nodeHeight: number): boolean {
  return contentHeight + chrome > nodeHeight + 1;
}

/**
 * The height while editing: content + chrome + allowance when the content
 * overflows, otherwise null (never shrinks on its own).
 */
export function grownHeight(contentHeight: number, chrome: number, nodeHeight: number): number | null {
  if (!isOverflowing(contentHeight, chrome, nodeHeight)) return null;
  return Math.min(MAX_NODE_SIZE, Math.ceil(contentHeight + chrome + GROW_ALLOWANCE));
}

/** The exact fit used by the "fit height" button: grows or shrinks to the content. */
export function fitHeight(contentHeight: number, chrome: number, minHeight = MIN_NODE_SIZE): number {
  return clamp(Math.ceil(contentHeight + chrome), minHeight, MAX_NODE_SIZE);
}
