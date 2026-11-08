import type { ReactNode } from "react";
import { ArrowUpToLine, Hand, Map as MapIcon, Scan, ScrollText, Rows3 } from "lucide-react";
import type { NavigationMode } from "../viewport/navigation";
import type { ViewActions } from "./useViewActions";
import { ZoomControls } from "./ZoomControls";

// The floating view footer of a canvas: Go to start, Fit, the zoom controls,
// the scrollbar and minimap toggles, the navigation mode, and any extra
// controls of the surface (Replay and Skip in the preview). Toggles show their
// state with a pressed style and aria-pressed.

interface ViewFooterProps {
  readonly actions: ViewActions;
  readonly onOpeningView: () => void;
  readonly scrollbars: boolean;
  readonly onScrollbars: (on: boolean) => void;
  readonly minimap: boolean;
  readonly onMinimap: (on: boolean) => void;
  readonly mode: NavigationMode;
  /** Changes the member's navigation preference; omitted when it cannot be changed here. */
  readonly onMode?: ((mode: NavigationMode) => void) | undefined;
  readonly children?: ReactNode;
}

export function ViewFooter({
  actions,
  onOpeningView,
  scrollbars,
  onScrollbars,
  minimap,
  onMinimap,
  mode,
  onMode,
  children,
}: ViewFooterProps) {
  return (
    <div className="view-footer" role="toolbar" aria-label="View">
      {children}
      <button
        type="button"
        className="button button-ghost button-icon"
        onClick={actions.goToStart}
        aria-label="Go to start"
        title="Go to start: fit the width, top first"
      >
        <ArrowUpToLine size={16} aria-hidden="true" />
      </button>
      <button
        type="button"
        className="button button-ghost button-icon"
        onClick={actions.fit}
        aria-label="Fit"
        title="Fit: show the whole diagram"
      >
        <Scan size={16} aria-hidden="true" />
      </button>
      <ZoomControls actions={actions} onOpeningView={onOpeningView} />
      <button
        type="button"
        className="button button-ghost button-icon"
        aria-pressed={scrollbars}
        aria-label="Show scrollbars"
        title="Show scrollbars"
        onClick={() => onScrollbars(!scrollbars)}
      >
        <Rows3 size={16} aria-hidden="true" />
      </button>
      <button
        type="button"
        className="button button-ghost button-icon"
        aria-pressed={minimap}
        aria-label="Show minimap"
        title="Show minimap"
        onClick={() => onMinimap(!minimap)}
      >
        <MapIcon size={16} aria-hidden="true" />
      </button>
      {onMode && (
        <div className="view-footer__modes" role="group" aria-label="Navigation">
          <button
            type="button"
            className="button button-ghost button-icon"
            aria-pressed={mode === "pan"}
            aria-label="Pan mode: the wheel zooms, dragging pans"
            title="Pan mode"
            onClick={() => onMode("pan")}
          >
            <Hand size={16} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="button button-ghost button-icon"
            aria-pressed={mode === "scroll"}
            aria-label="Scroll mode: the wheel scrolls, Ctrl or Cmd with the wheel zooms"
            title="Scroll mode"
            onClick={() => onMode("scroll")}
          >
            <ScrollText size={16} aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}
