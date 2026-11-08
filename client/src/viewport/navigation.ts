import type { CanvasSize, Viewport } from "./viewport";
import { canvasCentre, zoomBy, ZOOM_STEP } from "./viewport";

// Pan versus scroll navigation, as one table from (mode, context) to the
// canvas library's interaction flags, plus keyboard navigation.
//
// | Gesture                | Pan mode                  | Scroll mode                              |
// |------------------------|---------------------------|------------------------------------------|
// | Wheel / two fingers    | zoom around the pointer   | move the view (Shift: horizontally)      |
// | Pinch, Ctrl/Cmd + wheel| zoom                      | zoom                                     |
// | Left-drag empty canvas | pan                       | selection rectangle (editor only)        |
// | Middle/right-drag      | pan                       | pan                                      |
// | Double-click           | zoom in (preview only)    | zoom in (preview only)                   |

export const NAVIGATION_MODES = ["pan", "scroll"] as const;
export type NavigationMode = (typeof NAVIGATION_MODES)[number];

/** editor: editing canvas; preview: read-only presentation; disabled: a blocking panel is open (the canvas still renders). */
export type ViewContext = "editor" | "preview" | "disabled";

/** The member's own choice, else the workspace default, else pan. */
export const effectiveMode = (
  preference: NavigationMode | null | undefined,
  workspaceDefault: NavigationMode | null | undefined,
): NavigationMode => preference ?? workspaceDefault ?? "pan";

export interface InteractionFlags {
  /** true: left button; a list: those mouse buttons (0 left, 1 middle, 2 right). */
  readonly panOnDrag: boolean | readonly number[];
  readonly panOnScroll: boolean;
  readonly zoomOnScroll: boolean;
  readonly zoomOnPinch: boolean;
  readonly zoomOnDoubleClick: boolean;
  readonly selectionOnDrag: boolean;
  /** Custom scrollbars are on by default. */
  readonly scrollbars: boolean;
}

const MIDDLE_AND_RIGHT: readonly number[] = [1, 2];

const DISABLED: InteractionFlags = {
  panOnDrag: false,
  panOnScroll: false,
  zoomOnScroll: false,
  zoomOnPinch: false,
  zoomOnDoubleClick: false,
  selectionOnDrag: false,
  scrollbars: false,
};

export interface FlagOptions {
  /** A drawing tool is active: dragging draws instead of panning. */
  readonly drawing?: boolean;
}

export function interactionFlags(
  mode: NavigationMode,
  context: ViewContext,
  { drawing = false }: FlagOptions = {},
): InteractionFlags {
  if (context === "disabled") return DISABLED;
  const editor = context === "editor";
  const scroll = mode === "scroll";
  const panOnDrag = drawing ? false : scroll ? MIDDLE_AND_RIGHT : true;
  return {
    panOnDrag,
    panOnScroll: scroll,
    zoomOnScroll: !scroll,
    zoomOnPinch: true,
    // In the editor a double-click edits text.
    zoomOnDoubleClick: !editor,
    selectionOnDrag: scroll && editor && !drawing,
    scrollbars: scroll,
  };
}

/** Arrow keys pan this many screen pixels, with Shift this many. */
export const KEY_PAN = 40;
export const KEY_PAN_FAST = 200;

export type KeyCommand =
  | { readonly kind: "viewport"; readonly viewport: Viewport; readonly animate: boolean }
  | { readonly kind: "opening" };

/** Keyboard navigation: arrows pan, + and − zoom about the centre, 0 goes back to the opening view. */
export function keyCommand(key: string, shift: boolean, viewport: Viewport, size: CanvasSize): KeyCommand | null {
  const step = shift ? KEY_PAN_FAST : KEY_PAN;
  const pan = (dx: number, dy: number): KeyCommand => ({
    kind: "viewport",
    viewport: { ...viewport, x: viewport.x + dx, y: viewport.y + dy },
    animate: false,
  });
  switch (key) {
    case "ArrowLeft":
      return pan(step, 0);
    case "ArrowRight":
      return pan(-step, 0);
    case "ArrowUp":
      return pan(0, step);
    case "ArrowDown":
      return pan(0, -step);
    case "+":
    case "=":
      return { kind: "viewport", viewport: zoomBy(viewport, ZOOM_STEP, canvasCentre(size)), animate: true };
    case "-":
    case "_":
      return { kind: "viewport", viewport: zoomBy(viewport, 1 / ZOOM_STEP, canvasCentre(size)), animate: true };
    case "0":
      return { kind: "opening" };
    default:
      return null;
  }
}
