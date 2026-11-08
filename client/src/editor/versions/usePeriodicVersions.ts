import { useCallback, useEffect, useRef } from "react";
import type { DocumentState } from "../../document/types";
import { decide, INTERVAL_MS, noteEdit, restart, startCadence, type Cadence } from "../../versions/cadence";
import type { EditorStoreApi } from "../store";

const systemNow = () => Date.now();

/**
 * Takes the periodic version: after every 10 minutes of this person's
 * editing, when the diagram changed since the last version this tab saw
 * (versions/cadence.ts). Returns `captured`, which a manual "Save version"
 * calls so the clock starts over from it.
 */
export function usePeriodicVersions(
  api: EditorStoreApi,
  saveAutomatic: () => Promise<unknown>,
  { interval = INTERVAL_MS, now = systemNow } = {},
) {
  const cadence = useRef<Cadence | null>(null);
  const busy = useRef(false);
  const saveRef = useRef(saveAutomatic);
  saveRef.current = saveAutomatic;

  const captured = useCallback((doc: DocumentState) => {
    if (cadence.current) cadence.current = restart(cadence.current, doc);
  }, []);

  useEffect(() => {
    cadence.current = startCadence(api.getState().doc);
    return api.subscribe((next, previous) => {
      if (!next.canEdit || next.localSeq === previous.localSeq || !cadence.current) return;
      cadence.current = noteEdit(cadence.current, now());
      const decision = decide(cadence.current, next.doc, interval);
      if (decision === "unchanged") captured(next.doc);
      if (decision !== "due" || busy.current) return;
      busy.current = true;
      const doc = next.doc;
      // A failed attempt (offline, say) leaves the version due, so the next edit tries again.
      void saveRef
        .current()
        .then(
          () => captured(doc),
          () => undefined,
        )
        .finally(() => {
          busy.current = false;
        });
    });
  }, [api, captured, interval, now]);

  return captured;
}
