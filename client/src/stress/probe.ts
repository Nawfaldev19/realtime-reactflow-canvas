import type { EditorStoreApi } from "../editor/store";
import type { PerfFlags } from "../perf/flags";
import { renderSummary, resetCounts, type RenderSummary } from "../perf/renderCounts";
import type { StressDiagram } from "./generate";

// What the stress page exposes to the benchmark script (scripts/benchmark.ts)
// on `window.__liveCanvasStress`. Only the stress page installs it.

export const INITIAL_RENDER_MEASURE = "stress:initial-render";
export const START_MARK = "stress:start";
export const READY_MARK = "stress:ready";

export interface StressProbe {
  readonly size: number;
  readonly counts: StressDiagram["counts"];
  readonly flags: PerfFlags;
  /** The first frame after the opening view was applied and the visible nodes were mounted. */
  readonly ready: boolean;
  /** Milliseconds from loading the document into the store to that frame. */
  readonly initialRenderMs: number | null;
  readonly renders: () => RenderSummary;
  readonly resetRenders: () => void;
  /** Operations applied since the page opened (the store's local sequence number). */
  readonly operations: () => number;
  /** Node elements currently mounted by the canvas. */
  readonly mountedNodes: () => number;
}

declare global {
  interface Window {
    __liveCanvasStress?: StressProbe;
  }
}

export function installProbe(
  api: EditorStoreApi,
  diagram: StressDiagram,
  size: number,
  flags: PerfFlags,
  initialRenderMs: number | null,
): StressProbe {
  const probe: StressProbe = {
    size,
    counts: diagram.counts,
    flags,
    ready: initialRenderMs !== null,
    initialRenderMs,
    renders: renderSummary,
    resetRenders: resetCounts,
    operations: () => api.getState().localSeq,
    mountedNodes: () => document.querySelectorAll(".react-flow__node").length,
  };
  window.__liveCanvasStress = probe;
  return probe;
}

/** Marks the end of the initial render and returns its duration. */
export function finishInitialRender(): number {
  performance.mark(READY_MARK);
  return performance.measure(INITIAL_RENDER_MEASURE, START_MARK, READY_MARK).duration;
}
