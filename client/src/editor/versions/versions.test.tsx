import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ApolloProvider, type Operation } from "@apollo/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { SessionProvider } from "../../lib/session";
import { EditorPage } from "../../pages/EditorPage";
import { FakeRoom } from "../../test/fakeRoom";
import { LocationProbe } from "../../test/render";
import { scriptedClient } from "../../test/scriptedClient";
import { CollabTransportContext } from "../useCollaboration";

// The version panel and the compare view inside the editor page, against
// scripted API replies and an in-memory collaboration room.

const step = (id: string, number: number, text: string, y: number) => ({
  id,
  key: id,
  kind: "step",
  number,
  position: { x: 0, y },
  size: { width: 180, height: 64 },
  parentId: null,
  z: number,
  style: {},
  data: { text },
});

const CURRENT = {
  schemaVersion: 1,
  nextNumber: 3,
  nodes: [step("n1", 1, "Cut the panels", 0), step("n2", 2, "Sand the edges", 120)],
  edges: [],
};
/** v1: "Sand the edges" had other text, and a third step that was removed since. */
const V1 = {
  ...CURRENT,
  nextNumber: 4,
  nodes: [step("n1", 1, "Cut the panels", 0), step("n2", 2, "Sand", 120), step("n3", 3, "Oil the panels", 240)],
};

const author = { __typename: "Member", id: "1", name: "Ada Okafor" };
const version = (id: string, number: number, label: string | null, kind = "MANUAL") => ({
  __typename: "DiagramVersion",
  id,
  number,
  label,
  kind,
  createdAt: "2031-03-10T08:00:00Z",
  author,
});

function diagramReply(canEdit: boolean) {
  return {
    data: {
      diagram: {
        __typename: "Diagram",
        id: "9",
        title: "Lamp shade",
        revision: 1,
        document: CURRENT,
        viewSettings: {},
        canEdit,
        updatedAt: "2031-03-10T08:00:00Z",
        updatedBy: author,
        collaborationEnabled: false,
        workspace: {
          __typename: "Workspace",
          id: "20",
          name: "Riverside Makers",
          navigationMode: "PAN",
          role: canEdit ? "EDITOR" : "VIEWER",
        },
      },
    },
  };
}

const page = (nodes: readonly object[], { hasNextPage = false, total = nodes.length } = {}) => ({
  data: {
    diagram: {
      __typename: "Diagram",
      id: "9",
      versions: {
        __typename: "VersionPage",
        totalCount: total,
        hasNextPage,
        endCursor: hasNextPage ? "cursor-1" : null,
        nodes,
      },
    },
  },
});

interface Options {
  readonly canEdit?: boolean;
  /** A reply for this operation, or undefined for the default one. */
  readonly reply?: (operation: Operation) => object | Error | undefined;
  readonly versions?: readonly object[];
}

const noReply = (): undefined => undefined;

function renderEditor({
  canEdit = true,
  reply = noReply,
  versions = [version("v1", 1, "Created", "CREATED")],
}: Options = {}) {
  const room = new FakeRoom({ document: CURRENT, revision: 1, enabled: false });
  const scripted = scriptedClient((operation) => {
    const custom = reply(operation);
    if (custom) return custom;
    switch (operation.operationName) {
      case "DiagramVersions":
        return page(versions) as never;
      case "SaveDiagram":
        return {
          data: {
            saveDiagram: {
              __typename: "SaveDiagramPayload",
              diagram: { __typename: "Diagram", id: "9", revision: 2, updatedAt: "2031-03-10T08:01:00Z" },
              errors: [],
            },
          },
        } as never;
      case "VersionDocuments":
        return {
          data: {
            versions: (operation.variables.ids as string[]).map((id) => ({
              __typename: "DiagramVersion",
              id,
              number: 1,
              document: V1,
            })),
          },
        } as never;
      default:
        return diagramReply(canEdit) as never;
    }
  });
  render(
    <SessionProvider>
      <ApolloProvider client={scripted.client}>
        <CollabTransportContext.Provider value={room.transport({ memberId: "1", name: "Ada Okafor" })}>
          <MemoryRouter initialEntries={["/app/d/9"]}>
            <Routes>
              <Route path="/app/d/9" element={<EditorPage />} />
              <Route path="*" element={<LocationProbe />} />
            </Routes>
          </MemoryRouter>
        </CollabTransportContext.Provider>
      </ApolloProvider>
    </SessionProvider>,
  );
  return { ...scripted, room };
}

const named = (operations: Operation[], name: string) =>
  operations.filter((operation) => operation.operationName === name);

async function openPanel(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("button", { name: "Versions" }));
  return screen.getByRole("complementary", { name: "Version history" });
}

describe("version panel", () => {
  it("lists versions with author and time, and lets a viewer compare but not save or restore", async () => {
    const user = userEvent.setup();
    renderEditor({ canEdit: false });
    const panel = await openPanel(user);
    const item = await within(panel).findByRole("listitem", { name: "v1 · Created" });

    expect(item).toHaveTextContent("Ada Okafor");
    expect(within(item).getByText(/2031/)).toHaveAttribute("datetime", "2031-03-10T08:00:00Z");
    expect(within(panel).queryByRole("button", { name: "Save version" })).not.toBeInTheDocument();
    expect(within(item).queryByRole("button", { name: "Restore v1" })).not.toBeInTheDocument();
    expect(within(item).getByRole("button", { name: "Compare v1" })).toBeEnabled();

    await user.click(within(panel).getByRole("button", { name: "Close version history" }));
    expect(screen.queryByRole("complementary", { name: "Version history" })).not.toBeInTheDocument();
  });

  it("saves a labelled version after storing what is pending, and shows its number", async () => {
    const user = userEvent.setup();
    const { operations } = renderEditor({
      reply: (operation) =>
        operation.operationName === "SaveVersion"
          ? {
              data: {
                saveVersion: {
                  __typename: "SaveVersionPayload",
                  created: true,
                  version: { __typename: "DiagramVersion", id: "v2", number: 2 },
                  errors: [],
                },
              },
            }
          : undefined,
    });
    const panel = await openPanel(user);
    await user.type(within(panel).getByLabelText("Label (optional)"), "  Panels cut ");
    await user.click(within(panel).getByRole("button", { name: "Save version" }));

    expect(await within(panel).findByRole("status")).toHaveTextContent("Saved v2");
    expect(named(operations, "SaveVersion")[0]?.variables).toEqual({
      diagramId: "9",
      label: "Panels cut",
      automatic: false,
    });
    expect(within(panel).getByLabelText("Label (optional)")).toHaveValue("");
    expect(named(operations, "DiagramVersions")).toHaveLength(2);
  });

  it("shows why a version could not be saved", async () => {
    const user = userEvent.setup();
    renderEditor({
      reply: (operation) =>
        operation.operationName === "SaveVersion"
          ? {
              data: {
                saveVersion: {
                  __typename: "SaveVersionPayload",
                  created: false,
                  version: null,
                  errors: [{ __typename: "UserError", field: "label", message: "Label is too long" }],
                },
              },
            }
          : undefined,
    });
    const panel = await openPanel(user);
    await user.click(within(panel).getByRole("button", { name: "Save version" }));

    expect(await within(panel).findByText("Label is too long")).toHaveClass("version-panel__notice--error");
  });

  it("restores a version as one undoable change, after confirming", async () => {
    const user = userEvent.setup();
    const { operations } = renderEditor({
      versions: [version("v1", 1, "Before oiling")],
      reply: (operation) =>
        operation.operationName === "RestoreVersion"
          ? {
              data: {
                restoreVersion: {
                  __typename: "RestoreVersionPayload",
                  version: { __typename: "DiagramVersion", id: "v1", number: 1, document: V1 },
                  checkpoint: { __typename: "DiagramVersion", id: "v2", number: 2 },
                  errors: [],
                },
              },
            }
          : undefined,
    });
    const panel = await openPanel(user);
    await user.click(await within(panel).findByRole("button", { name: "Restore v1" }));
    const confirm = within(panel).getByRole("group", { name: "Restore v1?" });
    expect(within(confirm).getByRole("button", { name: "Restore v1" })).toHaveFocus();
    await user.click(within(confirm).getByRole("button", { name: "Cancel" }));
    expect(named(operations, "RestoreVersion")).toHaveLength(0);

    await user.click(within(panel).getByRole("button", { name: "Restore v1" }));
    await user.click(
      within(within(panel).getByRole("group", { name: "Restore v1?" })).getByRole("button", { name: "Restore v1" }),
    );

    expect(await within(panel).findByText("Restored v1. Undo puts it back.")).toBeInTheDocument();
    expect(named(operations, "RestoreVersion")[0]?.variables).toEqual({ versionId: "v1" });
    expect(screen.getByText("Oil the panels")).toBeInTheDocument();
    expect(screen.getByText("Sand")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(screen.queryByText("Oil the panels")).not.toBeInTheDocument();
    expect(screen.getByText("Sand the edges")).toBeInTheDocument();
  });

  it("says so when the diagram already looks like the version, and reports a failed restore", async () => {
    const user = userEvent.setup();
    let attempts = 0;
    renderEditor({
      reply: (operation) => {
        if (operation.operationName !== "RestoreVersion") return undefined;
        attempts += 1;
        return attempts === 1
          ? {
              data: {
                restoreVersion: {
                  __typename: "RestoreVersionPayload",
                  version: { __typename: "DiagramVersion", id: "v1", number: 1, document: CURRENT },
                  checkpoint: null,
                  errors: [],
                },
              },
            }
          : new Error("down");
      },
    });
    const panel = await openPanel(user);
    const restore = async () => {
      await user.click(await within(panel).findByRole("button", { name: "Restore v1" }));
      await user.click(
        within(within(panel).getByRole("group", { name: "Restore v1?" })).getByRole("button", { name: "Restore v1" }),
      );
    };

    await restore();
    expect(await within(panel).findByText("The diagram already looks like v1.")).toBeInTheDocument();
    await restore();
    expect(await within(panel).findByText(/couldn't reach the server/)).toBeInTheDocument();
  });

  it("makes a copy of a version and opens it", async () => {
    const user = userEvent.setup();
    renderEditor({
      reply: (operation) =>
        operation.operationName === "CopyVersion"
          ? {
              data: {
                copyVersion: {
                  __typename: "CopyVersionPayload",
                  diagram: { __typename: "Diagram", id: "77" },
                  copyLog: [],
                  errors: [],
                },
              },
            }
          : undefined,
    });
    const panel = await openPanel(user);
    await user.click(await within(panel).findByRole("button", { name: "Make a copy of v1" }));

    expect(await screen.findByTestId("location")).toHaveTextContent("/app/d/77");
  });

  it("reports a copy the server refused", async () => {
    const user = userEvent.setup();
    renderEditor({
      reply: (operation) =>
        operation.operationName === "CopyVersion"
          ? {
              data: {
                copyVersion: {
                  __typename: "CopyVersionPayload",
                  diagram: null,
                  copyLog: [],
                  errors: [{ __typename: "UserError", message: "Title is too long" }],
                },
              },
            }
          : undefined,
    });
    const panel = await openPanel(user);
    await user.click(await within(panel).findByRole("button", { name: "Make a copy of v1" }));

    expect(await within(panel).findByText("Title is too long")).toBeInTheDocument();
  });

  it("loads more versions by cursor, and offers a refresh when someone else saves one", async () => {
    const user = userEvent.setup();
    const { operations, room } = renderEditor({
      reply: (operation) =>
        operation.operationName === "DiagramVersions"
          ? operation.variables.after
            ? page([version("v1", 1, "Created", "CREATED")], { total: 2 })
            : page([version("v2", 2, null, "AUTOMATIC")], { hasNextPage: true, total: 2 })
          : undefined,
    });
    const panel = await openPanel(user);
    expect(await within(panel).findByRole("listitem", { name: "v2 · Automatic version" })).toBeInTheDocument();
    await user.click(within(panel).getByRole("button", { name: "Load more (1 of 2)" }));

    expect(await within(panel).findByRole("listitem", { name: "v1 · Created" })).toBeInTheDocument();
    expect(named(operations, "DiagramVersions")[1]?.variables).toMatchObject({ after: "cursor-1" });
    expect(within(panel).queryByRole("button", { name: /Load more/ })).not.toBeInTheDocument();

    await act(async () => {
      room.settle();
      room.announceVersion(3);
      room.deliver();
      await Promise.resolve();
    });
    await user.click(await within(panel).findByRole("button", { name: /New versions saved/ }));
    expect(named(operations, "DiagramVersions")).toHaveLength(3);
  });

  it("explains a list that could not be loaded", async () => {
    const user = userEvent.setup();
    renderEditor({
      reply: (operation) => (operation.operationName === "DiagramVersions" ? new Error("down") : undefined),
    });
    const panel = await openPanel(user);

    expect(await within(panel).findByText(/The versions could not be loaded/)).toBeInTheDocument();
  });
});

describe("compare view", () => {
  async function openCompare(user: ReturnType<typeof userEvent.setup>) {
    const panel = await openPanel(user);
    await user.click(await within(panel).findByRole("button", { name: "Compare v1" }));
    return screen.getByRole("dialog", { name: "Compare versions" });
  }

  it("highlights what was removed and changed since the version, in an overlay", async () => {
    const user = userEvent.setup();
    renderEditor();
    const dialog = await openCompare(user);

    expect(await within(dialog).findByRole("button", { name: "Removed (1)" })).toHaveAttribute("aria-pressed", "true");
    expect(within(dialog).getByRole("button", { name: "Changed (1)" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Added (0)" })).toBeInTheDocument();
    const canvas = within(dialog).getByRole("region", { name: "Current diagram, with changes since v1 · Created" });
    expect(canvas.querySelector(".react-flow__node.diff--removed")).toHaveTextContent("Oil the panels");
    expect(canvas.querySelector(".react-flow__node.diff--changed")).toHaveTextContent("Sand the edges");
    expect(canvas.querySelector(".react-flow__node.diff--plain")).toHaveTextContent("Cut the panels");
    expect(dialog).toHaveFocus();
  });

  it("filters highlights, shows what changed for a clicked step, and goes side by side", async () => {
    const user = userEvent.setup();
    renderEditor();
    const dialog = await openCompare(user);
    await user.click(await within(dialog).findByRole("button", { name: "Removed (1)" }));
    const overlay = within(dialog).getByRole("region", { name: /with changes since/ });
    expect(overlay.querySelector(".diff--removed")).toBeNull();
    expect(overlay.querySelector(".react-flow__node.diff--hidden")).toHaveTextContent("Oil the panels");

    // A plain click: the canvas's pan handler needs a real window behind its mouse events.
    fireEvent.click(within(overlay).getByText("Sand the edges"));
    expect(within(dialog).getByRole("complementary", { name: "What changed" })).toHaveTextContent("Text changed");
    await user.click(within(dialog).getByRole("button", { name: "Close the change details" }));
    expect(within(dialog).queryByRole("complementary", { name: "What changed" })).not.toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "Side by side" }));
    const older = within(dialog).getByRole("region", { name: "v1 · Created" });
    const newer = within(dialog).getByRole("region", { name: "Current diagram" });
    expect(older.querySelector(".react-flow__node.diff--changed")).toHaveTextContent("Sand");
    expect(newer.querySelector(".react-flow__node.diff--changed")).toHaveTextContent("Sand the edges");
    fireEvent.click(within(older).getByText("Cut the panels"));
    expect(within(dialog).getByRole("complementary", { name: "What changed" })).toHaveTextContent(
      "The same in both versions.",
    );
  });

  it("swaps sides through the pickers, says when there are no differences, and closes with Escape", async () => {
    const user = userEvent.setup();
    renderEditor();
    const dialog = await openCompare(user);
    await within(dialog).findByRole("button", { name: "Removed (1)" });

    expect(
      within(within(dialog).getByLabelText("To")).queryByRole("option", { name: "v1 · Created" }),
    ).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Swap the two sides" }));
    expect(within(dialog).getByLabelText("To")).toHaveValue("v1");
    expect(within(dialog).getByLabelText("From")).toHaveValue("current");
    expect(await within(dialog).findByRole("button", { name: "Added (1)" })).toBeInTheDocument();
    const overlay = within(dialog).getByRole("region", { name: /with changes since Current diagram/ });
    expect(overlay.querySelector(".react-flow__node.diff--added")).toHaveTextContent("Oil the panels");

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Compare versions" })).not.toBeInTheDocument();
  });

  it("reports versions that could not be loaded", async () => {
    const user = userEvent.setup();
    renderEditor({
      reply: (operation) => (operation.operationName === "VersionDocuments" ? new Error("down") : undefined),
    });
    const dialog = await openCompare(user);

    expect(await within(dialog).findByRole("status")).toHaveTextContent(/could not be loaded/);
    await user.click(within(dialog).getByRole("button", { name: "Close compare" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
