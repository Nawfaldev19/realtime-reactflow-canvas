import { describe, expect, it } from "vitest";
import { clampNearest, clampPercent, DEFAULT_VIEW_SETTINGS, parseViewSettings, storableViewport } from "./settings";

describe("view settings", () => {
  it("reads complete settings unchanged", () => {
    const settings = {
      openingView: { mode: "saved", customPercent: 125, savedViewport: { x: 10, y: -20, zoom: 0.5 } },
      background: { pattern: "cross", gap: 32 },
      animateOnOpen: true,
      snapping: { enabled: false, nearest: 4 },
    };
    expect(parseViewSettings(settings)).toEqual(settings);
  });

  it("falls back to the defaults for anything missing or malformed", () => {
    expect(parseViewSettings(null)).toEqual(DEFAULT_VIEW_SETTINGS);
    expect(parseViewSettings({ openingView: [], background: "x", snapping: 3 })).toEqual(DEFAULT_VIEW_SETTINGS);
    expect(
      parseViewSettings({
        openingView: { mode: "zoomy", customPercent: "70", savedViewport: { x: 1, y: "2", zoom: 1 } },
        background: { pattern: "plaid", gap: Number.NaN },
        animateOnOpen: "yes",
        snapping: { enabled: 1, nearest: "4" },
      }),
    ).toEqual(DEFAULT_VIEW_SETTINGS);
  });

  it("opens a saved view without a viewport at fit width", () => {
    expect(
      parseViewSettings({ openingView: { mode: "saved", customPercent: 70, savedViewport: null } }).openingView.mode,
    ).toBe("fitWidth");
  });

  it("clamps numbers into their ranges", () => {
    const settings = parseViewSettings({
      openingView: { mode: "custom", customPercent: 500, savedViewport: { x: 0, y: 0, zoom: 7 } },
      background: { pattern: "dots", gap: 1 },
      snapping: { enabled: true, nearest: 40 },
    });
    expect(settings.openingView.customPercent).toBe(200);
    expect(settings.openingView.savedViewport?.zoom).toBe(2);
    expect(settings.background.gap).toBe(4);
    expect(settings.snapping.nearest).toBe(10);
  });

  it("clamps typed values", () => {
    expect(clampPercent(5)).toBe(10);
    expect(clampPercent(77.4)).toBe(77);
    expect(clampPercent(Number.NaN)).toBe(70);
    expect(clampNearest(0)).toBe(1);
    expect(clampNearest(Number.NaN)).toBe(2);
  });

  it("rounds a viewport for storage within half a pixel", () => {
    expect(storableViewport({ x: 10.123456, y: -3.987654, zoom: 0.4545454 })).toEqual({
      x: 10.12,
      y: -3.99,
      zoom: 0.4545,
    });
    expect(storableViewport({ x: 0, y: 0, zoom: 3 }).zoom).toBe(2);
  });
});
