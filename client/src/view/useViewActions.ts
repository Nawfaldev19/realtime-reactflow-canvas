import { useMemo } from "react";
import { useReactFlow, useStoreApi } from "@xyflow/react";
import { prefersReducedMotion } from "../lib/motion";
import { useEditorStoreApi } from "../editor/EditorStoreContext";
import { diagramBounds } from "../viewport/bounds";
import {
  canvasCentre,
  fitAll,
  fitWidth,
  HOME,
  openingViewport,
  zoomBy,
  zoomTo,
  ZOOM_STEP,
  type CanvasSize,
  type OpeningView,
  type Viewport,
} from "../viewport/viewport";

// The view commands of one canvas, computed by the pure functions in
// src/viewport and applied through the canvas library. Buttons and fits
// animate (100–200 ms; instantly with reduced motion); direct manipulation
// (the slider, scrollbars, keys) applies at once.

/** Half the floating view footer: fit-all moves the diagram up by this many screen pixels so the footer does not cover it. */
export const FIT_OFFSET_Y = -22;

const ZOOM_MS = 100;
const FIT_MS = 200;

export interface ViewActions {
  readonly size: () => CanvasSize;
  readonly current: () => Viewport;
  readonly apply: (viewport: Viewport, durationMs?: number) => void;
  readonly goToStart: () => void;
  readonly fit: () => void;
  readonly zoomIn: () => void;
  readonly zoomOut: () => void;
  readonly zoomToPercent: (percent: number, durationMs?: number) => void;
  readonly showOpening: (view: OpeningView, durationMs?: number) => void;
}

export function useViewActions(): ViewActions {
  const flow = useReactFlow();
  const canvas = useStoreApi();
  const api = useEditorStoreApi();

  return useMemo(() => {
    const size = (): CanvasSize => ({ width: canvas.getState().width, height: canvas.getState().height });
    const current = (): Viewport => flow.getViewport();
    const apply = (viewport: Viewport, durationMs = 0) => {
      void flow.setViewport(viewport, { duration: prefersReducedMotion() ? 0 : durationMs });
    };
    const bounds = () => diagramBounds(api.getState().doc);
    const withBounds = (view: (box: NonNullable<ReturnType<typeof bounds>>) => Viewport) => {
      const box = bounds();
      apply(box ? view(box) : HOME, FIT_MS);
    };
    return {
      size,
      current,
      apply,
      goToStart: () => withBounds((box) => fitWidth(size(), box)),
      fit: () => withBounds((box) => fitAll(size(), box, { offsetY: FIT_OFFSET_Y })),
      zoomIn: () => apply(zoomBy(current(), ZOOM_STEP, canvasCentre(size())), ZOOM_MS),
      zoomOut: () => apply(zoomBy(current(), 1 / ZOOM_STEP, canvasCentre(size())), ZOOM_MS),
      zoomToPercent: (percent, durationMs = ZOOM_MS) =>
        apply(zoomTo(current(), percent / 100, canvasCentre(size())), durationMs),
      showOpening: (view, durationMs = FIT_MS) => {
        const next = openingViewport(view, size(), bounds());
        if (next) apply(next, durationMs);
      },
    };
  }, [flow, canvas, api]);
}
