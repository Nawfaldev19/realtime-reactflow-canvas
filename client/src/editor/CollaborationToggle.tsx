import { useState } from "react";
import { useMutation } from "@apollo/client";
import { Users, UserX } from "lucide-react";
import { SET_COLLABORATION } from "../graphql/operations";
import { useEditor } from "./EditorStoreContext";

/**
 * The diagram's live-collaboration switch. Only owners may change it; the
 * change reaches every open editor through the room, this one included, so
 * the switch shows the announced state rather than guessing.
 */
export function CollaborationToggle({ diagramId, canManage }: { diagramId: string; canManage: boolean }) {
  const enabled = useEditor((state) => state.collaborationEnabled);
  const [setCollaboration] = useMutation(SET_COLLABORATION);
  const [busy, setBusy] = useState(false);
  const toggle = async () => {
    setBusy(true);
    try {
      await setCollaboration({ variables: { id: diagramId, enabled: !enabled } });
    } finally {
      setBusy(false);
    }
  };
  const state = enabled ? "on" : "off";
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-label="Live collaboration"
      className="button button-ghost button-icon collab-toggle"
      disabled={!canManage || busy}
      title={
        canManage
          ? `Live collaboration is ${state}`
          : `Live collaboration is ${state}. Only workspace owners can change it.`
      }
      onClick={() => void toggle()}
    >
      {enabled ? <Users size={18} aria-hidden="true" /> : <UserX size={18} aria-hidden="true" />}
    </button>
  );
}
