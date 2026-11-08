import { useLayoutEffect, useRef, useState } from "react";
import { useStore } from "@xyflow/react";
import { useEditorStoreApi } from "../editor/EditorStoreContext";
import { diagramBounds } from "../viewport/bounds";
import { openingViewport, type OpeningView } from "../viewport/viewport";
import type { ViewActions } from "./useViewActions";

// Applies the opening view exactly once per canvas: as soon as the canvas has
// a size and its pan-and-zoom is ready, the viewport is computed from the
// model (so it is right even while steps are hidden for the reveal) and set
// without animation. Nothing re-applies a default afterwards: the canvas has
// no automatic fit, a reload of the document does not run this again, and the
// background never touches the viewport. Returns true once applied.

export function useOpeningView(view: OpeningView, actions: ViewActions): boolean {
  const api = useEditorStoreApi();
  const width = useStore((state) => state.width);
  const height = useStore((state) => state.height);
  const ready = useStore((state) => state.panZoom !== null);
  const applied = useRef(false);
  const [done, setDone] = useState(false);

  useLayoutEffect(() => {
    if (applied.current || !ready) return;
    const viewport = openingViewport(view, { width, height }, diagramBounds(api.getState().doc));
    if (!viewport) return;
    applied.current = true;
    actions.apply(viewport);
    setDone(true);
  }, [actions, api, height, ready, view, width]);

  return done;
}
