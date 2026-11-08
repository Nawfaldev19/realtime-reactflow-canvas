import type { DiagramVersionsQuery } from "../../graphql/generated/graphql";

/** The compare pickers' value for the live diagram. */
export const CURRENT = "current";

export type VersionSummary = DiagramVersionsQuery["diagram"]["versions"]["nodes"][number];

const KIND_NAMES: Readonly<Record<VersionSummary["kind"], string>> = {
  CREATED: "Created",
  MANUAL: "Saved version",
  AUTOMATIC: "Automatic version",
  RESTORE: "Before a restore",
};

/** "v3 · Legs glued", or the kind when the version has no label. */
export function versionTitle(version: Pick<VersionSummary, "number" | "label" | "kind">): string {
  return `v${String(version.number)} · ${version.label ?? KIND_NAMES[version.kind]}`;
}

/** Appends a page, dropping rows already shown (a refresh may overlap). */
export function mergePages(shown: readonly VersionSummary[], page: readonly VersionSummary[]): VersionSummary[] {
  const seen = new Set(shown.map((version) => version.id));
  return [...shown, ...page.filter((version) => !seen.has(version.id))];
}
