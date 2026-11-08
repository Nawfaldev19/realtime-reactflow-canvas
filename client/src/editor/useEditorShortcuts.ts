import { useEffect } from "react";
import { commandFor, READ_ONLY_COMMANDS, type ShortcutCommand } from "./shortcuts";
import type { EditorStoreApi } from "./store";

function run(api: EditorStoreApi, command: ShortcutCommand): void {
  const state = api.getState();
  switch (command.type) {
    case "arrange":
      state.arrangeSelection(command.command);
      break;
    case "group":
      state.groupSelection();
      break;
    case "ungroup":
      state.ungroupSelection();
      break;
    case "edit":
      state.startEditing(command.nodeId);
      break;
    case "stop-drawing":
      state.setDrawMode(false);
      break;
    case "remove-last-stroke":
      state.removeLastStroke();
      break;
    case "undo":
      state.undo();
      break;
    case "redo":
      state.redo();
      break;
    case "duplicate":
      state.duplicateSelection();
      break;
    case "find":
      state.setSearchOpen(true);
      break;
  }
}

/** Window-level shortcuts for one editor session, plus the Alt key that lets children leave their group. */
export function useEditorShortcuts(api: EditorStoreApi): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Alt") api.getState().setDetachMode(true);
      const command = commandFor(event, { drawMode: api.getState().drawMode });
      if (!command || (!api.getState().canEdit && !READ_ONLY_COMMANDS.has(command.type))) return;
      event.preventDefault();
      run(api, command);
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === "Alt") api.getState().setDetachMode(false);
    };
    const onBlur = () => api.getState().setDetachMode(false);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, [api]);
}
