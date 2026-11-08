import { memo } from "react";
import type { LibraryItem } from "../document/library";
import { shapePaths } from "../geometry/shapes";

// A small drawing of a library item, from the same outline code the canvas uses.

const W = 36;
const H = 24;

function ShapePreviewView({ item }: { item: LibraryItem }) {
  const fill = typeof item.style?.fill === "string" ? item.style.fill : "var(--color-surface)";
  let body;
  if (item.kind === "shape" || item.kind === "decision") {
    body = <path d={shapePaths(item.shape ?? "diamond", W, H).outline} />;
  } else if (item.kind === "line") {
    body = <line x1={2} y1={H / 2} x2={W - 2} y2={H / 2} strokeWidth={2} />;
  } else if (item.kind === "label") {
    body = (
      <text x={W / 2} y={H / 2 + 5} textAnchor="middle" fontSize={14} stroke="none" fill="currentColor">
        T
      </text>
    );
  } else {
    const radius = item.kind === "start-end" ? H / 2 - 2 : item.kind === "note" ? 1 : 4;
    body = (
      <rect
        x={1}
        y={2}
        width={W - 2}
        height={H - 4}
        rx={radius}
        strokeDasharray={item.kind === "group" ? "3 2" : undefined}
      />
    );
  }
  return (
    <svg
      className="library-item__preview"
      width={W}
      height={H}
      viewBox={`0 0 ${String(W)} ${String(H)}`}
      aria-hidden="true"
      fill={fill}
      stroke="currentColor"
      strokeWidth={1}
    >
      {body}
    </svg>
  );
}

export const ShapePreview = memo(ShapePreviewView);
