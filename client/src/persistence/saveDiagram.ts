import type { ApolloClient } from "@apollo/client";
import { DIAGRAM, SAVE_DIAGRAM } from "../graphql/operations";
import type { SaveOutcome, SaveSnapshot } from "./autosave";

export const REVISION_CONFLICT = "REVISION_CONFLICT";

/**
 * Sends one save and maps the reply onto an autosave outcome. A conflict
 * fetches the stored copy (and who saved it) so the editor can rebase on it.
 * Network failures reject, which the autosave controller retries.
 */
export async function saveDiagram(
  client: ApolloClient<unknown>,
  diagramId: string,
  snapshot: SaveSnapshot,
  { keepalive }: { keepalive: boolean },
): Promise<SaveOutcome> {
  const { data } = await client.mutate({
    mutation: SAVE_DIAGRAM,
    variables: { id: diagramId, baseRevision: snapshot.baseRevision, document: snapshot.document },
    context: keepalive ? { fetchOptions: { keepalive: true } } : {},
  });
  const payload = data?.saveDiagram;
  if (!payload) throw new Error("Empty save response");

  const [error] = payload.errors;
  if (!error && payload.diagram) return { kind: "saved", revision: payload.diagram.revision };
  if (error?.code !== REVISION_CONFLICT)
    return { kind: "rejected", message: error?.message ?? "The server did not accept this save." };

  const latest = await client.query({ query: DIAGRAM, variables: { id: diagramId }, fetchPolicy: "network-only" });
  return {
    kind: "conflict",
    revision: latest.data.diagram.revision,
    document: latest.data.diagram.document,
    updatedBy: latest.data.diagram.updatedBy?.name ?? null,
  };
}
