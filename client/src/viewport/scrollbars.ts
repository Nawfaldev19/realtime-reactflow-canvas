import { clamp } from "../geometry/vector";

// Custom scrollbars from viewport and extent algebra, one axis at a time.
//
// The scroll position is the negated translation, s = −x (or −y): moving the
// view right means a more negative x. Its valid range follows from keeping the
// visible part inside the extent [min, max] (flow units) at zoom z on a canvas
// of `length` screen pixels:
//
//   visible start = −x / z ≥ min           →  s ≥ min·z
//   visible end   = (length − x) / z ≤ max →  s ≤ max·z − length
//
// A bar is shown only when that range is not empty. The thumb is as long as
// the visible fraction of the extent (at least 24 px), and its offset maps
// [min·z, max·z − length] linearly onto [0, track − thumb]. Offsets are
// measured from the top (or left) of the track, so for the vertical bar the
// thumb at the top means viewing the top: no separate inversion is needed
// beyond s = −y. (A ready-made slider with its maximum at the top would need
// its value to be y instead.)

export const MIN_THUMB = 24;
/** Bars stop this many screen pixels short of each end of the canvas. */
export const SCROLLBAR_INSET = 50;
/** Arrow keys on a focused thumb scroll by this many screen pixels. */
export const KEY_STEP = 20;

export interface AxisInput {
  /** Extent in flow units along this axis. */
  readonly min: number;
  readonly max: number;
  /** The viewport translation along this axis (x or y), screen pixels. */
  readonly translate: number;
  readonly zoom: number;
  /** Canvas width or height, screen pixels. */
  readonly length: number;
  /** Track length, screen pixels. */
  readonly track: number;
}

export interface AxisModel {
  readonly visible: boolean;
  /** Scroll range (s = −translate), screen pixels. */
  readonly lo: number;
  readonly hi: number;
  readonly position: number;
  readonly thumb: number;
  /** Thumb offset from the start of the track. */
  readonly offset: number;
  readonly track: number;
  readonly length: number;
}

export const scrollOf = (translate: number): number => -translate;
export const translateOf = (scroll: number): number => -scroll;

export function scrollAxis({ min, max, translate, zoom, length, track }: AxisInput): AxisModel {
  const lo = min * zoom;
  const hi = max * zoom - length;
  const position = scrollOf(translate);
  const visible = hi > lo && track > 0;
  const fraction = Math.min(1, length / ((max - min) * zoom));
  const thumb = Math.min(track, Math.max(MIN_THUMB, fraction * track));
  const offset = visible ? clamp((position - lo) / (hi - lo), 0, 1) * (track - thumb) : 0;
  return { visible, lo, hi, position, thumb, offset, track, length };
}

/** The translation for a scroll position, kept inside the range. */
export const translateForScroll = (axis: AxisModel, scroll: number): number =>
  translateOf(clamp(scroll, axis.lo, axis.hi));

/** The translation that puts the thumb at `offset` (dragging). */
export function translateForThumb(axis: AxisModel, offset: number): number {
  const room = axis.track - axis.thumb;
  const t = room > 0 ? clamp(offset, 0, room) / room : 0;
  return translateOf(axis.lo + t * (axis.hi - axis.lo));
}

/** Clicking the track pages by one canvas length toward the click. */
export function translateForTrackClick(axis: AxisModel, at: number): number {
  const direction = at < axis.offset ? -1 : 1;
  return translateForScroll(axis, axis.position + direction * axis.length);
}

/** The scroll change for a key on a focused thumb, or null for other keys. Up and left scroll back. */
export function scrollKeyDelta(key: string, length: number): number | null {
  switch (key) {
    case "ArrowDown":
    case "ArrowRight":
      return KEY_STEP;
    case "ArrowUp":
    case "ArrowLeft":
      return -KEY_STEP;
    case "PageDown":
      return length;
    case "PageUp":
      return -length;
    case "End":
      return Infinity;
    case "Home":
      return -Infinity;
    default:
      return null;
  }
}

/** How far along the range the view is, 0–100, for assistive technology. */
export const scrollPercent = (axis: AxisModel): number =>
  axis.hi > axis.lo ? Math.round(((axis.position - axis.lo) / (axis.hi - axis.lo)) * 100) : 0;
