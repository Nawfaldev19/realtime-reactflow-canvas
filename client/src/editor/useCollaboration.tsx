import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { cableTransport } from "../collab/cable";
import { CollabClient, type TransportFactory } from "../collab/client";
import { useSession } from "../lib/session";
import type { EditorStoreApi } from "./store";

// Binds a collaboration session (collab/client.ts) to the editor page.

/** Tests pass in an in-memory transport here; the app uses ActionCable. */
export const CollabTransportContext = createContext<TransportFactory | null>(null);

const CollabClientContext = createContext<CollabClient | null>(null);

export function CollabClientProvider({ client, children }: { client: CollabClient | null; children: ReactNode }) {
  return <CollabClientContext.Provider value={client}>{children}</CollabClientContext.Provider>;
}

/** The running collaboration session, or null before it starts. */
export const useCollabClient = (): CollabClient | null => useContext(CollabClientContext);

/** A tab hidden for longer than this catches up when it is shown again. */
export const AWAY_MS = 5 * 60_000;

/**
 * Starts the session for the store's diagram and stops it on leave. While
 * running it reports this tab's selection, and catches up when the tab returns
 * from a long absence or the browser comes back online.
 */
export function useCollaboration(api: EditorStoreApi, beforeEnable: () => Promise<void>): CollabClient | null {
  const provided = useContext(CollabTransportContext);
  const { token } = useSession();
  const tokenRef = useRef(token);
  tokenRef.current = token;
  const beforeEnableRef = useRef(beforeEnable);
  beforeEnableRef.current = beforeEnable;
  const [client, setClient] = useState<CollabClient | null>(null);

  useEffect(() => {
    const transport = provided ?? cableTransport(() => tokenRef.current);
    const session = new CollabClient({ store: api, transport, beforeEnable: () => beforeEnableRef.current() });
    session.start();
    setClient(session);

    const report = () => {
      const { editingNodeId, selectedNodeIds } = api.getState();
      session.setSelection(editingNodeId ?? selectedNodeIds[0] ?? null, editingNodeId !== null);
    };
    report();
    const unsubscribe = api.subscribe((next, previous) => {
      if (next.selectedNodeIds !== previous.selectedNodeIds || next.editingNodeId !== previous.editingNodeId) report();
    });
    let hiddenAt: number | null = null;
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now();
        return;
      }
      if (hiddenAt !== null && Date.now() - hiddenAt > AWAY_MS) session.resume();
      hiddenAt = null;
    };
    const onOnline = () => {
      session.resume();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", onOnline);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", onOnline);
      unsubscribe();
      session.stop();
      setClient(null);
    };
  }, [api, provided]);

  return client;
}
