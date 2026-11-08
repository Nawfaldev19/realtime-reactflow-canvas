import { useCallback, useEffect, useRef } from "react";
import { useApolloClient } from "@apollo/client";
import { UPDATE_VIEW_SETTINGS } from "../graphql/operations";
import { ViewSettingsSaver } from "../persistence/viewSettingsSaver";
import type { EditorStoreApi } from "./store";

/**
 * Saves the view settings 500 ms after each local change (updateViewSettings,
 * no revision check). Returns a function that saves anything waiting now.
 */
export function useViewSettingsSave(api: EditorStoreApi, diagramId: string): () => Promise<void> {
  const client = useApolloClient();
  const saverRef = useRef<ViewSettingsSaver | null>(null);

  useEffect(() => {
    const saver = new ViewSettingsSaver({
      save: async (viewSettings) => {
        const { data } = await client.mutate({
          mutation: UPDATE_VIEW_SETTINGS,
          variables: { id: diagramId, viewSettings },
        });
        const payload = data?.updateViewSettings;
        if (!payload?.diagram) throw new Error(payload?.errors[0]?.message ?? "The view settings were not saved");
      },
      onStatus: (status) => {
        api.getState().setViewSettingsStatus(status);
      },
    });
    saverRef.current = saver;
    const unsubscribe = api.subscribe((next, previous) => {
      if (next.viewSettingsSeq !== previous.viewSettingsSeq) saver.changed(next.viewSettings);
    });
    return () => {
      unsubscribe();
      void saver.dispose();
      saverRef.current = null;
    };
  }, [api, client, diagramId]);

  return useCallback(() => saverRef.current?.flush() ?? Promise.resolve(), []);
}
