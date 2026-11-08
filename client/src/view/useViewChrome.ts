import { useCallback, useMemo, useState, type KeyboardEvent } from "react";
import type { CoordinateExtent, ReactFlowProps } from "@xyflow/react";
import { isTextTarget } from "../editor/shortcuts";
import type { DocumentState } from "../document/types";
import { diagramBounds } from "../viewport/bounds";
import {
  interactionFlags,
  keyCommand,
  type InteractionFlags,
  type NavigationMode,
  type ViewContext,
} from "../viewport/navigation";
import { panExtent, type Extent } from "../viewport/panBounds";
import type { OpeningView } from "../viewport/viewport";
import { useOpeningView } from "./useOpeningView";
import { useViewActions, type ViewActions } from "./useViewActions";

// Everything a canvas surface (the editor or the preview) needs for viewing:
// view commands, the once-only opening view, interaction flags for the
// navigation mode, pan bounds, the scrollbar and minimap toggles, and
// keyboard navigation (arrows pan, + and − zoom, 0 returns to the opening view).

const UNBOUNDED: CoordinateExtent = [
  [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY],
  [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY],
];

/** Keys inside these never navigate: nodes and connectors (the editor moves them), and the view controls. */
const OWN_KEYS = ".react-flow__node, .react-flow__edge, .view-footer, .view-scrollbar, .react-flow__minimap";

type FlowInteraction = Pick<
  ReactFlowProps,
  | "panOnDrag"
  | "panOnScroll"
  | "zoomOnScroll"
  | "zoomOnPinch"
  | "zoomOnDoubleClick"
  | "selectionOnDrag"
  | "translateExtent"
>;

export interface ViewChrome {
  readonly actions: ViewActions;
  /** The opening view has been applied (the canvas stays hidden until then). */
  readonly opened: boolean;
  readonly flags: InteractionFlags;
  readonly flow: FlowInteraction;
  readonly extent: Extent | null;
  readonly scrollbars: boolean;
  readonly setScrollbars: (on: boolean) => void;
  readonly minimap: boolean;
  readonly setMinimap: (on: boolean) => void;
  readonly showOpening: () => void;
  readonly onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
}

interface ViewChromeOptions {
  readonly context: ViewContext;
  readonly mode: NavigationMode;
  readonly doc: DocumentState;
  readonly openingView: OpeningView;
  readonly drawing?: boolean;
}

export function useViewChrome({ context, mode, doc, openingView, drawing = false }: ViewChromeOptions): ViewChrome {
  const actions = useViewActions();
  const opened = useOpeningView(openingView, actions);
  const flags = interactionFlags(mode, context, { drawing });
  // The scrollbar toggle is per session; until it is used, scroll mode shows them and pan mode does not.
  const [scrollbarChoice, setScrollbars] = useState<boolean | null>(null);
  const [minimap, setMinimap] = useState(false);
  const extent = useMemo(() => panExtent(diagramBounds(doc)), [doc]);
  const flow = useMemo(
    (): FlowInteraction => ({
      panOnDrag: typeof flags.panOnDrag === "boolean" ? flags.panOnDrag : [...flags.panOnDrag],
      panOnScroll: flags.panOnScroll,
      zoomOnScroll: flags.zoomOnScroll,
      zoomOnPinch: flags.zoomOnPinch,
      zoomOnDoubleClick: flags.zoomOnDoubleClick,
      selectionOnDrag: flags.selectionOnDrag,
      translateExtent: extent ? [[...extent[0]], [...extent[1]]] : UNBOUNDED,
    }),
    [
      flags.panOnDrag,
      flags.panOnScroll,
      flags.zoomOnScroll,
      flags.zoomOnPinch,
      flags.zoomOnDoubleClick,
      flags.selectionOnDrag,
      extent,
    ],
  );
  const showOpening = useCallback(() => actions.showOpening(openingView), [actions, openingView]);

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLElement>) => {
      if (
        context === "disabled" ||
        event.defaultPrevented ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        isTextTarget(event.target)
      )
        return;
      if (event.target instanceof Element && event.target.closest(OWN_KEYS)) return;
      const command = keyCommand(event.key, event.shiftKey, actions.current(), actions.size());
      if (!command) return;
      event.preventDefault();
      if (command.kind === "opening") showOpening();
      else actions.apply(command.viewport, command.animate ? 100 : 0);
    },
    [actions, context, showOpening],
  );

  return {
    actions,
    opened,
    flags,
    flow,
    extent,
    scrollbars: scrollbarChoice ?? flags.scrollbars,
    setScrollbars,
    minimap,
    setMinimap,
    showOpening,
    onKeyDown,
  };
}
