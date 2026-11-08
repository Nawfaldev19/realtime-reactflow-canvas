import { describe, expect, it } from "vitest";
import {
  effectiveMode,
  interactionFlags,
  keyCommand,
  KEY_PAN,
  KEY_PAN_FAST,
  type InteractionFlags,
  type NavigationMode,
  type ViewContext,
} from "./navigation";

describe("effective navigation mode", () => {
  it("prefers the member's choice, then the workspace default, then pan", () => {
    expect(effectiveMode("scroll", "pan")).toBe("scroll");
    expect(effectiveMode(null, "scroll")).toBe("scroll");
    expect(effectiveMode(undefined, null)).toBe("pan");
  });
});

describe("interaction flags", () => {
  const off: InteractionFlags = {
    panOnDrag: false,
    panOnScroll: false,
    zoomOnScroll: false,
    zoomOnPinch: false,
    zoomOnDoubleClick: false,
    selectionOnDrag: false,
    scrollbars: false,
  };
  const table: readonly [NavigationMode, ViewContext, InteractionFlags][] = [
    [
      "pan",
      "editor",
      {
        panOnDrag: true,
        panOnScroll: false,
        zoomOnScroll: true,
        zoomOnPinch: true,
        zoomOnDoubleClick: false,
        selectionOnDrag: false,
        scrollbars: false,
      },
    ],
    [
      "scroll",
      "editor",
      {
        panOnDrag: [1, 2],
        panOnScroll: true,
        zoomOnScroll: false,
        zoomOnPinch: true,
        zoomOnDoubleClick: false,
        selectionOnDrag: true,
        scrollbars: true,
      },
    ],
    [
      "pan",
      "preview",
      {
        panOnDrag: true,
        panOnScroll: false,
        zoomOnScroll: true,
        zoomOnPinch: true,
        zoomOnDoubleClick: true,
        selectionOnDrag: false,
        scrollbars: false,
      },
    ],
    [
      "scroll",
      "preview",
      {
        panOnDrag: [1, 2],
        panOnScroll: true,
        zoomOnScroll: false,
        zoomOnPinch: true,
        zoomOnDoubleClick: true,
        selectionOnDrag: false,
        scrollbars: true,
      },
    ],
    ["pan", "disabled", off],
    ["scroll", "disabled", off],
  ];

  it.each(table)("%s mode in the %s context", (mode, context, expected) => {
    expect(interactionFlags(mode, context)).toEqual(expected);
  });

  it("stops drag-to-pan and the selection rectangle while drawing", () => {
    expect(interactionFlags("pan", "editor", { drawing: true }).panOnDrag).toBe(false);
    const scroll = interactionFlags("scroll", "editor", { drawing: true });
    expect([scroll.panOnDrag, scroll.selectionOnDrag]).toEqual([false, false]);
  });
});

describe("keyboard navigation", () => {
  const view = { x: 0, y: 0, zoom: 1 };
  const size = { width: 1000, height: 800 };

  it("pans with the arrows, faster with Shift", () => {
    expect(keyCommand("ArrowLeft", false, view, size)).toEqual({
      kind: "viewport",
      viewport: { x: KEY_PAN, y: 0, zoom: 1 },
      animate: false,
    });
    expect(keyCommand("ArrowRight", true, view, size)).toEqual({
      kind: "viewport",
      viewport: { x: -KEY_PAN_FAST, y: 0, zoom: 1 },
      animate: false,
    });
    expect(keyCommand("ArrowUp", false, view, size)).toEqual({
      kind: "viewport",
      viewport: { x: 0, y: KEY_PAN, zoom: 1 },
      animate: false,
    });
    expect(keyCommand("ArrowDown", false, view, size)).toEqual({
      kind: "viewport",
      viewport: { x: 0, y: -KEY_PAN, zoom: 1 },
      animate: false,
    });
  });

  it("zooms about the canvas centre with + and −", () => {
    const zoomIn = keyCommand("+", false, view, size);
    expect(zoomIn).toEqual({
      kind: "viewport",
      viewport: { x: 500 - 500 * 1.2, y: 400 - 400 * 1.2, zoom: 1.2 },
      animate: true,
    });
    expect(keyCommand("=", false, view, size)).toEqual(zoomIn);
    const zoomOut = keyCommand("-", false, view, size);
    expect(zoomOut?.kind === "viewport" && zoomOut.viewport.zoom).toBeCloseTo(1 / 1.2, 9);
    expect(keyCommand("_", false, view, size)).toEqual(zoomOut);
  });

  it("goes back to the opening view with 0 and ignores other keys", () => {
    expect(keyCommand("0", false, view, size)).toEqual({ kind: "opening" });
    expect(keyCommand("x", false, view, size)).toBeNull();
  });
});
