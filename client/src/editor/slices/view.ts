import { sameIds, type SliceContext } from "./shared";
import type { EditorActions } from "./types";

// Personal state: the selection, snapping, the view settings, guides, search
// and highlights. Never part of the document and never sent to peers;
// selecting a node on one screen must not change another person's selection.

export type ViewSlice = Pick<
  EditorActions,
  | "setSelection"
  | "setGuides"
  | "setRenderAll"
  | "setSnapping"
  | "setViewSettings"
  | "setViewSettingsStatus"
  | "setSearchOpen"
  | "pulseNode"
>;

export function viewSlice({ set, get }: SliceContext): ViewSlice {
  return {
    setSelection: (nodeIds, edgeIds) => {
      const { selectedNodeIds, selectedEdgeIds, editingNodeId, finishEditing } = get();
      if (sameIds(nodeIds, selectedNodeIds) && sameIds(edgeIds, selectedEdgeIds)) return;
      if (editingNodeId !== null && !nodeIds.includes(editingNodeId)) finishEditing();
      set({ selectedNodeIds: nodeIds, selectedEdgeIds: edgeIds });
    },

    setGuides: (guides) => {
      const current = get().guides;
      if (current.horizontal !== guides.horizontal || current.vertical !== guides.vertical) set({ guides });
    },

    setRenderAll: (renderAll) => {
      if (get().renderAll !== renderAll) set({ renderAll });
    },

    setSnapping: (settings) => {
      const snapping = { ...get().snapping, ...settings };
      set({ snapping });
      const { viewSettings, setViewSettings } = get();
      if (snapping.enabled !== viewSettings.snapping.enabled || snapping.nearest !== viewSettings.snapping.nearest) {
        setViewSettings({ snapping: { enabled: snapping.enabled, nearest: snapping.nearest } });
      }
    },

    setViewSettings: (patch) => {
      const { canEdit, viewSettings, viewSettingsSeq } = get();
      if (!canEdit) return;
      set({ viewSettings: { ...viewSettings, ...patch }, viewSettingsSeq: viewSettingsSeq + 1 });
    },

    setViewSettingsStatus: (viewSettingsStatus) => {
      if (get().viewSettingsStatus !== viewSettingsStatus) set({ viewSettingsStatus });
    },

    setSearchOpen: (searchOpen) => {
      if (get().searchOpen !== searchOpen) set({ searchOpen });
    },

    pulseNode: (id) => {
      set({ pulse: { id, seq: (get().pulse?.seq ?? 0) + 1 } });
    },
  };
}
