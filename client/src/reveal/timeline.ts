import type { DocumentState } from "../document/types";
import type { RevealItem } from "./order";

// The schedule of the build-up animation, planned once from the reveal order.
//
//   item i starts at t_i = stagger × i
//   node:       fades 0 → 1 over `fade` (ease-out)
//   connectors: draw from source to target over `draw` (linear), all of one
//               step's connectors together; the label fades in from
//               +labelDelay for `labelFade`; the arrowhead appears at +draw.
//
// A connector's target must not appear after the line arrives: its start is
// pulled forward to (connector end − fade) when needed, so it is fully visible
// as the line reaches it. Groups start no later than anything inside them.
// Long diagrams keep the total under `maxTotal` by shortening the stagger.

export interface RevealTiming {
  readonly stagger: number;
  readonly fade: number;
  readonly draw: number;
  readonly labelDelay: number;
  readonly labelFade: number;
  /** Upper bound for the whole animation in ms, or null for none. */
  readonly maxTotal: number | null;
}

export const REVEAL_TIMING: RevealTiming = {
  stagger: 100,
  fade: 250,
  draw: 400,
  labelDelay: 200,
  labelFade: 150,
  maxTotal: 6000,
};

export interface NodeCue {
  readonly kind: "node";
  readonly id: string;
  readonly start: number;
  readonly end: number;
}

export interface ConnectorCue {
  readonly kind: "connectors";
  readonly source: string;
  readonly ids: readonly string[];
  readonly start: number;
  readonly labelStart: number;
  readonly labelEnd: number;
  /** The line reaches the target and the arrowhead appears. */
  readonly end: number;
}

export type Cue = NodeCue | ConnectorCue;

export interface Timeline {
  /** In reveal order. */
  readonly cues: readonly Cue[];
  readonly total: number;
  readonly stagger: number;
}

/** The stagger that keeps `count` items within `maxTotal`, given the longest single effect. */
export function staggerFor(count: number, timing: RevealTiming): number {
  const tail = Math.max(timing.fade, timing.draw);
  if (timing.maxTotal === null || count < 2) return timing.stagger;
  return Math.max(0, Math.min(timing.stagger, (timing.maxTotal - tail) / (count - 1)));
}

export function planReveal(
  doc: DocumentState,
  items: readonly RevealItem[],
  timing: RevealTiming = REVEAL_TIMING,
): Timeline {
  const stagger = staggerFor(items.length, timing);
  const nodeStart = new Map<string, number>();
  items.forEach((item, index) => {
    if (item.kind === "node") nodeStart.set(item.id, index * stagger);
  });

  // Targets appear no later than their connector arrives.
  items.forEach((item, index) => {
    if (item.kind !== "connectors") return;
    const deadline = index * stagger + timing.draw - timing.fade;
    for (const id of item.ids) {
      const target = doc.edges[id]?.target;
      const start = target === undefined ? undefined : nodeStart.get(target);
      if (target !== undefined && start !== undefined && start > deadline) nodeStart.set(target, Math.max(0, deadline));
    }
  });

  // Groups appear no later than their contents.
  for (const [id, start] of nodeStart) {
    const seen = new Set<string>();
    for (
      let parent = doc.nodes[id]?.parentId ?? null;
      parent !== null && !seen.has(parent);
      parent = doc.nodes[parent]?.parentId ?? null
    ) {
      seen.add(parent);
      const parentStart = nodeStart.get(parent);
      if (parentStart !== undefined && parentStart > start) nodeStart.set(parent, start);
    }
  }

  let total = 0;
  const cues = items.map((item, index): Cue => {
    if (item.kind === "node") {
      const start = nodeStart.get(item.id) ?? index * stagger;
      total = Math.max(total, start + timing.fade);
      return { kind: "node", id: item.id, start, end: start + timing.fade };
    }
    const start = index * stagger;
    total = Math.max(total, start + timing.draw);
    return {
      kind: "connectors",
      source: item.source,
      ids: item.ids,
      start,
      labelStart: start + timing.labelDelay,
      labelEnd: start + timing.labelDelay + timing.labelFade,
      end: start + timing.draw,
    };
  });
  return { cues, total, stagger };
}

export type NodePhase = "hidden" | "fading" | "shown";
/** drawing: the line grows; labelling: the label fades in while the line finishes; shown: arrowhead on. */
export type ConnectorPhase = "hidden" | "drawing" | "labelling" | "shown";

export interface PhaseChange {
  readonly at: number;
  readonly target: "node" | "connector";
  readonly id: string;
  readonly phase: NodePhase | ConnectorPhase;
}

/** Every phase change of the timeline, in time order (stable for equal times). */
export function phaseChanges(timeline: Timeline): PhaseChange[] {
  const changes: PhaseChange[] = [];
  for (const cue of timeline.cues) {
    if (cue.kind === "node") {
      changes.push(
        { at: cue.start, target: "node", id: cue.id, phase: "fading" },
        { at: cue.end, target: "node", id: cue.id, phase: "shown" },
      );
      continue;
    }
    for (const id of cue.ids) {
      changes.push(
        { at: cue.start, target: "connector", id, phase: "drawing" },
        { at: cue.labelStart, target: "connector", id, phase: "labelling" },
        { at: cue.end, target: "connector", id, phase: "shown" },
      );
    }
  }
  return changes.sort((a, b) => a.at - b.at);
}
