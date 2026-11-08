import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ApolloProvider, type Operation } from "@apollo/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { SessionProvider } from "../lib/session";
import { CollabClient } from "../collab/client";
import { createEditorStore } from "../editor/store";
import { CollabTransportContext } from "../editor/useCollaboration";
import { FakeRoom } from "../test/fakeRoom";
import { scriptedClient } from "../test/scriptedClient";
import { EditorPage } from "./EditorPage";

const DOCUMENT = {
  schemaVersion: 1,
  nextNumber: 3,
  nodes: [
    {
      id: "n1",
      key: "n1",
      kind: "start-end",
      number: 1,
      position: { x: 0, y: 0 },
      size: { width: 180, height: 56 },
      parentId: null,
      z: 1,
      style: {},
      data: { text: "Lamp shade" },
    },
    {
      id: "n2",
      key: "n2",
      kind: "step",
      number: 2,
      position: { x: 0, y: 120 },
      size: { width: 180, height: 64 },
      parentId: null,
      z: 2,
      style: {},
      data: { text: "Draw the panels" },
    },
  ],
  edges: [],
};

function diagramReply(
  canEdit: boolean,
  revision = 1,
  updatedBy = "Ada Okafor",
  { collaborationEnabled = false, role = "EDITOR" } = {},
) {
  return {
    data: {
      diagram: {
        __typename: "Diagram",
        id: "9",
        title: "Laser-cut lamp shade",
        revision,
        document: DOCUMENT,
        viewSettings: {},
        canEdit,
        updatedAt: "2031-03-10T08:00:00Z",
        updatedBy: { __typename: "Member", id: "2", name: updatedBy },
        collaborationEnabled,
        workspace: { __typename: "Workspace", id: "20", name: "Riverside Makers", navigationMode: "PAN", role },
      },
    },
  };
}

const saved = (revision: number) => ({
  data: {
    saveDiagram: {
      __typename: "SaveDiagramPayload",
      diagram: { __typename: "Diagram", id: "9", revision, updatedAt: "2031-03-10T08:01:00Z" },
      errors: [],
    },
  },
});

function renderEditor(
  reply: (operation: Operation) => object | Error,
  room = new FakeRoom({ document: DOCUMENT, revision: 1, enabled: false }),
) {
  const scripted = scriptedClient((operation) => reply(operation) as never);
  render(
    <SessionProvider>
      <ApolloProvider client={scripted.client}>
        <CollabTransportContext.Provider value={room.transport({ memberId: "1", name: "Ada Okafor" })}>
          <MemoryRouter initialEntries={["/app/d/9"]}>
            <Routes>
              <Route path="/app/d/:diagramId" element={<EditorPage />} />
              <Route path="/app/d/:diagramId/preview" element={<p>Preview page</p>} />
            </Routes>
          </MemoryRouter>
        </CollabTransportContext.Provider>
      </ApolloProvider>
    </SessionProvider>,
  );
  return { ...scripted, room };
}

/** Another person in the same room, with their own editor session. */
function peer(room: FakeRoom, member: { memberId: string; name: string }) {
  const store = createEditorStore();
  store.getState().load({
    id: "9",
    title: "Laser-cut lamp shade",
    revision: room.revision,
    document: room.document,
    canEdit: true,
    collaborationEnabled: room.enabled,
  });
  const client = new CollabClient({ store, transport: room.transport(member) });
  client.start();
  return { store, client };
}

async function settle(room: FakeRoom) {
  await act(async () => {
    room.settle();
    await Promise.resolve();
  });
}

const named = (operations: Operation[], name: string) =>
  operations.filter((operation) => operation.operationName === name);

describe("EditorPage", () => {
  it("renders the diagram read-only for viewers", async () => {
    renderEditor(() => diagramReply(false));

    expect(await screen.findByRole("heading", { name: "Laser-cut lamp shade" })).toBeInTheDocument();
    expect(screen.getByText("Draw the panels")).toBeInTheDocument();
    expect(screen.getByText("Read-only")).toBeInTheDocument();
    expect(screen.queryByRole("toolbar", { name: "Add to diagram" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Rename diagram" })).not.toBeInTheDocument();
    expect(window.localStorage.getItem("live-canvas.workspace")).toBe("20");
  });

  it("explains a diagram that cannot be opened", async () => {
    renderEditor(() => new Error("down"));

    expect(await screen.findByRole("alert")).toHaveTextContent(/reach the server/);
  });

  it("autosaves an edit two seconds later on the loaded revision", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: (ms) => vi.advanceTimersByTime(ms) });
    const { operations } = renderEditor((operation) =>
      operation.operationName === "SaveDiagram" ? saved(2) : diagramReply(true),
    );

    await user.click(await screen.findByRole("button", { name: "Add step" }));
    expect(screen.getByRole("status")).toHaveTextContent("Unsaved changes");
    expect(screen.getByText("New step")).toBeInTheDocument();

    await act(() => vi.advanceTimersByTimeAsync(2000));

    const [save] = named(operations, "SaveDiagram");
    expect(save?.variables).toMatchObject({ id: "9", baseRevision: 1 });
    expect((save?.variables.document as { nodes: unknown[] }).nodes).toHaveLength(3);
    expect(await screen.findByRole("status")).toHaveTextContent("Saved · just now");
    vi.useRealTimers();
  });

  it("merges with a newer copy after a revision conflict and tells the person", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: (ms) => vi.advanceTimersByTime(ms) });
    let saves = 0;
    let loads = 0;
    const { operations } = renderEditor((operation) => {
      if (operation.operationName === "SaveDiagram") {
        saves += 1;
        return saves === 1
          ? {
              data: {
                saveDiagram: {
                  __typename: "SaveDiagramPayload",
                  diagram: null,
                  errors: [
                    { __typename: "UserError", field: null, message: "Changed elsewhere", code: "REVISION_CONFLICT" },
                  ],
                },
              },
            }
          : saved(6);
      }
      loads += 1;
      return loads === 1 ? diagramReply(true) : diagramReply(true, 5, "Ben Lindqvist");
    });

    await user.click(await screen.findByRole("button", { name: "Add sticky note" }));
    await act(() => vi.advanceTimersByTimeAsync(2000));

    expect(await screen.findByText(/Ben Lindqvist saved changes to this diagram/)).toBeInTheDocument();
    const retried = named(operations, "SaveDiagram")[1];
    expect(retried?.variables).toMatchObject({ baseRevision: 5 });
    vi.useRealTimers();
  });

  it("renames the diagram from the header", async () => {
    const user = userEvent.setup();
    renderEditor((operation) =>
      operation.operationName === "RenameDiagram"
        ? {
            data: {
              renameDiagram: {
                __typename: "RenameDiagramPayload",
                diagram: { __typename: "Diagram", id: "9", title: "Lamp shade, v2" },
                errors: [],
              },
            },
          }
        : diagramReply(true),
    );

    await user.click(await screen.findByRole("button", { name: "Rename diagram" }));
    const input = screen.getByLabelText("Diagram title");
    await user.clear(input);
    await user.type(input, "Lamp shade, v2");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("heading", { name: "Lamp shade, v2" })).toBeInTheDocument();
  });

  it("shows why a rename failed, and Escape cancels", async () => {
    const user = userEvent.setup();
    renderEditor((operation) =>
      operation.operationName === "RenameDiagram"
        ? {
            data: {
              renameDiagram: {
                __typename: "RenameDiagramPayload",
                diagram: null,
                errors: [{ __typename: "UserError", field: "title", message: "Title can't be blank" }],
              },
            },
          }
        : diagramReply(true),
    );

    await user.click(await screen.findByRole("button", { name: "Rename diagram" }));
    await user.clear(screen.getByLabelText("Diagram title"));
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Title can't be blank");

    await user.type(screen.getByLabelText("Diagram title"), "{Escape}");
    expect(screen.getByRole("heading", { name: "Laser-cut lamp shade" })).toBeInTheDocument();
  });

  it("saves view settings half a second after a change, without saving the document", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: (ms) => vi.advanceTimersByTime(ms) });
    const { operations } = renderEditor((operation) =>
      operation.operationName === "UpdateViewSettings"
        ? {
            data: {
              updateViewSettings: {
                __typename: "UpdateViewSettingsPayload",
                diagram: { __typename: "Diagram", id: "9", viewSettings: operation.variables.viewSettings as unknown },
                errors: [],
              },
            },
          }
        : diagramReply(true),
    );

    await user.click(await screen.findByRole("button", { name: "View" }));
    await user.click(screen.getByLabelText(/Animate on open/));
    expect(named(operations, "UpdateViewSettings")).toHaveLength(0);
    await act(() => vi.advanceTimersByTimeAsync(500));

    const [update] = named(operations, "UpdateViewSettings");
    expect(update?.variables).toMatchObject({
      id: "9",
      viewSettings: { animateOnOpen: true, openingView: { mode: "fitWidth" }, snapping: { enabled: true, nearest: 2 } },
    });
    expect(named(operations, "SaveDiagram")).toHaveLength(0);
    expect(await screen.findByText("View settings saved")).toBeInTheDocument();
    vi.useRealTimers();
  });

  it("saves pending changes before opening the preview", async () => {
    const user = userEvent.setup();
    const { operations } = renderEditor((operation) =>
      operation.operationName === "SaveDiagram" ? saved(2) : diagramReply(true),
    );

    await user.click(await screen.findByRole("button", { name: "Add step" }));
    await user.click(screen.getByRole("button", { name: "Preview" }));

    expect(await screen.findByText("Preview page")).toBeInTheDocument();
    expect(named(operations, "SaveDiagram")).toHaveLength(1);
  });

  it("stores the member's navigation mode from the view footer", async () => {
    const user = userEvent.setup();
    const { operations } = renderEditor((operation) =>
      operation.operationName === "SetNavigationMode"
        ? { data: { setNavigationMode: { __typename: "SetNavigationModePayload", viewer: null, errors: [] } } }
        : diagramReply(true),
    );

    await user.click(await screen.findByRole("button", { name: /Scroll mode/ }));
    expect(named(operations, "SetNavigationMode")[0]?.variables).toEqual({ mode: "SCROLL" });
  });

  describe("live collaboration", () => {
    const collaborative = () => new FakeRoom({ document: DOCUMENT, revision: 1, enabled: true });

    it("sends edits to the room instead of saving the document, and shows them as saved once stored", async () => {
      const user = userEvent.setup();
      const room = collaborative();
      const { operations } = renderEditor(
        () => diagramReply(true, 1, "Ada Okafor", { collaborationEnabled: true }),
        room,
      );
      await screen.findByRole("heading", { name: "Laser-cut lamp shade" });
      await settle(room);
      expect(screen.getByRole("status")).toHaveTextContent("All changes saved");

      await user.click(screen.getByRole("button", { name: "Add step" }));
      expect(screen.getByRole("status")).toHaveTextContent("Saving…");
      await settle(room);

      expect(screen.getByRole("status")).toHaveTextContent("Saved · just now");
      expect(Object.keys(room.state.nodes)).toHaveLength(3);
      expect(named(operations, "SaveDiagram")).toHaveLength(0);
    });

    it("shows who is here, their cursors in canvas coordinates and a badge on the step they selected", async () => {
      const room = collaborative();
      renderEditor(() => diagramReply(true, 1, "Ada Okafor", { collaborationEnabled: true }), room);
      await screen.findByRole("heading", { name: "Laser-cut lamp shade" });
      await settle(room);
      const ben = peer(room, { memberId: "2", name: "Ben Lindqvist" });
      await settle(room);
      act(() => {
        ben.client.setCursor({ x: 40, y: 150 });
        ben.store.getState().setSelection(["n2"], []);
        ben.client.setSelection("n2", false);
      });
      await settle(room);

      expect(screen.getByRole("list", { name: "People in this diagram" })).toHaveTextContent("AOBL");
      expect(screen.getByLabelText("Ben Lindqvist · editing Step 2")).toBeInTheDocument();
      const cursor = document.querySelector<HTMLElement>(".peer-cursor");
      expect(cursor?.style.transform).toBe("translate(40px, 150px) scale(1)");
      expect(cursor).toHaveTextContent("Ben Lindqvist · Step 2");
      const badge = document.querySelector<HTMLElement>(".peer-badge");
      expect(badge?.style.transform).toBe("translate(0px, 120px) scale(1)");
      expect(badge).toHaveTextContent("Ben Lindqvist · Step 2");
      ben.client.stop();
      await settle(room);
      expect(document.querySelector(".peer-cursor")).toBeNull();
    });

    it("returns to autosave when an owner turns collaboration off", async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      const user = userEvent.setup({ advanceTimers: (ms) => vi.advanceTimersByTime(ms) });
      const room = collaborative();
      const { operations } = renderEditor(
        (operation) =>
          operation.operationName === "SaveDiagram"
            ? saved(2)
            : diagramReply(true, 1, "Ada Okafor", { collaborationEnabled: true }),
        room,
      );
      await screen.findByRole("heading", { name: "Laser-cut lamp shade" });
      await settle(room);

      act(() => {
        room.setEnabled(false, "Theo Marsh");
      });
      await settle(room);
      expect(screen.getByText(/Live collaboration turned off by Theo Marsh/)).toBeInTheDocument();
      expect(screen.getByRole("switch", { name: /Live collaboration/ })).toHaveAttribute("aria-checked", "false");

      await user.click(screen.getByRole("button", { name: "Add step" }));
      await act(() => vi.advanceTimersByTimeAsync(2000));
      expect(named(operations, "SaveDiagram")).toHaveLength(1);
      expect(room.submitted).toHaveLength(0);
      await user.click(screen.getAllByRole("button", { name: "Dismiss" })[0] as HTMLElement);
      expect(screen.queryByText(/Live collaboration turned off/)).not.toBeInTheDocument();
      vi.useRealTimers();
    });

    it("lets owners flip the switch; others see it disabled", async () => {
      const user = userEvent.setup();
      const room = collaborative();
      const { operations } = renderEditor(
        (operation) =>
          operation.operationName === "SetCollaboration"
            ? {
                data: {
                  setCollaboration: {
                    __typename: "SetCollaborationPayload",
                    diagram: { __typename: "Diagram", id: "9", collaborationEnabled: false },
                    errors: [],
                  },
                },
              }
            : diagramReply(true, 1, "Ada Okafor", { collaborationEnabled: true, role: "OWNER" }),
        room,
      );
      const toggle = await screen.findByRole("switch", { name: /Live collaboration/ });
      await settle(room);
      expect(toggle).toHaveAttribute("aria-checked", "true");

      await user.click(toggle);
      expect(named(operations, "SetCollaboration")[0]?.variables).toEqual({ id: "9", enabled: false });
    });

    it("disables the switch for editors", async () => {
      renderEditor(() => diagramReply(true, 1, "Ada Okafor", { collaborationEnabled: true }), collaborative());

      expect(await screen.findByRole("switch", { name: /Live collaboration/ })).toBeDisabled();
    });

    it("waits for the room to store pending changes before opening the preview", async () => {
      const user = userEvent.setup();
      const room = collaborative();
      renderEditor(() => diagramReply(true, 1, "Ada Okafor", { collaborationEnabled: true }), room);
      await screen.findByRole("heading", { name: "Laser-cut lamp shade" });
      await settle(room);

      await user.click(screen.getByRole("button", { name: "Add step" }));
      await user.click(screen.getByRole("button", { name: "Preview" }));
      expect(screen.queryByText("Preview page")).not.toBeInTheDocument();
      await settle(room);

      expect(await screen.findByText("Preview page")).toBeInTheDocument();
      expect(Object.keys(room.state.nodes)).toHaveLength(3);
    });

    it("explains a change the room refused", async () => {
      const user = userEvent.setup();
      const room = collaborative();
      room.refuse = () => "This change would make the diagram invalid";
      renderEditor(() => diagramReply(true, 1, "Ada Okafor", { collaborationEnabled: true }), room);
      await screen.findByRole("heading", { name: "Laser-cut lamp shade" });
      await settle(room);

      await user.click(screen.getByRole("button", { name: "Add step" }));
      await settle(room);

      expect(
        screen.getByText(/A change could not be saved: This change would make the diagram invalid/),
      ).toBeInTheDocument();
      expect(screen.queryByText("New step")).not.toBeInTheDocument();
    });
  });
});
