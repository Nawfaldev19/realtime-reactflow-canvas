import type { DocumentState } from "../document/types";
import { sameContent } from "./diff";

// When the editor takes its periodic ("automatic") version.
//
// Editing time, not wall-clock time: each local edit adds the time since the
// previous edit, capped at MAX_EDIT_CREDIT_MS, so a tab left open overnight
// does not count as ten hours of work, and a slow, steady session still
// reaches the interval. Once INTERVAL_MS of editing has accumulated:
//
// - if the document shows the same diagram as at the last version this tab
//   saw (an edit that was undone, a step moved and moved back), the clock
//   starts over and nothing is sent: de-duplication;
// - otherwise a version is due.
//
// Only this person's own edits count, so a tab that only watches never asks
// for versions. The server de-duplicates again (an unchanged document, or a
// version younger than five minutes from a collaborator's tab), because each
// tab only knows its own edits.

export const INTERVAL_MS = 10 * 60_000;
export const MAX_EDIT_CREDIT_MS = 2 * 60_000;

export interface Cadence {
  /** The document at the last version this tab took or saw. */
  readonly baseline: DocumentState;
  /** Editing time since then. */
  readonly editingMs: number;
  readonly lastEditAt: number | null;
}

export type CadenceDecision = "wait" | "unchanged" | "due";

export function startCadence(baseline: DocumentState): Cadence {
  return { baseline, editingMs: 0, lastEditAt: null };
}

/** Records a local edit at `now` (milliseconds). */
export function noteEdit(cadence: Cadence, now: number): Cadence {
  const credit = cadence.lastEditAt === null ? 0 : Math.min(Math.max(0, now - cadence.lastEditAt), MAX_EDIT_CREDIT_MS);
  return { ...cadence, editingMs: cadence.editingMs + credit, lastEditAt: now };
}

/** Whether a periodic version is due for `current`. */
export function decide(cadence: Cadence, current: DocumentState, interval = INTERVAL_MS): CadenceDecision {
  if (cadence.editingMs < interval) return "wait";
  return sameContent(cadence.baseline, current) ? "unchanged" : "due";
}

/** After a version was taken (by this tab, manually or periodically) or found unneeded: the clock starts over from `doc`. */
export function restart(cadence: Cadence, doc: DocumentState): Cadence {
  return { baseline: doc, editingMs: 0, lastEditAt: cadence.lastEditAt };
}
