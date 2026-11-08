import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MockedProvider, type MockedResponse } from "@apollo/client/testing";
import { MemoryRouter } from "react-router-dom";
import { App } from "./App";
import { DEMO_MEMBERS, DIAGRAM, DIAGRAMS, VIEWER } from "./graphql/operations";
import { SessionProvider } from "./lib/session";
import { LocationProbe, SIGNED_IN } from "./test/render";

const viewer = {
  request: { query: VIEWER },
  result: { data: { viewer: SIGNED_IN.viewer, workspaces: SIGNED_IN.workspaces } },
};
const demoMembers = { request: { query: DEMO_MEMBERS }, result: { data: { demoMembers: [] } } };
const diagrams = (workspaceId: string) => ({
  request: { query: DIAGRAMS, variables: { workspaceId } },
  result: { data: { diagrams: [] } },
});

function renderApp(route: string, mocks: MockedResponse[] = [viewer, diagrams("10"), diagrams("20"), demoMembers]) {
  return render(
    <SessionProvider>
      <MockedProvider mocks={mocks}>
        <MemoryRouter initialEntries={[route]}>
          <App />
          <LocationProbe />
        </MemoryRouter>
      </MockedProvider>
    </SessionProvider>,
  );
}

describe("App routing", () => {
  it("shows the landing page with a way into the demo", () => {
    renderApp("/");

    expect(screen.getByRole("heading", { name: /Plan the build/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Try the demo" })).toHaveAttribute("href", "/sign-in");
  });

  it("sends signed-out visitors to sign in", () => {
    renderApp("/app");

    expect(screen.getByTestId("location")).toHaveTextContent("/sign-in");
  });

  it("opens the last workspace, then switches workspaces from the top bar", async () => {
    window.localStorage.setItem("live-canvas.token", "t");
    window.localStorage.setItem("live-canvas.workspace", "20");
    const user = userEvent.setup();
    renderApp("/app");

    expect(await screen.findByRole("heading", { name: "Riverside Makers", level: 1 })).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Workspace"), "10");
    expect(await screen.findByRole("heading", { name: "Foundry Lane Workshop", level: 1 })).toBeInTheDocument();
    expect(screen.getByText("Signed in as Ada Okafor")).toBeInTheDocument();
  });

  it("falls back to the first workspace", async () => {
    window.localStorage.setItem("live-canvas.token", "t");
    renderApp("/app");

    expect(await screen.findByRole("heading", { name: "Foundry Lane Workshop", level: 1 })).toBeInTheDocument();
  });

  it("signs out", async () => {
    window.localStorage.setItem("live-canvas.token", "t");
    const user = userEvent.setup();
    renderApp("/app/w/10");

    await user.click(await screen.findByRole("button", { name: "Sign out" }));
    expect(screen.getByTestId("location")).toHaveTextContent("/sign-in");
    expect(window.localStorage.getItem("live-canvas.token")).toBeNull();
  });

  it("treats an expired session as signed out", async () => {
    window.localStorage.setItem("live-canvas.token", "t");
    renderApp("/app", [
      { request: { query: VIEWER }, result: { data: { viewer: null, workspaces: [] } } },
      demoMembers,
    ]);
    expect(await screen.findByText("/sign-in")).toBeInTheDocument();
  });

  it("explains members without workspaces what to do", async () => {
    window.localStorage.setItem("live-canvas.token", "t");
    renderApp("/app", [{ request: { query: VIEWER }, result: { data: { viewer: SIGNED_IN.viewer, workspaces: [] } } }]);

    expect(await screen.findByText("No workspaces yet")).toBeInTheDocument();
  });

  it("shows an error when the session cannot load", async () => {
    window.localStorage.setItem("live-canvas.token", "t");
    renderApp("/app", [{ request: { query: VIEWER }, error: new Error("down") }]);

    expect(await screen.findByRole("alert")).toHaveTextContent(/reach the server/);
  });

  it("loads the editor on demand", async () => {
    window.localStorage.setItem("live-canvas.token", "t");
    const diagram = {
      request: { query: DIAGRAM, variables: { id: "9" } },
      result: {
        data: {
          diagram: {
            __typename: "Diagram",
            id: "9",
            title: "Weld a steel plant stand",
            revision: 1,
            document: { nodes: [] },
            viewSettings: {},
            canEdit: true,
            updatedAt: "2031-03-10T08:00:00Z",
            updatedBy: null,
            collaborationEnabled: false,
            workspace: {
              __typename: "Workspace",
              id: "10",
              name: "Foundry Lane Workshop",
              navigationMode: "PAN",
              role: "EDITOR",
            },
          },
        },
      },
    };
    renderApp("/app/d/9", [viewer, diagram]);

    expect(
      await screen.findByRole("heading", { name: "Weld a steel plant stand" }, { timeout: 5000 }),
    ).toBeInTheDocument();
  });

  it("shows a not-found page for unknown paths", () => {
    renderApp("/nowhere");

    expect(screen.getByRole("heading", { name: "Page not found" })).toBeInTheDocument();
  });
});
