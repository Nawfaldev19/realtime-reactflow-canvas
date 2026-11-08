import { describe, expect, it } from "vitest";
import { seededRandom } from "../test/random";
import {
  MIN_THUMB,
  scrollAxis,
  scrollKeyDelta,
  scrollOf,
  scrollPercent,
  translateForScroll,
  translateForThumb,
  translateForTrackClick,
  translateOf,
  type AxisInput,
} from "./scrollbars";

// Horizontal axis: extent [−800, 2800] (3600 units), canvas 1100 px wide, track 1000 px.
const BASE: AxisInput = { min: -800, max: 2800, translate: 0, zoom: 1, length: 1100, track: 1000 };

describe("scroll range", () => {
  it("derives [min·z, max·z − W] and s = −x (worked example)", () => {
    const axis = scrollAxis({ ...BASE, translate: -400 });
    expect(axis.lo).toBe(-800);
    expect(axis.hi).toBe(2800 - 1100);
    expect(axis.position).toBe(400);
    expect(axis.visible).toBe(true);
  });

  it("puts the extent's left edge at the canvas left at the minimum, and its right edge at the canvas right at the maximum", () => {
    for (const zoom of [0.5, 1, 1.7]) {
      const axis = scrollAxis({ ...BASE, zoom });
      const atMin = translateForScroll(axis, -Infinity);
      const atMax = translateForScroll(axis, Infinity);
      // Screen x of the extent edges: flow × zoom + translate.
      expect(BASE.min * zoom + atMin).toBeCloseTo(0, 6);
      expect(BASE.max * zoom + atMax).toBeCloseTo(BASE.length, 6);
    }
  });

  it("hides the bar when the whole extent fits", () => {
    // 3600 × 0.25 = 900 < 1100.
    const axis = scrollAxis({ ...BASE, zoom: 0.25 });
    expect(axis.visible).toBe(false);
    expect(axis.offset).toBe(0);
    expect(scrollPercent(axis)).toBe(0);
    expect(scrollAxis({ ...BASE, track: 0 }).visible).toBe(false);
  });

  it("inverts the translation", () => {
    expect(scrollOf(-250)).toBe(250);
    expect(translateOf(250)).toBe(-250);
  });
});

describe("thumb", () => {
  it("is as long as the visible fraction of the track (worked example)", () => {
    // f = 1100 / 3600 → thumb = 305.6 px of a 1000 px track.
    expect(scrollAxis(BASE).thumb).toBeCloseTo((1100 / 3600) * 1000, 9);
  });

  it("is at least 24 px and never longer than the track", () => {
    expect(scrollAxis({ ...BASE, zoom: 2, min: -80_000, max: 80_000 }).thumb).toBe(MIN_THUMB);
    expect(scrollAxis({ ...BASE, zoom: 0.25 }).thumb).toBe(1000);
    expect(scrollAxis({ ...BASE, track: 10 }).thumb).toBe(10);
  });

  it("sits at the start of the track at the minimum and at the end at the maximum", () => {
    const start = scrollAxis({ ...BASE, translate: 800 });
    expect(start.offset).toBe(0);
    const end = scrollAxis({ ...BASE, translate: -(2800 - 1100) });
    expect(end.offset).toBeCloseTo(1000 - end.thumb, 9);
    expect(scrollPercent(end)).toBe(100);
  });

  it("means 'viewing the top' when the vertical thumb is at the top", () => {
    // Vertical axis: extent [−800, 5800], canvas 800 px tall. Thumb at offset 0 → y = 800: the extent's top at the canvas top.
    const vertical = scrollAxis({ min: -800, max: 5800, translate: -1000, zoom: 1, length: 800, track: 700 });
    const y = translateForThumb(vertical, 0);
    expect(-800 * 1 + y).toBe(0);
  });

  it("maps thumb drags back to the same scroll position (property)", () => {
    const random = seededRandom(3);
    for (let run = 0; run < 200; run += 1) {
      const zoom = 0.4 + random.next() * 1.6;
      const axis = scrollAxis({ ...BASE, zoom, translate: 0 });
      const offset = random.next() * (axis.track - axis.thumb);
      const translate = translateForThumb(axis, offset);
      const again = scrollAxis({ ...BASE, zoom, translate });
      expect(again.offset).toBeCloseTo(offset, 6);
    }
  });

  it("clamps drags past either end", () => {
    const axis = scrollAxis(BASE);
    expect(translateForThumb(axis, -50)).toBe(-axis.lo);
    expect(translateForThumb(axis, 5000)).toBe(-axis.hi);
    const full = scrollAxis({ ...BASE, track: 10 });
    expect(translateForThumb(full, 5)).toBe(-full.lo);
  });
});

describe("track clicks and keys", () => {
  it("pages one canvas length toward the click", () => {
    const axis = scrollAxis({ ...BASE, translate: -400 });
    expect(translateForTrackClick(axis, axis.offset + axis.thumb + 10)).toBe(-(400 + 1100));
    expect(translateForTrackClick(axis, 0)).toBe(-(400 - 1100));
    // Near the start, paging back stops at the minimum.
    expect(translateForTrackClick(scrollAxis({ ...BASE, translate: 0 }), 0)).toBe(-axis.lo);
  });

  it("maps keys to scroll steps: arrows 20 px, pages one canvas, Home and End to the ends", () => {
    expect(scrollKeyDelta("ArrowDown", 800)).toBe(20);
    expect(scrollKeyDelta("ArrowRight", 800)).toBe(20);
    expect(scrollKeyDelta("ArrowUp", 800)).toBe(-20);
    expect(scrollKeyDelta("ArrowLeft", 800)).toBe(-20);
    expect(scrollKeyDelta("PageDown", 800)).toBe(800);
    expect(scrollKeyDelta("PageUp", 800)).toBe(-800);
    expect(scrollKeyDelta("End", 800)).toBe(Infinity);
    expect(scrollKeyDelta("Home", 800)).toBe(-Infinity);
    expect(scrollKeyDelta("a", 800)).toBeNull();
  });
});
