import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useReactFlow } from "@xyflow/react";
import { Search, X } from "lucide-react";
import { absoluteBox } from "../document/groups";
import {
  CATEGORY_LABELS,
  SEARCH_CATEGORIES,
  createSearchIndex,
  searchEntries,
  type CategoryFilter,
  type SearchHit,
} from "../document/search";
import { boundsOf, boxCentre } from "../geometry/vector";
import { prefersReducedMotion } from "../lib/motion";
import { useEditor, useEditorStoreApi } from "./EditorStoreContext";
import type { EditorStoreApi } from "./store";

// Find in diagram (Ctrl/Cmd+F). Searches the document, not the page, so it
// finds steps that are off screen. Typing searches after 150 ms; chips filter
// by category with counts; arrows move through the results; Enter or a click
// pans and zooms to the result and highlights it for a moment; Escape closes.

export const SEARCH_DELAY = 150;
const FOCUS_ZOOM = 1;

function revealHit(
  api: EditorStoreApi,
  hit: SearchHit,
  setCenter: ReturnType<typeof useReactFlow>["setCenter"],
  zoom: number,
) {
  const state = api.getState();
  const { doc } = state;
  const edge = hit.entry.target === "edge" ? doc.edges[hit.entry.targetId] : undefined;
  const box = edge
    ? boundsOf([absoluteBox(doc, edge.source), absoluteBox(doc, edge.target)].filter((entry) => entry !== null))
    : absoluteBox(doc, hit.entry.targetId);
  if (!box) return;
  const centre = boxCentre(box);
  void setCenter(centre.x, centre.y, { zoom: Math.max(zoom, FOCUS_ZOOM), duration: prefersReducedMotion() ? 0 : 300 });
  if (edge) {
    state.setSelection([], [edge.id]);
  } else {
    state.setSelection([hit.entry.targetId], []);
    state.pulseNode(hit.entry.targetId);
  }
}

function SearchPanelBody() {
  const api = useEditorStoreApi();
  const doc = useEditor((state) => state.doc);
  const { setCenter, getZoom } = useReactFlow();
  const [index] = useState(createSearchIndex);
  const [text, setText] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<CategoryFilter>("all");
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const entries = useMemo(() => index(doc), [index, doc]);
  const { hits, counts } = useMemo(() => searchEntries(entries, query, filter), [entries, query, filter]);

  useEffect(() => {
    input.current?.focus();
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(text);
      setActive(0);
    }, SEARCH_DELAY);
    return () => clearTimeout(timer);
  }, [text]);

  const close = () => api.getState().setSearchOpen(false);
  const reveal = (at: number) => {
    const hit = hits[at];
    if (!hit) return;
    setActive(at);
    revealHit(api, hit, setCenter, getZoom());
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (hits.length > 0)
        setActive((current) => (current + (event.key === "ArrowDown" ? 1 : hits.length - 1)) % hits.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      reveal(active);
    }
  };

  return (
    <section className="search-panel" aria-label="Find in diagram" onKeyDown={onKeyDown}>
      <div className="search-panel__bar">
        <Search size={16} aria-hidden="true" />
        <input
          ref={input}
          className="input input-compact"
          type="search"
          aria-label="Find in diagram"
          placeholder="Find steps, notes, labels…"
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
        <button type="button" className="button button-ghost button-icon" aria-label="Close search" onClick={close}>
          <X size={16} aria-hidden="true" />
        </button>
      </div>
      {query.trim() !== "" && (
        <>
          <div className="search-panel__chips" role="group" aria-label="Filter results">
            {(["all", ...SEARCH_CATEGORIES] as const).map((category) => (
              <button
                key={category}
                type="button"
                className="chip"
                aria-pressed={filter === category}
                onClick={() => setFilter(category)}
              >
                {category === "all" ? "All" : CATEGORY_LABELS[category]}{" "}
                <span className="chip__count">{counts[category]}</span>
              </button>
            ))}
          </div>
          <p className="visually-hidden" role="status">
            {counts.all === 1 ? "1 result" : `${String(counts.all)} results`}
          </p>
          {hits.length === 0 ? (
            <p className="search-panel__empty">No matches.</p>
          ) : (
            <ul className="search-panel__results" aria-label="Results">
              {hits.map((hit, at) => (
                <li key={`${hit.entry.target}:${hit.entry.targetId}`}>
                  <button
                    type="button"
                    className="search-result"
                    aria-current={at === active ? "true" : undefined}
                    onClick={() => reveal(at)}
                  >
                    <span className="search-result__meta">
                      <span className="badge">{hit.entry.badge}</span>
                      <span className="search-result__category">{CATEGORY_LABELS[hit.entry.category]}</span>
                    </span>
                    <span className="search-result__excerpt">
                      {hit.excerpt.cutStart && "…"}
                      {hit.excerpt.before}
                      <mark>{hit.excerpt.match}</mark>
                      {hit.excerpt.after}
                      {hit.excerpt.cutEnd && "…"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

export function SearchPanel() {
  const open = useEditor((state) => state.searchOpen);
  return open ? <SearchPanelBody /> : null;
}
