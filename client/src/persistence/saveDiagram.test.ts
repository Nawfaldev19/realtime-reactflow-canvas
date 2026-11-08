import { ApolloClient, InMemoryCache } from "@apollo/client";
import { MockLink, type MockedResponse } from "@apollo/client/testing";
import { DIAGRAM, SAVE_DIAGRAM } from "../graphql/operations";
import { REVISION_CONFLICT, saveDiagram } from "./saveDiagram";
import type { SaveSnapshot } from "./autosave";

const snapshot: SaveSnapshot = {
  baseRevision: 2,
  document: { schemaVersion: 1, nodes: [], edges: [], nextNumber: 1 },
  changeId: 4,
};
const variables = { id: "9", baseRevision: 2, document: snapshot.document };

function clientWith(mocks: MockedResponse[]) {
  return new ApolloClient({ link: new MockLink(mocks), cache: new InMemoryCache() });
}

const saveReply = (diagram: object | null, errors: object[]) => ({
  request: { query: SAVE_DIAGRAM, variables },
  result: { data: { saveDiagram: { __typename: "SaveDiagramPayload", diagram, errors } } },
});

describe("saveDiagram", () => {
  it("maps an accepted save to the new revision", async () => {
    const client = clientWith([
      saveReply({ __typename: "Diagram", id: "9", revision: 3, updatedAt: "2031-03-10T08:00:00Z" }, []),
    ]);

    await expect(saveDiagram(client, "9", snapshot, { keepalive: false })).resolves.toEqual({
      kind: "saved",
      revision: 3,
    });
  });

  it("on a revision conflict, fetches the stored copy and who saved it", async () => {
    const latest = {
      request: { query: DIAGRAM, variables: { id: "9" } },
      result: {
        data: {
          diagram: {
            __typename: "Diagram",
            id: "9",
            title: "Plan",
            revision: 5,
            document: { nodes: [] },
            viewSettings: {},
            canEdit: true,
            updatedAt: "2031-03-10T08:00:00Z",
            updatedBy: { __typename: "Member", id: "2", name: "Ben Lindqvist" },
            collaborationEnabled: false,
            workspace: {
              __typename: "Workspace",
              id: "1",
              name: "Riverside Makers",
              navigationMode: "PAN",
              role: "EDITOR",
            },
          },
        },
      },
    };
    const conflict = saveReply(null, [
      { __typename: "UserError", field: null, message: "Changed elsewhere", code: REVISION_CONFLICT },
    ]);

    await expect(saveDiagram(clientWith([conflict, latest]), "9", snapshot, { keepalive: true })).resolves.toEqual({
      kind: "conflict",
      revision: 5,
      document: { nodes: [] },
      updatedBy: "Ben Lindqvist",
    });
  });

  it("reports other errors as a rejected save", async () => {
    const invalid = saveReply(null, [
      { __typename: "UserError", field: "document", message: "Document is larger than 2 MB", code: null },
    ]);

    await expect(saveDiagram(clientWith([invalid]), "9", snapshot, { keepalive: false })).resolves.toEqual({
      kind: "rejected",
      message: "Document is larger than 2 MB",
    });
    await expect(
      saveDiagram(clientWith([saveReply(null, [])]), "9", snapshot, { keepalive: false }),
    ).resolves.toMatchObject({ kind: "rejected" });
  });

  it("rejects on network failure so autosave can retry", async () => {
    const down = { request: { query: SAVE_DIAGRAM, variables }, error: new Error("offline") };

    await expect(saveDiagram(clientWith([down]), "9", snapshot, { keepalive: false })).rejects.toThrow("offline");
  });
});
