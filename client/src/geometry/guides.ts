import type { Box } from "./vector";

// Alignment guides: while a step is dragged or resized, its edges and centres
// snap to the same features of nearby steps, and a guide line shows where.
//
// Every step contributes six anchors. Top, middle and bottom are y values and
// form horizontal guides; left, centre and right are x values and form
// vertical guides. The index keeps one array per orientation sorted by that
// value, so a lookup is a binary search for the window [p − r, p + r] plus a
// scan of the k guides inside it: O(log n + k) per anchor and frame. Entries
// can be inserted and removed one step at a time, so a step that moves while
// someone drags (a collaborator, an undo) is re-indexed without a rebuild.
//
// The radius is defined in screen pixels and divided by the zoom before it
// gets here, so snapping engages at the same on-screen distance at every zoom.
// Candidates are filtered to steps visible in the viewport, optionally to one
// reference step, and to the K nearest steps; the guide chosen on the previous
// frame wins while it is still a candidate (hysteresis), so the guide does not
// flicker between two nearly equal candidates as the pointer moves.

export type GuideOrientation = "horizontal" | "vertical";
export type HorizontalAnchor = "top" | "middle" | "bottom";
export type VerticalAnchor = "left" | "centre" | "right";
export type AnchorName = HorizontalAnchor | VerticalAnchor;

export const ANCHORS: Readonly<Record<GuideOrientation, readonly AnchorName[]>> = {
  horizontal: ["top", "middle", "bottom"],
  vertical: ["left", "centre", "right"],
};

export interface GuideSource {
  readonly id: string;
  /** Absolute box in canvas coordinates. */
  readonly box: Box;
  /** The owner's fill colour, if it has a usable one (see guideColor). */
  readonly color: string | null;
}

export interface Guide {
  readonly orientation: GuideOrientation;
  /** A y value for horizontal guides, an x value for vertical ones. */
  readonly value: number;
  readonly ownerId: string;
  readonly box: Box;
  readonly anchor: AnchorName;
  readonly color: string | null;
}

export function anchorValue(box: Box, anchor: AnchorName): number {
  switch (anchor) {
    case "top":
      return box.y;
    case "middle":
      return box.y + box.height / 2;
    case "bottom":
      return box.y + box.height;
    case "left":
      return box.x;
    case "centre":
      return box.x + box.width / 2;
    case "right":
      return box.x + box.width;
  }
}

/** Centre guides are drawn dashed, edge guides solid. */
export const isCentreAnchor = (anchor: AnchorName): boolean => anchor === "middle" || anchor === "centre";

/** First index whose value is ≥ `value`. */
function lowerBound(list: readonly Guide[], value: number): number {
  let low = 0;
  let high = list.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if ((list[mid] as Guide).value < value) low = mid + 1;
    else high = mid;
  }
  return low;
}

const usable = (box: Box): boolean =>
  box.width > 0 && box.height > 0 && [box.x, box.y, box.width, box.height].every(Number.isFinite);

export class GuideIndex {
  private readonly lists: Record<GuideOrientation, Guide[]> = { horizontal: [], vertical: [] };
  private readonly owners = new Map<string, GuideSource>();

  /** Builds the index in O(n log n). Zero-size and unmeasured steps are skipped. */
  static build(sources: Iterable<GuideSource>): GuideIndex {
    const index = new GuideIndex();
    for (const source of sources) {
      if (!usable(source.box)) continue;
      index.owners.set(source.id, source);
      for (const orientation of ["horizontal", "vertical"] as const) {
        for (const anchor of ANCHORS[orientation]) index.lists[orientation].push(guideOf(source, orientation, anchor));
      }
    }
    index.lists.horizontal.sort((a, b) => a.value - b.value);
    index.lists.vertical.sort((a, b) => a.value - b.value);
    return index;
  }

  /** Adds or replaces one step's six guides in O(log n) searches plus the array shifts. */
  upsert(source: GuideSource): void {
    this.remove(source.id);
    if (!usable(source.box)) return;
    this.owners.set(source.id, source);
    for (const orientation of ["horizontal", "vertical"] as const) {
      const list = this.lists[orientation];
      for (const anchor of ANCHORS[orientation]) {
        const guide = guideOf(source, orientation, anchor);
        list.splice(lowerBound(list, guide.value), 0, guide);
      }
    }
  }

  remove(id: string): void {
    const previous = this.owners.get(id);
    if (!previous) return;
    this.owners.delete(id);
    for (const orientation of ["horizontal", "vertical"] as const) {
      const list = this.lists[orientation];
      for (const anchor of ANCHORS[orientation]) {
        const value = anchorValue(previous.box, anchor);
        for (let at = lowerBound(list, value); at < list.length && (list[at] as Guide).value === value; at += 1) {
          const guide = list[at] as Guide;
          if (guide.ownerId === id && guide.anchor === anchor) {
            list.splice(at, 1);
            break;
          }
        }
      }
    }
  }

  /** Guides with a value in [low, high], in ascending order. */
  range(orientation: GuideOrientation, low: number, high: number): Guide[] {
    const list = this.lists[orientation];
    const result: Guide[] = [];
    for (let at = lowerBound(list, low); at < list.length && (list[at] as Guide).value <= high; at += 1)
      result.push(list[at] as Guide);
    return result;
  }
}

function guideOf(source: GuideSource, orientation: GuideOrientation, anchor: AnchorName): Guide {
  return {
    orientation,
    value: anchorValue(source.box, anchor),
    ownerId: source.id,
    box: source.box,
    anchor,
    color: source.color,
  };
}

export interface Viewport {
  /** Translation in screen pixels. */
  readonly x: number;
  readonly y: number;
  readonly zoom: number;
}

/**
 * The visible part of the canvas in canvas coordinates, from the viewport
 * transform (screen = canvas × zoom + t): x1 = −tx / zoom, y1 = −ty / zoom,
 * and the size is the element's size divided by the zoom.
 */
export function viewportBox(viewport: Viewport, width: number, height: number): Box {
  return {
    x: -viewport.x / viewport.zoom,
    y: -viewport.y / viewport.zoom,
    width: width / viewport.zoom,
    height: height / viewport.zoom,
  };
}

/** 0 when the boxes overlap or touch, otherwise the Euclidean gap between them. */
export function boxGap(a: Box, b: Box): number {
  const gx = Math.max(0, a.x - (b.x + b.width), b.x - (a.x + a.width));
  const gy = Math.max(0, a.y - (b.y + b.height), b.y - (a.y + a.height));
  return Math.hypot(gx, gy);
}

function overlapsOrTouches(a: Box, b: Box): boolean {
  return a.x <= b.x + b.width && b.x <= a.x + a.width && a.y <= b.y + b.height && b.y <= a.y + a.height;
}

/** Two candidates whose distances to the anchor differ by at most this much are ordered by how near their steps are. */
export const TIE_TOLERANCE = 0.5;

/** The guide remembered from the previous frame, per orientation. */
export interface GuidePick {
  readonly ownerId: string;
  readonly anchor: AnchorName;
  /** Which anchor of the moving box matched it. */
  readonly subject: AnchorName;
}

export interface SearchOptions {
  /** Snap radius in canvas units (the screen radius divided by the zoom). */
  readonly radius: number;
  /** The visible canvas; null disables culling. */
  readonly viewport: Box | null;
  /** The moving steps, their descendants and their ancestors. */
  readonly excluded: ReadonlySet<string>;
  /** When set, only this step's guides count. */
  readonly referenceId: string | null;
  /** Only the K nearest steps can produce guides (ignored with a reference step). */
  readonly nearest: number;
  /** The moving box, for measuring how near each candidate step is. */
  readonly subject: Box;
}

interface Candidate {
  readonly guide: Guide;
  readonly lineDistance: number;
  readonly nodeDistance: number;
}

const samePick = (guide: Guide, pick: GuidePick | null, subject: AnchorName): boolean =>
  pick !== null && pick.ownerId === guide.ownerId && pick.anchor === guide.anchor && pick.subject === subject;

/**
 * The best guide for one anchor value `p` of the moving box, or null.
 * Ordering: the previous frame's guide first (hysteresis); otherwise the
 * nearer line, except that lines within TIE_TOLERANCE of each other are
 * ordered by the gap between the boxes (then by line distance and id, so the
 * result is deterministic).
 */
export function findGuide(
  index: GuideIndex,
  orientation: GuideOrientation,
  p: number,
  subjectAnchor: AnchorName,
  options: SearchOptions,
  previous: GuidePick | null,
): Guide | null {
  const { radius, viewport, excluded, referenceId, nearest, subject } = options;
  const candidates: Candidate[] = [];
  for (const guide of index.range(orientation, p - radius, p + radius)) {
    if (excluded.has(guide.ownerId)) continue;
    if (referenceId !== null && guide.ownerId !== referenceId) continue;
    if (viewport && !overlapsOrTouches(guide.box, viewport)) continue;
    candidates.push({ guide, lineDistance: Math.abs(guide.value - p), nodeDistance: boxGap(subject, guide.box) });
  }
  if (candidates.length === 0) return null;

  let kept = candidates;
  if (referenceId === null) {
    const ownerDistance = new Map<string, number>();
    for (const { guide, nodeDistance } of candidates)
      ownerDistance.set(guide.ownerId, Math.min(ownerDistance.get(guide.ownerId) ?? Infinity, nodeDistance));
    const nearestOwners = new Set(
      [...ownerDistance.entries()]
        .sort((a, b) => a[1] - b[1] || (a[0] < b[0] ? -1 : 1))
        .slice(0, Math.max(1, nearest))
        .map(([id]) => id),
    );
    kept = candidates.filter(({ guide }) => nearestOwners.has(guide.ownerId));
  }

  const sticky = kept.find(({ guide }) => samePick(guide, previous, subjectAnchor));
  if (sticky) return sticky.guide;
  kept.sort((a, b) => {
    if (Math.abs(a.lineDistance - b.lineDistance) <= TIE_TOLERANCE && a.nodeDistance !== b.nodeDistance)
      return a.nodeDistance - b.nodeDistance;
    return (
      a.lineDistance - b.lineDistance ||
      (a.guide.ownerId < b.guide.ownerId ? -1 : a.guide.ownerId > b.guide.ownerId ? 1 : 0)
    );
  });
  return (kept[0] as Candidate).guide;
}

export interface ActiveGuides {
  readonly horizontal: Guide | null;
  readonly vertical: Guide | null;
}

export const NO_GUIDES: ActiveGuides = { horizontal: null, vertical: null };

/** Per-gesture memory of the previous frame's guides. Cleared when the gesture ends. */
export interface GuideMemory {
  readonly horizontal: GuidePick | null;
  readonly vertical: GuidePick | null;
}

export const EMPTY_MEMORY: GuideMemory = { horizontal: null, vertical: null };

interface Match {
  readonly guide: Guide;
  readonly subject: AnchorName;
  readonly delta: number;
}

/** Searches the given anchors of `box` and keeps, per orientation, the previous frame's match if present, else the nearest. */
function bestMatch(
  index: GuideIndex,
  orientation: GuideOrientation,
  box: Box,
  anchors: readonly AnchorName[],
  options: SearchOptions,
  previous: GuidePick | null,
): Match | null {
  let best: Match | null = null;
  for (const subject of anchors) {
    const p = anchorValue(box, subject);
    const guide = findGuide(index, orientation, p, subject, options, previous);
    if (!guide) continue;
    const match = { guide, subject, delta: p - guide.value };
    if (samePick(guide, previous, subject)) return match;
    if (!best || Math.abs(match.delta) < Math.abs(best.delta)) best = match;
  }
  return best;
}

const pickOf = (match: Match | null): GuidePick | null =>
  match ? { ownerId: match.guide.ownerId, anchor: match.guide.anchor, subject: match.subject } : null;

export interface SnapResult {
  readonly box: Box;
  readonly guides: ActiveGuides;
  readonly memory: GuideMemory;
}

/** Snaps a moving box: Δ = anchor(proposed) − guide; when |Δ| ≤ r the box moves by −Δ on that axis. */
export function snapMove(
  index: GuideIndex,
  proposed: Box,
  options: Omit<SearchOptions, "subject">,
  memory: GuideMemory,
): SnapResult {
  const search = { ...options, subject: proposed };
  const horizontal = bestMatch(index, "horizontal", proposed, ANCHORS.horizontal, search, memory.horizontal);
  const vertical = bestMatch(index, "vertical", proposed, ANCHORS.vertical, search, memory.vertical);
  const dy = horizontal && Math.abs(horizontal.delta) <= options.radius ? horizontal.delta : 0;
  const dx = vertical && Math.abs(vertical.delta) <= options.radius ? vertical.delta : 0;
  return {
    box: { ...proposed, x: proposed.x - dx, y: proposed.y - dy },
    guides: { horizontal: horizontal?.guide ?? null, vertical: vertical?.guide ?? null },
    memory: { horizontal: pickOf(horizontal), vertical: pickOf(vertical) },
  };
}

/** Which edges a resize handle moves. */
export interface ResizeEdges {
  readonly left: boolean;
  readonly right: boolean;
  readonly top: boolean;
  readonly bottom: boolean;
}

/**
 * Snaps the moving edges of a resized box. Bottom or right: the size becomes
 * guide − top (or guide − left). Top or left: the opposite edge stays where
 * it is, the edge moves to the guide and the size becomes bottom − guide (or
 * right − guide). A snap that would go below the minimum size is not taken.
 */
export function snapResize(
  index: GuideIndex,
  proposed: Box,
  edges: ResizeEdges,
  options: Omit<SearchOptions, "subject">,
  memory: GuideMemory,
  minimum: { readonly width: number; readonly height: number } = { width: 1, height: 1 },
): SnapResult {
  const search = { ...options, subject: proposed };
  const verticalAnchors: AnchorName[] = [
    ...(edges.left ? ["left" as const] : []),
    ...(edges.right ? ["right" as const] : []),
  ];
  const horizontalAnchors: AnchorName[] = [
    ...(edges.top ? ["top" as const] : []),
    ...(edges.bottom ? ["bottom" as const] : []),
  ];
  const vertical = bestMatch(index, "vertical", proposed, verticalAnchors, search, memory.vertical);
  const horizontal = bestMatch(index, "horizontal", proposed, horizontalAnchors, search, memory.horizontal);
  let { x, y, width, height } = proposed;
  let shownVertical: Guide | null = null;
  let shownHorizontal: Guide | null = null;
  if (vertical && Math.abs(vertical.delta) <= options.radius) {
    const right = x + width;
    const next =
      vertical.subject === "left"
        ? { x: vertical.guide.value, width: right - vertical.guide.value }
        : { x, width: vertical.guide.value - x };
    if (next.width >= minimum.width) {
      ({ x, width } = next);
      shownVertical = vertical.guide;
    }
  }
  if (horizontal && Math.abs(horizontal.delta) <= options.radius) {
    const bottom = y + height;
    const next =
      horizontal.subject === "top"
        ? { y: horizontal.guide.value, height: bottom - horizontal.guide.value }
        : { y, height: horizontal.guide.value - y };
    if (next.height >= minimum.height) {
      ({ y, height } = next);
      shownHorizontal = horizontal.guide;
    }
  }
  return {
    box: { x, y, width, height },
    guides: { horizontal: shownHorizontal, vertical: shownVertical },
    memory: {
      horizontal: shownHorizontal ? pickOf(horizontal) : null,
      vertical: shownVertical ? pickOf(vertical) : null,
    },
  };
}

/** A parsed colour as 0–255 channels and an alpha in [0, 1], or null when the string is not a colour we understand. */
export function parseColor(value: string): { r: number; g: number; b: number; a: number } | null {
  const text = value.trim().toLowerCase();
  if (text === "transparent") return { r: 0, g: 0, b: 0, a: 0 };
  const hex = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(text)?.[1];
  if (hex) {
    const full = hex.length <= 4 ? hex.replace(/./g, (digit) => digit + digit) : hex;
    const channel = (at: number) => parseInt(full.slice(at, at + 2), 16);
    return { r: channel(0), g: channel(2), b: channel(4), a: full.length === 8 ? channel(6) / 255 : 1 };
  }
  const rgb = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/.exec(text);
  if (rgb)
    return { r: Number(rgb[1]), g: Number(rgb[2]), b: Number(rgb[3]), a: rgb[4] === undefined ? 1 : Number(rgb[4]) };
  return null;
}

/**
 * The colour a guide takes from its step: the step's fill, unless that fill is
 * missing, transparent, white, black, near-white (every channel ≥ 240) or
 * near-black (every channel ≤ 15). Those would vanish against the canvas or
 * the step, so the guide uses the accent colour instead (null here).
 */
export function guideColor(fill: string | null | undefined): string | null {
  if (!fill) return null;
  const color = parseColor(fill);
  if (!color || color.a === 0) return null;
  const channels = [color.r, color.g, color.b];
  if (channels.every((channel) => channel >= 240) || channels.every((channel) => channel <= 15)) return null;
  return fill;
}
