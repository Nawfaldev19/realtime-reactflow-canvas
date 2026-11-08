import { clamp } from "../geometry/vector";
import { MAX_ZOOM, MIN_ZOOM, OPENING_MODES, type OpeningMode, type OpeningView, type Viewport } from "./viewport";

// The diagram's view settings as stored next to the document (the server's
// `view_settings` column, checked there by ViewSettings): the opening view,
// the editing background, the reveal animation switch and the editors'
// snapping settings. Reading is defensive: any missing or malformed part
// falls back to its default, so an older row or a hand-edited value never
// breaks opening a diagram.

export const BACKGROUND_PATTERNS = ["dots", "lines", "cross", "none"] as const;
export type BackgroundPattern = (typeof BACKGROUND_PATTERNS)[number];

export interface BackgroundSettings {
  readonly pattern: BackgroundPattern;
  readonly gap: number;
}

export interface SnappingSettings {
  readonly enabled: boolean;
  /** Only the K nearest steps produce guides. */
  readonly nearest: number;
}

export interface ViewSettings {
  readonly openingView: OpeningView;
  readonly background: BackgroundSettings;
  readonly animateOnOpen: boolean;
  readonly snapping: SnappingSettings;
}

export const CUSTOM_PERCENT = { min: 10, max: 200, step: 5, initial: 70 } as const;
export const NEAREST_RANGE = { min: 1, max: 10 } as const;
const GAP_RANGE = { min: 4, max: 200 } as const;

export const DEFAULT_VIEW_SETTINGS: ViewSettings = {
  openingView: { mode: "fitWidth", customPercent: CUSTOM_PERCENT.initial, savedViewport: null },
  background: { pattern: "dots", gap: 20 },
  animateOnOpen: false,
  snapping: { enabled: true, nearest: 2 },
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isFiniteNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const oneOf = <T extends string>(options: readonly T[], value: unknown, fallback: T): T =>
  (options as readonly unknown[]).includes(value) ? (value as T) : fallback;

/** Clamps a typed custom zoom into 10–200 (the number field does this on blur); anything unreadable becomes the default 70. */
export function clampPercent(value: number): number {
  return Number.isFinite(value)
    ? Math.round(clamp(value, CUSTOM_PERCENT.min, CUSTOM_PERCENT.max))
    : CUSTOM_PERCENT.initial;
}

export const clampNearest = (value: number): number =>
  Number.isFinite(value)
    ? Math.round(clamp(value, NEAREST_RANGE.min, NEAREST_RANGE.max))
    : DEFAULT_VIEW_SETTINGS.snapping.nearest;

function readViewport(value: unknown): Viewport | null {
  if (!isRecord(value) || !isFiniteNumber(value.x) || !isFiniteNumber(value.y) || !isFiniteNumber(value.zoom))
    return null;
  return { x: value.x, y: value.y, zoom: clamp(value.zoom, MIN_ZOOM, MAX_ZOOM) };
}

function readOpeningView(value: unknown): OpeningView {
  const fallback = DEFAULT_VIEW_SETTINGS.openingView;
  if (!isRecord(value)) return fallback;
  const savedViewport = readViewport(value.savedViewport);
  const mode: OpeningMode = oneOf(OPENING_MODES, value.mode, fallback.mode);
  return {
    // A saved view without a stored viewport cannot be shown; fit width is the documented fallback.
    mode: mode === "saved" && !savedViewport ? "fitWidth" : mode,
    customPercent: isFiniteNumber(value.customPercent) ? clampPercent(value.customPercent) : fallback.customPercent,
    savedViewport,
  };
}

export function parseViewSettings(raw: unknown): ViewSettings {
  const value = isRecord(raw) ? raw : {};
  const background = isRecord(value.background) ? value.background : {};
  const snapping = isRecord(value.snapping) ? value.snapping : {};
  const defaults = DEFAULT_VIEW_SETTINGS;
  return {
    openingView: readOpeningView(value.openingView),
    background: {
      pattern: oneOf(BACKGROUND_PATTERNS, background.pattern, defaults.background.pattern),
      gap: isFiniteNumber(background.gap)
        ? Math.round(clamp(background.gap, GAP_RANGE.min, GAP_RANGE.max))
        : defaults.background.gap,
    },
    animateOnOpen: typeof value.animateOnOpen === "boolean" ? value.animateOnOpen : defaults.animateOnOpen,
    snapping: {
      enabled: typeof snapping.enabled === "boolean" ? snapping.enabled : defaults.snapping.enabled,
      nearest: isFiniteNumber(snapping.nearest) ? clampNearest(snapping.nearest) : defaults.snapping.nearest,
    },
  };
}

/** Rounds a viewport for storage (0.01 px, 0.0001 zoom), keeping it within ±0.5 px of the original. */
export const storableViewport = (viewport: Viewport): Viewport => ({
  x: Math.round(viewport.x * 100) / 100,
  y: Math.round(viewport.y * 100) / 100,
  zoom: Math.round(clamp(viewport.zoom, MIN_ZOOM, MAX_ZOOM) * 10_000) / 10_000,
});
