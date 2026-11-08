import { useEffect } from "react";
import { useReactFlow, useStoreApi } from "@xyflow/react";
import { isTextTarget } from "./shortcuts";
import type { EditorStoreApi } from "./store";

/**
 * While a connection is being dragged, holding Space sketches its route:
 * pointer positions are recorded as route points (see recordSketch).
 * Releasing Space stops recording but keeps the points. Space typed into a
 * text field never starts a sketch.
 */
export function useConnectionSketch(api: EditorStoreApi, connecting: boolean): void {
  const flow = useStoreApi();
  const { screenToFlowPosition } = useReactFlow();
  useEffect(() => {
    if (!connecting) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== "Space" || isTextTarget(event.target)) return;
      event.preventDefault();
      api.getState().setSketching(true);
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === "Space") api.getState().setSketching(false);
    };
    const onMove = (event: PointerEvent) => {
      const state = api.getState();
      const connection = flow.getState().connection;
      if (!state.connection?.sketching || !connection.inProgress) return;
      state.recordSketch(screenToFlowPosition({ x: event.clientX, y: event.clientY }), connection.from);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("pointermove", onMove);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("pointermove", onMove);
    };
  }, [api, connecting, flow, screenToFlowPosition]);
}
