import { useEffect, useMemo, useRef } from "react";
import { useApolloClient } from "@apollo/client";
import { AutosaveController } from "../persistence/autosave";
import { saveDiagram } from "../persistence/saveDiagram";
import { hasUnsavedChanges, hasUnsyncedChanges, type EditorStoreApi } from "./store";

export interface AutosaveControls {
  retryNow: () => void;
  /** Saves pending changes now (before leaving for the preview, for example). */
  flush: () => Promise<void>;
  /** Forget the failed or conflicted save after the editor reloaded the latest copy. */
  reset: () => void;
}

/**
 * Wires the autosave controller to the store and the API for one diagram.
 * Only local operations bump `localSeq`, so a session that just watches never saves.
 * Autosave pauses while collaborating (the server stores every operation) and
 * picks up whatever is still pending when collaboration is switched off.
 */
export function useAutosave(api: EditorStoreApi, diagramId: string): AutosaveControls {
  const client = useApolloClient();
  const controllerRef = useRef<AutosaveController | null>(null);

  useEffect(() => {
    const state = () => api.getState();
    const controller = new AutosaveController({
      target: {
        snapshot: () => state().snapshot(),
        hasUnsavedChanges: () => hasUnsavedChanges(state()),
        markSaved: (revision, changeId) => {
          state().markSaved(revision, changeId);
        },
        rebase: (conflict) => {
          state().rebase(conflict);
        },
      },
      save: (snapshot, options) => saveDiagram(client, diagramId, snapshot, options),
      onStatus: (status) => {
        state().setSaveStatus(status);
      },
    });
    controllerRef.current = controller;

    const unsubscribe = api.subscribe((next, previous) => {
      if (next.collaborating && !previous.collaborating) controller.reset();
      else if (
        !next.collaborating &&
        (next.localSeq !== previous.localSeq || (previous.collaborating && hasUnsavedChanges(next)))
      )
        controller.changed();
    });
    const onHidden = () => {
      if (document.visibilityState === "hidden") void controller.flush({ keepalive: true });
    };
    // The keepalive flush usually completes after the page is gone. Ask the
    // person to stay only when the server is already known to be unreachable.
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      // Collaborating, changes go out as they are made; only ones still waiting for the server are at risk.
      if (state().collaborating) {
        if (hasUnsyncedChanges(state())) event.preventDefault();
        return;
      }
      if (!hasUnsavedChanges(state())) return;
      void controller.flush({ keepalive: true });
      const { kind } = controller.currentStatus;
      if (kind === "retrying" || kind === "failed" || kind === "conflict") event.preventDefault();
    };
    document.addEventListener("visibilitychange", onHidden);
    window.addEventListener("beforeunload", onBeforeUnload);

    return () => {
      document.removeEventListener("visibilitychange", onHidden);
      window.removeEventListener("beforeunload", onBeforeUnload);
      unsubscribe();
      void controller.flush();
      controller.dispose();
      controllerRef.current = null;
    };
  }, [api, client, diagramId]);

  return useMemo(
    () => ({
      retryNow: () => void controllerRef.current?.retryNow(),
      flush: () => controllerRef.current?.flush() ?? Promise.resolve(),
      reset: () => controllerRef.current?.reset(),
    }),
    [],
  );
}
