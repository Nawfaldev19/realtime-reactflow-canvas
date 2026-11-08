import { boundsOf, type Box, type Vec } from "./vector";

// Align, justify and distribute, on boxes in one coordinate space (callers
// pass absolute boxes, so steps inside different groups line up on screen).
//
// Naming follows CSS: "justify" acts along the horizontal axis (left, centre,
// right), "align" along the vertical axis (top, middle, bottom). Every command
// measures against the bounding box of the whole selection.

export const JUSTIFY_COMMANDS = ["left", "centre", "right"] as const;
export const ALIGN_COMMANDS = ["top", "middle", "bottom"] as const;
export type JustifyCommand = (typeof JUSTIFY_COMMANDS)[number];
export type AlignCommand = (typeof ALIGN_COMMANDS)[number];
export type LineUpCommand = JustifyCommand | AlignCommand;
export type DistributeAxis = "horizontal" | "vertical";

export interface PlacedBox {
  readonly id: string;
  readonly box: Box;
}

/** New top-left corners, keyed by id. */
export type Placements = Readonly<Record<string, Vec>>;

/**
 * Lines the boxes up on one edge or centre of their combined bounds:
 * left: x = minX; right: x = maxRight − w; centre: x = cx − w/2 (and the same on y).
 */
export function lineUp(items: readonly PlacedBox[], command: LineUpCommand): Placements {
  const bounds = boundsOf(items.map((item) => item.box));
  if (!bounds) return {};
  const result: Record<string, Vec> = {};
  for (const { id, box } of items) {
    switch (command) {
      case "left":
        result[id] = { x: bounds.x, y: box.y };
        break;
      case "centre":
        result[id] = { x: bounds.x + bounds.width / 2 - box.width / 2, y: box.y };
        break;
      case "right":
        result[id] = { x: bounds.x + bounds.width - box.width, y: box.y };
        break;
      case "top":
        result[id] = { x: box.x, y: bounds.y };
        break;
      case "middle":
        result[id] = { x: box.x, y: bounds.y + bounds.height / 2 - box.height / 2 };
        break;
      case "bottom":
        result[id] = { x: box.x, y: bounds.y + bounds.height - box.height };
        break;
    }
  }
  return result;
}

/**
 * Equal gaps between neighbours along an axis. The boxes are sorted by their
 * leading edge (then by id, so equal positions give a stable order); the first
 * keeps its place, the gap is (span − Σ sizes) / (n − 1), and each box starts
 * one gap after the previous one ends. Fewer than three boxes stay put. When
 * the boxes are wider than their span, the gap is negative and they overlap
 * evenly.
 */
export function distribute(items: readonly PlacedBox[], axis: DistributeAxis): Placements {
  if (items.length < 3) return {};
  const horizontal = axis === "horizontal";
  const start = (box: Box) => (horizontal ? box.x : box.y);
  const extent = (box: Box) => (horizontal ? box.width : box.height);
  const sorted = [...items].sort((a, b) => start(a.box) - start(b.box) || (a.id < b.id ? -1 : 1));
  const first = start((sorted[0] as PlacedBox).box);
  const end = Math.max(...sorted.map(({ box }) => start(box) + extent(box)));
  const total = sorted.reduce((sum, { box }) => sum + extent(box), 0);
  const gap = (end - first - total) / (sorted.length - 1);
  const result: Record<string, Vec> = {};
  let cursor = first;
  for (const { id, box } of sorted) {
    result[id] = horizontal ? { x: cursor, y: box.y } : { x: box.x, y: cursor };
    cursor += extent(box) + gap;
  }
  return result;
}
