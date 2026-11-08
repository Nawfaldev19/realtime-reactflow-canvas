import { useEffect, useLayoutEffect, useRef, useState, type FocusEvent, type KeyboardEvent } from "react";
import { Diamond, Flag, RectangleHorizontal } from "lucide-react";
import type { NodeKind } from "../document/types";
import type { ShapeKind } from "../geometry/shapes";
import { useEditor, useEditorStoreApi } from "./EditorStoreContext";
import { SHAPE_MENU } from "./EditorToolbar";
import type { PendingDrop } from "./store";

// The compact shape menu shown where a connection was dropped on empty
// canvas. Choosing a shape creates the step there, connected from every
// source, as one operation; Escape or clicking away removes the ghost step
// and its ghost connectors, leaving the document untouched.
//
// The gesture (telling an empty-canvas drop from a real connection with the
// connection-end state's validity flag, and placing the step with
// screenToFlowPosition) is adapted from the React Flow "Add Node On Edge
// Drop" and "Temporary Edges" examples (MIT); see docs/REFERENCES.md.

const KINDS: readonly { kind: NodeKind; label: string; Icon: typeof Diamond }[] = [
  { kind: "step", label: "Step", Icon: RectangleHorizontal },
  { kind: "decision", label: "Decision", Icon: Diamond },
  { kind: "start-end", label: "Start or end", Icon: Flag },
];

function Menu({ drop }: { drop: PendingDrop }) {
  const api = useEditorStoreApi();
  const menu = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState(drop.screen);
  // Opens at the pointer, flipped up or left when it would leave the canvas.
  useLayoutEffect(() => {
    const element = menu.current;
    const parent = element?.parentElement;
    if (!element || !parent) return;
    const { width, height } = element.getBoundingClientRect();
    const bounds = parent.getBoundingClientRect();
    const GAP = 8;
    setPlace({
      x: drop.screen.x + GAP + width > bounds.width ? Math.max(0, drop.screen.x - width - GAP) : drop.screen.x + GAP,
      y: drop.screen.y + GAP + height > bounds.height ? Math.max(0, drop.screen.y - height - GAP) : drop.screen.y + GAP,
    });
  }, [drop.screen]);
  useEffect(() => {
    menu.current?.querySelector<HTMLButtonElement>("button")?.focus();
  }, []);
  const choose = (kind: NodeKind, shape?: ShapeKind) => {
    api.getState().completeDrop(kind, shape ? { shape } : {});
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      api.getState().cancelDrop();
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const items = [...(menu.current?.querySelectorAll<HTMLButtonElement>("button") ?? [])];
    const index = items.findIndex((item) => item === document.activeElement);
    items[(index + (event.key === "ArrowDown" ? 1 : items.length - 1)) % items.length]?.focus();
  };
  const onBlur = (event: FocusEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget)) api.getState().cancelDrop();
  };
  return (
    <div
      ref={menu}
      className="menu drop-menu"
      role="menu"
      aria-label="Create a connected step"
      style={{ left: place.x, top: place.y }}
      onKeyDown={onKeyDown}
      onBlur={onBlur}
    >
      {KINDS.map(({ kind, label, Icon }) => (
        <button key={kind} type="button" role="menuitem" className="menu__item" onClick={() => choose(kind)}>
          <Icon size={16} aria-hidden="true" /> {label}
        </button>
      ))}
      {SHAPE_MENU.map(({ shape, label, Icon }) => (
        <button key={shape} type="button" role="menuitem" className="menu__item" onClick={() => choose("shape", shape)}>
          <Icon size={16} aria-hidden="true" /> {label}
        </button>
      ))}
    </div>
  );
}

export function DropMenu() {
  const drop = useEditor((state) => state.pendingDrop);
  return drop ? <Menu drop={drop} /> : null;
}
