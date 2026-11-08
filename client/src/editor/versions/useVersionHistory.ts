import { useCallback } from "react";
import { useMutation, useQuery } from "@apollo/client";
import { parseDocument } from "../../document/serialize";
import { COPY_VERSION, DIAGRAM_VERSIONS, RESTORE_VERSION, SAVE_VERSION } from "../../graphql/operations";
import type { EditorStoreApi } from "../store";
import { mergePages, type VersionSummary } from "./versionList";

// The version endpoints for one diagram: the list (pages of 20, newest first,
// by cursor, fetched only while the history panel is open), saving, restoring
// and copying. Every write first waits for what
// the editor has not stored yet (`prepare`: the autosave flush, or the
// collaboration queue draining), because the server takes versions of the
// stored document.

export const PAGE_SIZE = 20;

export interface SaveOutcome {
  readonly created: boolean;
  readonly number: number | null;
  readonly error: string | null;
}

export function useVersionHistory(
  api: EditorStoreApi,
  diagramId: string,
  prepare: () => Promise<void>,
  listOpen: boolean,
) {
  const list = useQuery(DIAGRAM_VERSIONS, {
    variables: { id: diagramId, first: PAGE_SIZE },
    fetchPolicy: "network-only",
    notifyOnNetworkStatusChange: true,
    skip: !listOpen,
  });
  const [saveMutation] = useMutation(SAVE_VERSION);
  const [restoreMutation] = useMutation(RESTORE_VERSION);
  const [copyMutation] = useMutation(COPY_VERSION);
  const { refetch, fetchMore } = list;
  const page = list.data?.diagram.versions;
  const refresh = useCallback(async () => {
    if (listOpen) await refetch();
  }, [listOpen, refetch]);

  const loadMore = useCallback(async () => {
    if (!page?.endCursor) return;
    await fetchMore({
      variables: { after: page.endCursor },
      updateQuery: (previous, { fetchMoreResult }) => ({
        diagram: {
          ...fetchMoreResult.diagram,
          versions: {
            ...fetchMoreResult.diagram.versions,
            nodes: mergePages(previous.diagram.versions.nodes, fetchMoreResult.diagram.versions.nodes),
          },
        },
      }),
    });
  }, [fetchMore, page?.endCursor]);

  const save = useCallback(
    async (label: string | null, automatic = false): Promise<SaveOutcome> => {
      await prepare();
      const { data } = await saveMutation({ variables: { diagramId, label, automatic } });
      const result = data?.saveVersion;
      if (!result || result.errors.length > 0)
        return { created: false, number: null, error: result?.errors[0]?.message ?? "The version could not be saved" };
      if (result.created) await refresh();
      return { created: result.created, number: result.version?.number ?? null, error: null };
    },
    [diagramId, prepare, refresh, saveMutation],
  );

  /** Restores a version as one operation; resolves to false when the diagram already showed it. */
  const restore = useCallback(
    async (version: VersionSummary): Promise<boolean> => {
      await prepare();
      const { data } = await restoreMutation({ variables: { versionId: version.id } });
      const target = data?.restoreVersion.version;
      if (!target) throw new Error(data?.restoreVersion.errors[0]?.message ?? "The version could not be restored");
      const changed = api.getState().restoreVersion(parseDocument(target.document).state);
      await refresh();
      return changed;
    },
    [api, prepare, refresh, restoreMutation],
  );

  const copy = useCallback(
    async (version: VersionSummary): Promise<string> => {
      const { data } = await copyMutation({ variables: { versionId: version.id } });
      const id = data?.copyVersion.diagram?.id;
      if (!id) throw new Error(data?.copyVersion.errors[0]?.message ?? "The copy could not be made");
      return id;
    },
    [copyMutation],
  );

  return {
    list,
    versions: page?.nodes ?? [],
    hasNextPage: page?.hasNextPage ?? false,
    totalCount: page?.totalCount ?? 0,
    loadMore,
    refresh,
    save,
    restore,
    copy,
  };
}

export type VersionHistory = ReturnType<typeof useVersionHistory>;
