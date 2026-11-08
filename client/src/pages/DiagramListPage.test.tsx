import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  CREATE_DIAGRAM,
  DELETE_DIAGRAM,
  DIAGRAMS,
  RENAME_DIAGRAM,
  SET_WORKSPACE_NAVIGATION_MODE,
} from "../graphql/operations";
import { renderPage, SIGNED_IN } from "../test/render";
import { DiagramListPage } from "./DiagramListPage";

const diagram = (id: string, title: string, canEdit = true) => ({
  __typename: "Diagram",
  id,
  title,
  nodeCount: 15,
  edgeCount: 12,
  updatedAt: "2031-03-10T08:00:00Z",
  canEdit,
  updatedBy: { __typename: "Member", id: "1", name: "Ada Okafor" },
});

const list = (workspaceId: string, diagrams: object[]) => ({
  request: { query: DIAGRAMS, variables: { workspaceId } },
  result: { data: { diagrams } },
});

describe("DiagramListPage", () => {
  it("lists the workspace's diagrams with counts and who changed them", async () => {
    renderPage(<DiagramListPage />, {
      mocks: [list("10", [diagram("5", "Restore a vintage hand plane")])],
      route: "/app/w/10",
      path: "/app/w/:workspaceId",
    });

    expect(await screen.findByRole("link", { name: "Restore a vintage hand plane" })).toHaveAttribute(
      "href",
      "/app/d/5",
    );
    const preview = screen.getByRole("link", { name: "Preview" });
    expect(preview).toHaveAttribute("href", "/app/d/5/preview");
    expect(preview).toHaveAccessibleDescription("Restore a vintage hand plane");
    expect(screen.getByText("15 nodes · 12 connectors")).toBeInTheDocument();
    expect(screen.getByText(/by Ada Okafor/)).toBeInTheDocument();
    expect(window.localStorage.getItem("live-canvas.workspace")).toBe("10");
  });

  it("viewers see no create, rename or delete controls", async () => {
    renderPage(<DiagramListPage />, {
      mocks: [list("20", [diagram("6", "Laser-cut lamp shade", false)])],
      route: "/app/w/20",
      path: "/app/w/:workspaceId",
    });

    expect(await screen.findByRole("link", { name: "Laser-cut lamp shade" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /New diagram/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Rename/ })).not.toBeInTheDocument();
    expect(screen.getByText(/open them read-only/)).toBeInTheDocument();
  });

  it("lets owners choose the workspace's default navigation", async () => {
    const user = userEvent.setup();
    const owner = {
      ...SIGNED_IN,
      workspaces: SIGNED_IN.workspaces.map((workspace) =>
        workspace.id === "10" ? { ...workspace, role: "OWNER" as const } : workspace,
      ),
    };
    const setMode = {
      request: { query: SET_WORKSPACE_NAVIGATION_MODE, variables: { workspaceId: "10", mode: "SCROLL" } },
      result: {
        data: {
          setWorkspaceNavigationMode: {
            __typename: "SetWorkspaceNavigationModePayload",
            workspace: { __typename: "Workspace", id: "10", navigationMode: "SCROLL" },
            errors: [],
          },
        },
      },
    };
    renderPage(<DiagramListPage />, {
      mocks: [list("10", []), setMode],
      route: "/app/w/10",
      path: "/app/w/:workspaceId",
      signedIn: owner,
    });
    const select = await screen.findByLabelText("Default navigation for members");
    expect(select).toHaveValue("PAN");
    await user.selectOptions(select, "SCROLL");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("does not offer the workspace default to editors", async () => {
    renderPage(<DiagramListPage />, { mocks: [list("10", [])], route: "/app/w/10", path: "/app/w/:workspaceId" });
    expect(await screen.findByText("No diagrams yet")).toBeInTheDocument();
    expect(screen.queryByLabelText("Default navigation for members")).not.toBeInTheDocument();
  });

  it("shows an empty state", async () => {
    renderPage(<DiagramListPage />, { mocks: [list("10", [])], route: "/app/w/10", path: "/app/w/:workspaceId" });

    expect(await screen.findByText("No diagrams yet")).toBeInTheDocument();
  });

  it("refuses a workspace the member is not in", () => {
    renderPage(<DiagramListPage />, { route: "/app/w/99", path: "/app/w/:workspaceId" });

    expect(screen.getByText("Workspace not found")).toBeInTheDocument();
  });

  it("creates a diagram and opens it", async () => {
    const user = userEvent.setup();
    const create = {
      request: { query: CREATE_DIAGRAM, variables: { workspaceId: "10", title: "Build a birdhouse" } },
      result: {
        data: {
          createDiagram: {
            __typename: "CreateDiagramPayload",
            diagram: { __typename: "Diagram", id: "77" },
            errors: [],
          },
        },
      },
    };
    renderPage(<DiagramListPage />, {
      mocks: [list("10", []), create],
      route: "/app/w/10",
      path: "/app/w/:workspaceId",
    });

    await user.type(screen.getByLabelText("New diagram title"), "Build a birdhouse");
    await user.click(screen.getByRole("button", { name: /New diagram/ }));

    expect(await screen.findByTestId("location")).toHaveTextContent("/app/d/77");
  });

  it("shows why a diagram could not be created", async () => {
    const user = userEvent.setup();
    const create = {
      request: { query: CREATE_DIAGRAM, variables: { workspaceId: "10", title: "" } },
      result: {
        data: {
          createDiagram: {
            __typename: "CreateDiagramPayload",
            diagram: null,
            errors: [{ __typename: "UserError", field: "title", message: "Title can't be blank" }],
          },
        },
      },
    };
    renderPage(<DiagramListPage />, {
      mocks: [list("10", []), create],
      route: "/app/w/10",
      path: "/app/w/:workspaceId",
    });

    await user.click(screen.getByRole("button", { name: /New diagram/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Title can't be blank");
    expect(screen.getByLabelText("New diagram title")).toHaveAttribute("aria-invalid", "true");
  });

  it("renames a diagram in place", async () => {
    const user = userEvent.setup();
    const rename = {
      request: { query: RENAME_DIAGRAM, variables: { id: "5", title: "Plane, restored" } },
      result: {
        data: {
          renameDiagram: {
            __typename: "RenameDiagramPayload",
            diagram: { __typename: "Diagram", id: "5", title: "Plane, restored" },
            errors: [],
          },
        },
      },
    };
    renderPage(<DiagramListPage />, {
      mocks: [list("10", [diagram("5", "Hand plane")]), rename],
      route: "/app/w/10",
      path: "/app/w/:workspaceId",
    });

    await user.click(await screen.findByRole("button", { name: "Rename Hand plane" }));
    const input = screen.getByLabelText("Title");
    await user.clear(input);
    await user.type(input, "Plane, restored");
    await user.click(screen.getByRole("button", { name: "Save title" }));

    expect(await screen.findByRole("link", { name: "Plane, restored" })).toBeInTheDocument();
  });

  it("asks before deleting, and can keep the diagram", async () => {
    const user = userEvent.setup();
    const remove = {
      request: { query: DELETE_DIAGRAM, variables: { id: "5" } },
      result: { data: { deleteDiagram: { __typename: "DeleteDiagramPayload", deletedId: "5", errors: [] } } },
    };
    renderPage(<DiagramListPage />, {
      mocks: [list("10", [diagram("5", "Hand plane")]), remove, list("10", [])],
      route: "/app/w/10",
      path: "/app/w/:workspaceId",
    });

    await user.click(await screen.findByRole("button", { name: "Delete Hand plane" }));
    await user.click(screen.getByRole("button", { name: "Keep it" }));
    await user.click(screen.getByRole("button", { name: "Delete Hand plane" }));
    const confirm = screen.getByRole("group", { name: "Confirm deleting Hand plane" });
    await user.click(within(confirm).getByRole("button", { name: "Delete" }));

    expect(await screen.findByText("No diagrams yet")).toBeInTheDocument();
  });
});
