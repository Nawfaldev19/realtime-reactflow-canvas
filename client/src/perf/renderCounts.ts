// Render counters for the stress page, the benchmark and the render-count
// tests. Components call countRender() in their render body; while counting
// is off (the normal editor) that is one boolean check. Counting renders, not
// effects, is deliberate: a render that React throws away still costs time.

export const RENDER_KINDS = ["root", "flow", "frame", "content", "edge"] as const;
/**
 * root: the editor canvas component; flow: the layer that feeds the canvas
 * library; frame: a node's outer component, which the library re-renders when
 * the node moves; content: a node's body and anatomy; edge: a connector.
 */
export type RenderKind = (typeof RENDER_KINDS)[number];

export interface KindCount {
  readonly total: number;
  /** Renders per element id. */
  readonly ids: Readonly<Record<string, number>>;
}

export type RenderSummary = Readonly<Record<RenderKind, KindCount>>;

let counting = false;
let counts = new Map<RenderKind, Map<string, number>>();

export function startCounting(): void {
  counting = true;
  counts = new Map();
}

export function stopCounting(): void {
  counting = false;
}

/** Clears the counts and keeps counting. */
export function resetCounts(): void {
  counts = new Map();
}

export function countRender(kind: RenderKind, id = ""): void {
  if (!counting) return;
  let perId = counts.get(kind);
  if (!perId) {
    perId = new Map();
    counts.set(kind, perId);
  }
  perId.set(id, (perId.get(id) ?? 0) + 1);
}

export function renderSummary(): RenderSummary {
  const entry = (kind: RenderKind): KindCount => {
    const perId = counts.get(kind) ?? new Map<string, number>();
    let total = 0;
    for (const value of perId.values()) total += value;
    return { total, ids: Object.fromEntries(perId) };
  };
  return {
    root: entry("root"),
    flow: entry("flow"),
    frame: entry("frame"),
    content: entry("content"),
    edge: entry("edge"),
  };
}
