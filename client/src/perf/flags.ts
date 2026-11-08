// The large-diagram rendering techniques, each with a debug switch. Every technique
// is on by default; a query flag `no-<technique>` (for example
// `/stress?no-memo&no-visible`) turns it off for measurement. The flags are
// read once when the app loads, so switching one means loading the page
// again; that keeps the hot paths free of per-render lookups.

export const TECHNIQUES = ["memo", "shallow", "visible", "guards", "stable", "batch"] as const;
export type Technique = (typeof TECHNIQUES)[number];

export type PerfFlags = Readonly<Record<Technique, boolean>>;

export const ALL_ON: PerfFlags = { memo: true, shallow: true, visible: true, guards: true, stable: true, batch: true };

/** What each switch controls, for the stress page and the docs. */
export const TECHNIQUE_LABELS: Readonly<Record<Technique, string>> = {
  memo: "Memoized node content",
  shallow: "Shallow store selectors",
  visible: "Visible-only rendering",
  guards: "No-op update guards",
  stable: "Stable callbacks",
  batch: "One operation per drag",
};

/** The query flag that turns a technique off. */
export const offFlag = (technique: Technique): string => `no-${technique}`;

/** Reads the switches from a query string; anything unrecognised is ignored. */
export function parsePerfFlags(search: string): PerfFlags {
  const params = new URLSearchParams(search);
  const flags: Record<Technique, boolean> = { ...ALL_ON };
  for (const technique of TECHNIQUES) if (params.has(offFlag(technique))) flags[technique] = false;
  return flags;
}

/** The techniques switched off, in declaration order. */
export const disabledTechniques = (flags: PerfFlags): Technique[] =>
  TECHNIQUES.filter((technique) => !flags[technique]);

/** A query string for these switches (empty when everything is on), keeping any other parameters of `base`. */
export function perfSearch(flags: PerfFlags, base = ""): string {
  const params = new URLSearchParams(base);
  for (const technique of TECHNIQUES) params.delete(offFlag(technique));
  for (const technique of disabledTechniques(flags)) params.set(offFlag(technique), "");
  const query = params.toString().replace(/=(&|$)/g, "$1");
  return query === "" ? "" : `?${query}`;
}

/** The switches of this page load. */
export const perfFlags: PerfFlags = parsePerfFlags(typeof window === "undefined" ? "" : window.location.search);
