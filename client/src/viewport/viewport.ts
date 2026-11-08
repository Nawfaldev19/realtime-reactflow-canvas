import type { Viewport } from "../geometry/guides";
import { clamp, type Box, type Vec } from "../geometry/vector";

// Every view command is a pure function that returns a viewport; the canvas
// only applies the result. One transform is used everywhere:
//
//   screen = flow × zoom + (x, y)        flow = (screen − (x, y)) / zoom
//
// where (x, y) is the translation in screen pixels of the canvas element and
// zoom is a fraction (1 = 100%). Bounds are absolute flow-unit boxes (children
// of groups already converted from relative to absolute), computed from the
// stored step sizes, never from the DOM, so they are right even while steps
// are hidden for the reveal animation.

export type { Viewport };

export interface CanvasSize {
  readonly width: number;
  readonly height: number;
}

export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 2;
/** Automatic fits never magnify above actual size. */
export const FIT_MAX_ZOOM = 1;
/** The factor of the zoom-in and zoom-out buttons. */
export const ZOOM_STEP = 1.2;
/** Fit width: the diagram fills 1 / (1 + p) ≈ 91% of the canvas width. */
export const FIT_WIDTH_PADDING = 0.1;
/** Fit width and custom zoom: the diagram's top edge sits this many screen pixels below the canvas top. */
export const TOP_INSET = 60;
/** Fit all: margin on every side, as a fraction of the canvas size. */
export const FIT_MARGIN = 0.1;
/** The view of an empty diagram. */
export const HOME: Viewport = { x: 0, y: 0, zoom: 1 };

export const clampZoom = (zoom: number, max = MAX_ZOOM): number => clamp(zoom, MIN_ZOOM, max);

/** A zoom at the limits of the range, compared on the real value (not a rounded label). */
export const canZoomIn = (zoom: number): boolean => zoom < MAX_ZOOM;
export const canZoomOut = (zoom: number): boolean => zoom > MIN_ZOOM;

/** Zooms to `zoom` (clamped) keeping the flow point under the screen point `anchor` fixed. */
export function zoomTo(viewport: Viewport, zoom: number, anchor: Vec): Viewport {
  const next = clampZoom(zoom);
  const ratio = next / viewport.zoom;
  return { x: anchor.x - (anchor.x - viewport.x) * ratio, y: anchor.y - (anchor.y - viewport.y) * ratio, zoom: next };
}

export const zoomBy = (viewport: Viewport, factor: number, anchor: Vec): Viewport =>
  zoomTo(viewport, viewport.zoom * factor, anchor);

export const canvasCentre = (size: CanvasSize): Vec => ({ x: size.width / 2, y: size.height / 2 });

/** Puts the flow point `point` at the canvas centre. */
export function centreOn(size: CanvasSize, point: Vec, zoom = 1): Viewport {
  const z = clampZoom(zoom);
  return { x: size.width / 2 - point.x * z, y: size.height / 2 - point.y * z, zoom: z };
}

const centreOf = (bounds: Box): Vec => ({ x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 });

export interface FitAllOptions {
  /** Margin on every side as a fraction of the canvas size. */
  readonly margin?: number;
  /** A screen-pixel nudge (for example half a footer's height); never a flow-unit constant. */
  readonly offsetY?: number;
}

/** The whole diagram, centred both ways, with a margin, at most 100%. Degenerate bounds are centred at 100%. */
export function fitAll(
  size: CanvasSize,
  bounds: Box,
  { margin = FIT_MARGIN, offsetY = 0 }: FitAllOptions = {},
): Viewport {
  const centre = centreOf(bounds);
  if (bounds.width <= 0 || bounds.height <= 0) {
    const view = centreOn(size, centre);
    return { ...view, y: view.y + offsetY };
  }
  const zoom = clampZoom(
    Math.min((size.width * (1 - 2 * margin)) / bounds.width, (size.height * (1 - 2 * margin)) / bounds.height),
    FIT_MAX_ZOOM,
  );
  return { x: size.width / 2 - centre.x * zoom, y: size.height / 2 - centre.y * zoom + offsetY, zoom };
}

export interface TopAnchoredOptions {
  /** Screen pixels between the canvas top and the diagram's top edge. */
  readonly topInset?: number;
}

/** A given zoom with the diagram centred horizontally and its top edge `topInset` screen pixels below the canvas top. */
export function topAnchored(
  size: CanvasSize,
  bounds: Box,
  zoom: number,
  { topInset = TOP_INSET }: TopAnchoredOptions = {},
): Viewport {
  const z = clampZoom(zoom);
  return { x: size.width / 2 - (bounds.x + bounds.width / 2) * z, y: topInset - bounds.y * z, zoom: z };
}

/**
 * The default opening view and "Go to start": the full width fills about 91%
 * of the canvas, at most 100%, centred horizontally, top edge anchored. A
 * diagram without width falls back to fitting all of it.
 */
export function fitWidth(size: CanvasSize, bounds: Box, options: TopAnchoredOptions = {}): Viewport {
  if (bounds.width <= 0) return fitAll(size, bounds);
  return topAnchored(
    size,
    bounds,
    clampZoom(size.width / (bounds.width * (1 + FIT_WIDTH_PADDING)), FIT_MAX_ZOOM),
    options,
  );
}

export const OPENING_MODES = ["fitWidth", "fitAll", "custom", "saved"] as const;
export type OpeningMode = (typeof OPENING_MODES)[number];

export interface OpeningView {
  readonly mode: OpeningMode;
  /** Custom zoom in percent, 10–200. */
  readonly customPercent: number;
  /** The view stored with "Save current view". */
  readonly savedViewport: Viewport | null;
}

/** A stored viewport, used verbatim apart from clamping its zoom to the limits. */
export const restoreViewport = (viewport: Viewport): Viewport => ({ ...viewport, zoom: clampZoom(viewport.zoom) });

/**
 * The view a diagram opens with. Null while the canvas has no size yet (a
 * hidden tab): the caller waits for a non-zero size and asks again. An empty
 * diagram opens at the origin at 100% unless a saved view exists.
 */
export function openingViewport(
  view: OpeningView,
  size: CanvasSize,
  bounds: Box | null,
  options: TopAnchoredOptions = {},
): Viewport | null {
  if (size.width <= 0 || size.height <= 0) return null;
  if (view.mode === "saved" && view.savedViewport) return restoreViewport(view.savedViewport);
  if (!bounds) return HOME;
  switch (view.mode) {
    case "fitAll":
      return fitAll(size, bounds);
    case "custom":
      return topAnchored(size, bounds, view.customPercent / 100, options);
    case "fitWidth":
    case "saved":
      return fitWidth(size, bounds, options);
  }
}

/** The zoom as the label shows it: a rounded percentage. */
export const zoomPercent = (zoom: number): number => Math.round(zoom * 100);
