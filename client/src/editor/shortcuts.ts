import type { ArrangeCommand } from "../document/zorder";

// Keyboard shortcuts for the editor, as a pure mapping from a key event to a
// command. Events from text fields and the in-place text editor are ignored,
// so Backspace, Enter, Cmd+B and Cmd+Z keep their text-editing meaning there
// (undo inside the text editor undoes typing, not the last diagram change).

export type ShortcutCommand =
  | { readonly type: "arrange"; readonly command: ArrangeCommand }
  | { readonly type: "group" }
  | { readonly type: "ungroup" }
  | { readonly type: "edit"; readonly nodeId: string }
  | { readonly type: "stop-drawing" }
  | { readonly type: "remove-last-stroke" }
  | { readonly type: "undo" }
  | { readonly type: "redo" }
  | { readonly type: "duplicate" }
  | { readonly type: "find" };

/** Commands that only read the diagram, so viewers get them too. */
export const READ_ONLY_COMMANDS: ReadonlySet<ShortcutCommand["type"]> = new Set(["find"]);

export interface KeyLike {
  readonly key: string;
  readonly code: string;
  readonly metaKey: boolean;
  readonly ctrlKey: boolean;
  readonly shiftKey: boolean;
  readonly altKey: boolean;
  readonly target: EventTarget | null;
}

/** True for inputs, selects, text areas and contenteditable elements. */
export function isTextTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target.hasAttribute("contenteditable") ||
    ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)
  );
}

/** The canvas node a key event came from, if any. */
function focusedNodeId(target: EventTarget | null): string | null {
  if (!(target instanceof HTMLElement)) return null;
  return target.closest<HTMLElement>(".react-flow__node")?.dataset.id ?? null;
}

export function commandFor(event: KeyLike, { drawMode }: { drawMode: boolean }): ShortcutCommand | null {
  if (isTextTarget(event.target)) return null;
  const mod = event.metaKey || event.ctrlKey;
  if (drawMode) {
    if (event.key === "Escape") return { type: "stop-drawing" };
    if (mod && event.key.toLowerCase() === "z" && !event.shiftKey) return { type: "remove-last-stroke" };
    return null;
  }
  const letter = event.key.toLowerCase();
  if (mod && letter === "f") return { type: "find" };
  // Cmd+Shift+Z on macOS; Ctrl+Y or Ctrl+Shift+Z elsewhere.
  if (mod && letter === "z") return event.shiftKey ? { type: "redo" } : { type: "undo" };
  if (event.ctrlKey && !event.metaKey && letter === "y") return { type: "redo" };
  if (mod && letter === "d") return { type: "duplicate" };
  if (mod && event.code === "BracketRight") return { type: "arrange", command: event.shiftKey ? "front" : "forward" };
  if (mod && event.code === "BracketLeft") return { type: "arrange", command: event.shiftKey ? "back" : "backward" };
  if (mod && event.key.toLowerCase() === "g") return event.shiftKey ? { type: "ungroup" } : { type: "group" };
  if (!mod && !event.altKey && (event.key === "Enter" || event.key === "F2")) {
    const nodeId = focusedNodeId(event.target);
    return nodeId ? { type: "edit", nodeId } : null;
  }
  return null;
}
