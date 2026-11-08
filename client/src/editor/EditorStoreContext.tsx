import { createContext, useContext, useState, type ReactNode } from "react";
import { useStore } from "zustand";
import { useShallow } from "zustand/react/shallow";
import { perfFlags } from "../perf/flags";
import { createEditorStore, type EditorStore, type EditorStoreApi } from "./store";

const EditorStoreContext = createContext<EditorStoreApi | null>(null);

/** One store per editor page, so leaving a diagram drops its whole session. */
export function EditorStoreProvider({ children, store }: { children: ReactNode; store?: EditorStoreApi }) {
  const [api] = useState(() => store ?? createEditorStore());
  return <EditorStoreContext.Provider value={api}>{children}</EditorStoreContext.Provider>;
}

export function useEditorStoreApi(): EditorStoreApi {
  const api = useContext(EditorStoreContext);
  if (!api) throw new Error("useEditorStoreApi must be used inside <EditorStoreProvider>");
  return api;
}

/** Subscribes to one value. Use for primitives and stable references. */
export function useEditor<T>(selector: (state: EditorStore) => T): T {
  return useStore(useEditorStoreApi(), selector);
}

/** Subscribes to a derived tuple or object, re-rendering only when an entry changes. */
function useShallowSlice<T>(selector: (state: EditorStore) => T): T {
  return useStore(useEditorStoreApi(), useShallow(selector));
}

/**
 * The `no-shallow` debug flag: the pattern shallow selectors replace. An
 * object selector compared by reference would return a new object on every
 * read (zustand refuses that with an update loop), so code without shallow
 * equality subscribes to the whole state and derives its slice in render. It
 * then re-renders on every store change.
 */
function useWholeState<T>(selector: (state: EditorStore) => T): T {
  return selector(useStore(useEditorStoreApi()));
}

export const useEditorShallow: <T>(selector: (state: EditorStore) => T) => T = perfFlags.shallow
  ? useShallowSlice
  : useWholeState;
