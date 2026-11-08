import { useState, type FocusEvent } from "react";
import { useStore } from "@xyflow/react";
import { Minus, Plus } from "lucide-react";
import { canZoomIn, canZoomOut, MAX_ZOOM, MIN_ZOOM, zoomPercent } from "../viewport/viewport";
import type { ViewActions } from "./useViewActions";

// − / slider / + / percent menu. The slider applies live, centred on the
// canvas; the buttons animate. "Zoom in" and "Zoom out" are disabled (not
// hidden) at the limits, judged on the real zoom rather than the rounded label.

export const ZOOM_PRESETS = [10, 25, 50, 75, 100, 125, 150, 175, 200] as const;

interface ZoomControlsProps {
  readonly actions: ViewActions;
  /** Applies the diagram's opening view (from the percent menu). */
  readonly onOpeningView: () => void;
}

export function ZoomControls({ actions, onOpeningView }: ZoomControlsProps) {
  const zoom = useStore((state) => state.transform[2]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [sliding, setSliding] = useState(false);
  const percent = zoomPercent(zoom);
  const closeOnLeave = (event: FocusEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget)) setMenuOpen(false);
  };
  const choose = (action: () => void) => () => {
    setMenuOpen(false);
    action();
  };

  return (
    <div className="zoom-controls">
      <button
        type="button"
        className="button button-ghost button-icon"
        aria-label="Zoom out"
        title="Zoom out"
        disabled={!canZoomOut(zoom)}
        onClick={actions.zoomOut}
      >
        <Minus size={16} aria-hidden="true" />
      </button>
      <span className="zoom-slider">
        <input
          type="range"
          aria-label="Zoom"
          aria-valuetext={`${String(percent)}%`}
          min={MIN_ZOOM * 100}
          max={MAX_ZOOM * 100}
          step={10}
          value={Math.round(percent / 10) * 10}
          onPointerDown={() => setSliding(true)}
          onPointerUp={() => setSliding(false)}
          onBlur={() => setSliding(false)}
          onChange={(event) => actions.zoomToPercent(Number(event.target.value), 0)}
        />
        {sliding && (
          <output className="zoom-slider__bubble" aria-hidden="true">
            {percent}%
          </output>
        )}
      </span>
      <button
        type="button"
        className="button button-ghost button-icon"
        aria-label="Zoom in"
        title="Zoom in"
        disabled={!canZoomIn(zoom)}
        onClick={actions.zoomIn}
      >
        <Plus size={16} aria-hidden="true" />
      </button>
      <div className="menu-anchor" onBlur={closeOnLeave}>
        <button
          type="button"
          className="button button-ghost zoom-label"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-label={`Zoom ${String(percent)}%, more zoom options`}
          data-testid="zoom-label"
          onClick={() => setMenuOpen((open) => !open)}
          onKeyDown={(event) => {
            if (event.key === "Escape") setMenuOpen(false);
          }}
        >
          {percent}%
        </button>
        {menuOpen && (
          <div className="menu menu--up" role="menu" aria-label="Zoom">
            {ZOOM_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                role="menuitem"
                className="menu__item"
                onClick={choose(() => actions.zoomToPercent(preset))}
              >
                {preset}%
              </button>
            ))}
            <hr className="menu__separator" />
            <button
              type="button"
              role="menuitem"
              className="menu__item"
              disabled={!canZoomIn(zoom)}
              onClick={choose(actions.zoomIn)}
            >
              Zoom in
            </button>
            <button
              type="button"
              role="menuitem"
              className="menu__item"
              disabled={!canZoomOut(zoom)}
              onClick={choose(actions.zoomOut)}
            >
              Zoom out
            </button>
            <button type="button" role="menuitem" className="menu__item" onClick={choose(actions.fit)}>
              Fit
            </button>
            <button type="button" role="menuitem" className="menu__item" onClick={choose(actions.goToStart)}>
              Go to start
            </button>
            <button type="button" role="menuitem" className="menu__item" onClick={choose(onOpeningView)}>
              Opening view
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
