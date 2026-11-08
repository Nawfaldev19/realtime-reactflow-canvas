import { absolutePosition } from "../document/operations";
import type { DocumentState } from "../document/types";

// Splitting a tall diagram into PDF pages without cutting through a step.
//
// The diagram is scaled to the page's content width and measured in page
// pixels from the top of the exported area. Every node is a unit [top, bottom];
// a group is a unit whose children are its title band and its child nodes.
//
// 1. Blocks: overlapping units are merged (a cut anywhere inside would cut one
//    of them). A merged block that fits on a page stays whole; a taller one is
//    broken down into its members' children (a tall group into its title and
//    contents), recursively, at most six levels deep. What cannot be broken
//    down stays one block. The result is a sorted list of disjoint blocks.
// 2. Greedy packing with the current page end E = page start + U: blocks that
//    end by E are on the page; a block that straddles E and fits on a page
//    moves to the next page, which starts at its top; a block taller than a
//    page is cut at E, E + U, … (unavoidable). Empty space taller than a page
//    is skipped instead of producing blank pages.
//
// The page count everyone shows ("Page n of N", the dialog's preview) comes
// from these slices, so it always matches the file.

export const PX_PER_INCH = 96;

export const PAPERS = {
  letter: { label: "Letter (8.5 × 11 in)", width: 8.5, height: 11 },
  legal: { label: "Legal (8.5 × 14 in)", width: 8.5, height: 14 },
  a4: { label: "A4 (8.27 × 11.69 in)", width: 8.27, height: 11.69 },
  a3: { label: "A3 (11.7 × 16.5 in)", width: 11.7, height: 16.5 },
} as const;

export type Paper = keyof typeof PAPERS;
export type Orientation = "portrait" | "landscape";

export interface PageSize {
  readonly width: number;
  readonly height: number;
}

/** Page size in CSS pixels at 96 per inch; landscape swaps the sides. */
export function pageSize(paper: Paper, orientation: Orientation): PageSize {
  const { width, height } = PAPERS[paper];
  const portrait = { width: Math.round(width * PX_PER_INCH), height: Math.round(height * PX_PER_INCH) };
  return orientation === "portrait" ? portrait : { width: portrait.height, height: portrait.width };
}

/** Padding around the content, the footer band for the page number, and the gap above it. */
export const PAGE_LAYOUT = { padding: 30, footer: 40, gap: 10 } as const;

export interface PageFrame {
  readonly contentWidth: number;
  /** U: the height of diagram that fits on one page. */
  readonly usableHeight: number;
}

export function pageFrame(page: PageSize): PageFrame {
  const { padding, footer, gap } = PAGE_LAYOUT;
  return { contentWidth: page.width - 2 * padding, usableHeight: page.height - 2 * padding - footer - gap };
}

export interface Unit {
  readonly top: number;
  readonly bottom: number;
  readonly children: readonly Unit[];
}

export interface Interval {
  readonly top: number;
  readonly bottom: number;
}

export const MAX_DEPTH = 6;

interface Cluster {
  top: number;
  bottom: number;
  readonly members: Unit[];
}

/** Disjoint, sorted blocks that should not be cut (see step 1 above). */
export function blocksOf(units: readonly Unit[], usable: number, depth = 0): Interval[] {
  const sorted = [...units].sort((a, b) => a.top - b.top || a.bottom - b.bottom);
  const clusters: Cluster[] = [];
  for (const unit of sorted) {
    const last = clusters.at(-1);
    if (last && unit.top < last.bottom) {
      last.bottom = Math.max(last.bottom, unit.bottom);
      last.members.push(unit);
    } else {
      clusters.push({ top: unit.top, bottom: unit.bottom, members: [unit] });
    }
  }
  return clusters.flatMap((cluster): Interval[] => {
    const divisible = cluster.members.some((member) => member.children.length > 0);
    if (cluster.bottom - cluster.top <= usable || depth >= MAX_DEPTH || !divisible)
      return [{ top: cluster.top, bottom: cluster.bottom }];
    return blocksOf(
      cluster.members.flatMap((member) => (member.children.length > 0 ? member.children : [member])),
      usable,
      depth + 1,
    );
  });
}

/** Page slices for content of height `total` (step 2 above). Always at least one page; never a blank one. */
export function packPages(blocks: readonly Interval[], usable: number, total: number): Interval[] {
  const slices: Interval[] = [];
  let start = 0;
  let end = usable;
  let filled = false;
  /** Ends the current page at `cut` (dropped if nothing is on it) and starts the next at `resume`. */
  const close = (cut: number, resume: number) => {
    if (filled) slices.push({ top: start, bottom: cut });
    start = resume;
    end = start + usable;
    filled = false;
  };
  for (const block of blocks) {
    if (block.bottom > end && block.top >= end) {
      // Contiguous pages, unless that would leave a blank page: then the next page starts at the block.
      close(end, filled && block.top < end + usable ? end : block.top);
    }
    if (block.bottom > end && block.bottom - block.top <= usable && block.top > start) close(block.top, block.top);
    filled = true;
    while (block.bottom > end) {
      close(end, end);
      filled = true;
    }
  }
  if (filled || slices.length === 0) slices.push({ top: start, bottom: Math.max(start, Math.min(end, total)) });
  return slices;
}

export const paginate = (units: readonly Unit[], usable: number, total: number): Interval[] =>
  packPages(blocksOf(units, usable), usable, total);

/** Height of a group's title band, in canvas units, kept with the group's first row. */
export const GROUP_TITLE_BAND = 40;

/**
 * The document's nodes as units, in page pixels: y measured from `originY`
 * (the top of the exported area, canvas units) and multiplied by `scale`.
 */
export function documentUnits(doc: DocumentState, originY: number, scale: number): Unit[] {
  const children = new Map<string | null, string[]>();
  for (const node of Object.values(doc.nodes)) {
    const parent = node.parentId !== null && node.parentId in doc.nodes ? node.parentId : null;
    children.set(parent, [...(children.get(parent) ?? []), node.id]);
  }
  const unitOf = (id: string, seen: ReadonlySet<string>): Unit[] => {
    const node = doc.nodes[id];
    if (!node || seen.has(id)) return [];
    const top = (absolutePosition(doc, id).y - originY) * scale;
    const bottom = top + node.size.height * scale;
    const inside = new Set(seen).add(id);
    const contents = (children.get(id) ?? []).flatMap((child) => unitOf(child, inside));
    const band =
      node.kind === "group" ? [{ top, bottom: Math.min(bottom, top + GROUP_TITLE_BAND * scale), children: [] }] : [];
    return [{ top, bottom, children: contents.length > 0 || band.length > 0 ? [...band, ...contents] : [] }];
  };
  return (children.get(null) ?? []).flatMap((id) => unitOf(id, new Set()));
}
