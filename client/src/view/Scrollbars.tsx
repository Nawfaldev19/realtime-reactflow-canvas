import { useRef, type KeyboardEvent, type PointerEvent } from "react";
import { useStore } from "@xyflow/react";
import type { Extent } from "../viewport/panBounds";
import {
  scrollAxis,
  scrollKeyDelta,
  scrollPercent,
  SCROLLBAR_INSET,
  translateForScroll,
  translateForThumb,
  translateForTrackClick,
  type AxisModel,
} from "../viewport/scrollbars";
import type { ViewActions } from "./useViewActions";

// Custom scrollbars along the bottom and right edges, from the viewport and
// extent algebra in src/viewport/scrollbars.ts. A bar shows only when the
// extent is larger than the canvas at the current zoom. The thumb follows the
// view whatever moved it; dragging the thumb, clicking the track and the keys
// on a focused thumb move the view at once.

type Orientation = "horizontal" | "vertical";

interface BarProps {
  readonly orientation: Orientation;
  readonly axis: AxisModel;
  /** Moves the view to a new translation along this axis. */
  readonly onScroll: (translate: number) => void;
  /** The axis for the current view (zoom may change while dragging). */
  readonly latest: () => AxisModel;
}

function Bar({ orientation, axis, onScroll, latest }: BarProps) {
  const drag = useRef<{ readonly start: number; readonly offset: number } | null>(null);
  const along = (event: PointerEvent) => (orientation === "horizontal" ? event.clientX : event.clientY);

  const onThumbDown = (event: PointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { start: along(event), offset: axis.offset };
  };
  const onThumbMove = (event: PointerEvent<HTMLDivElement>) => {
    const press = drag.current;
    if (press) onScroll(translateForThumb(latest(), press.offset + along(event) - press.start));
  };
  const onThumbUp = (event: PointerEvent<HTMLDivElement>) => {
    drag.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const onTrackDown = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    onScroll(translateForTrackClick(axis, along(event) - (orientation === "horizontal" ? rect.left : rect.top)));
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const delta = scrollKeyDelta(event.key, axis.length);
    if (delta === null) return;
    event.preventDefault();
    event.stopPropagation();
    onScroll(translateForScroll(axis, axis.position + delta));
  };

  const horizontal = orientation === "horizontal";
  return (
    <div
      className={`view-scrollbar view-scrollbar--${orientation}`}
      data-testid={`scrollbar-${orientation}`}
      onPointerDown={onTrackDown}
    >
      <div
        className="view-scrollbar__thumb"
        role="scrollbar"
        tabIndex={0}
        aria-label={horizontal ? "Scroll horizontally" : "Scroll vertically"}
        aria-orientation={orientation}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={scrollPercent(axis)}
        style={horizontal ? { left: axis.offset, width: axis.thumb } : { top: axis.offset, height: axis.thumb }}
        onPointerDown={onThumbDown}
        onPointerMove={onThumbMove}
        onPointerUp={onThumbUp}
        onPointerCancel={onThumbUp}
        onKeyDown={onKeyDown}
      />
    </div>
  );
}

export function Scrollbars({ extent, actions }: { readonly extent: Extent; readonly actions: ViewActions }) {
  const [x, y, zoom] = useStore((state) => state.transform);
  const width = useStore((state) => state.width);
  const height = useStore((state) => state.height);
  const [[minX, minY], [maxX, maxY]] = extent;
  const horizontalTrack = Math.max(0, width - 2 * SCROLLBAR_INSET);
  const verticalTrack = Math.max(0, height - 2 * SCROLLBAR_INSET);
  const horizontal = scrollAxis({ min: minX, max: maxX, translate: x, zoom, length: width, track: horizontalTrack });
  const vertical = scrollAxis({ min: minY, max: maxY, translate: y, zoom, length: height, track: verticalTrack });

  const latest = (orientation: Orientation) => () => {
    const view = actions.current();
    const { width: w, height: h } = actions.size();
    return orientation === "horizontal"
      ? scrollAxis({
          min: minX,
          max: maxX,
          translate: view.x,
          zoom: view.zoom,
          length: w,
          track: Math.max(0, w - 2 * SCROLLBAR_INSET),
        })
      : scrollAxis({
          min: minY,
          max: maxY,
          translate: view.y,
          zoom: view.zoom,
          length: h,
          track: Math.max(0, h - 2 * SCROLLBAR_INSET),
        });
  };

  return (
    <>
      {horizontal.visible && (
        <Bar
          orientation="horizontal"
          axis={horizontal}
          latest={latest("horizontal")}
          onScroll={(translate) => actions.apply({ ...actions.current(), x: translate })}
        />
      )}
      {vertical.visible && (
        <Bar
          orientation="vertical"
          axis={vertical}
          latest={latest("vertical")}
          onScroll={(translate) => actions.apply({ ...actions.current(), y: translate })}
        />
      )}
    </>
  );
}
