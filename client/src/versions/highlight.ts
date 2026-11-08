import type { ChangeKind, ChangeStatus } from "./diff";

// How a compared entity is drawn, from its status and the compare filters.
//
// Unchanged entities are drawn in greyscale so the highlights stand out. A
// highlighted entity glows in its colour and carries a text tag ("Added"), so
// the meaning never rests on colour alone. Switching a filter off fades that
// category back to the plain look; removed entities exist only in the older
// version, so with their filter off they are hidden altogether.

export type CompareFilters = Readonly<Record<ChangeKind, boolean>>;

export const ALL_FILTERS: CompareFilters = { added: true, removed: true, changed: true };

export type Highlight = ChangeKind | "plain" | "hidden";

export const HIGHLIGHT_LABELS: Readonly<Record<ChangeKind, string>> = {
  added: "Added",
  removed: "Removed",
  changed: "Changed",
};

export function highlightOf(status: ChangeStatus | undefined, filters: CompareFilters): Highlight {
  if (status === undefined || status === "unchanged") return "plain";
  if (filters[status]) return status;
  return status === "removed" ? "hidden" : "plain";
}

/** Highlighted steps are raised above the plain ones (groups keep their layer, below the connectors). */
export const HIGHLIGHT_LIFT = 2_000_000;
