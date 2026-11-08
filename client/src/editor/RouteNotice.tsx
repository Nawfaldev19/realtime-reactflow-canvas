import { useEffect } from "react";
import { useEditor, useEditorStoreApi } from "./EditorStoreContext";

// After switching route styles cleared someone's hand-placed points, a short
// notice offers to put them back.

export const ROUTE_NOTICE_MS = 8000;

export function RouteNotice() {
  const api = useEditorStoreApi();
  const notice = useEditor((state) => state.routeNotice);
  useEffect(() => {
    if (!notice) return undefined;
    const timer = window.setTimeout(() => {
      api.getState().dismissRouteNotice();
    }, ROUTE_NOTICE_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [api, notice]);
  if (!notice) return null;
  const count = Object.keys(notice.previous).length;
  return (
    <div className="canvas-toast" role="status">
      <span>{count === 1 ? "Route points cleared." : `Route points cleared on ${String(count)} connectors.`}</span>
      <button
        type="button"
        className="button button-secondary button-small"
        onClick={() => api.getState().undoRouteStyle()}
      >
        Undo
      </button>
      <button
        type="button"
        className="button button-ghost button-small"
        onClick={() => api.getState().dismissRouteNotice()}
      >
        Dismiss
      </button>
    </div>
  );
}
