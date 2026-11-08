import { applyAll } from "../../document/operations";
import { parseDocument, serializeDocument } from "../../document/serialize";
import { dropPending, receiveOps, receiveSnapshot } from "../../collab/reconcile";
import { EMPTY_POSITIONS, type SliceContext } from "./shared";
import type { EditorActions } from "./types";

// Where local operations go: the collaboration room (driven by
// collab/client.ts) or autosave. While collaborating, `doc` is the visible
// copy: the server's confirmed document with the pending local operations on
// top (collab/reconcile.ts). Remote operations never enter this person's undo
// history.

export type CollaborationSlice = Pick<
  EditorActions,
  | "setCollaborating"
  | "setCollaborationEnabled"
  | "setSyncStatus"
  | "setCollabNotice"
  | "setSessionId"
  | "receiveOps"
  | "receiveSnapshot"
  | "dropPending"
  | "snapshot"
  | "markSaved"
  | "rebase"
  | "setSaveStatus"
  | "dismissMergeNotice"
>;

export function collaborationSlice({
  set,
  get,
  storeReplica,
  replicaOf,
  validReference,
}: SliceContext): CollaborationSlice {
  return {
    setCollaborating: (collaborating) => {
      if (get().collaborating !== collaborating) set({ collaborating });
    },

    setCollaborationEnabled: (collaborationEnabled) => {
      if (get().collaborationEnabled !== collaborationEnabled) set({ collaborationEnabled });
    },

    setSyncStatus: (syncStatus) => {
      if (get().syncStatus !== syncStatus) set({ syncStatus });
    },

    setCollabNotice: (collabNotice) => {
      set({ collabNotice });
    },

    setSessionId: (sessionId) => {
      if (get().sessionId !== sessionId) set({ sessionId });
    },

    receiveOps: (messages) => {
      const last = messages.at(-1);
      if (!last) return [];
      const { replica, acknowledged } = receiveOps(replicaOf(), messages, get().sessionId);
      storeReplica(replica, { revision: last.seq });
      return acknowledged;
    },

    receiveSnapshot: (document, revision) => {
      storeReplica(receiveSnapshot(replicaOf(), parseDocument(document).state), { revision });
    },

    dropPending: (seq) => {
      storeReplica(dropPending(replicaOf(), seq));
    },

    snapshot: () => {
      const { doc, revision, localSeq } = get();
      return { baseRevision: revision, document: serializeDocument(doc), changeId: localSeq };
    },

    markSaved: (revision, changeId) => {
      set({ revision, pending: get().pending.filter((entry) => entry.seq > changeId) });
    },

    rebase: (conflict) => {
      const { pending, live, editingNodeId } = get();
      const base = parseDocument(conflict.document).state;
      const { state, skipped } = applyAll(
        base,
        pending.map((entry) => entry.op),
      );
      const { selectedNodeIds, selectedEdgeIds } = get();
      set({
        doc: state,
        revision: conflict.revision,
        dragPositions: EMPTY_POSITIONS,
        live: Object.fromEntries(Object.entries(live).filter(([id]) => id in state.nodes)),
        editingNodeId: editingNodeId !== null && editingNodeId in state.nodes ? editingNodeId : null,
        selectedNodeIds: selectedNodeIds.filter((id) => id in state.nodes),
        selectedEdgeIds: selectedEdgeIds.filter((id) => id in state.edges),
        mergeNotice: { updatedBy: conflict.updatedBy, dropped: skipped },
        ...validReference(state),
      });
    },

    setSaveStatus: (saveStatus) => {
      set({ saveStatus });
    },

    dismissMergeNotice: () => {
      set({ mergeNotice: null });
    },
  };
}
