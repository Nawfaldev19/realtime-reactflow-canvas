import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DEMO_MEMBERS, SIGN_IN_AS_DEMO } from "../graphql/operations";
import { renderPage } from "../test/render";
import { SignInPage } from "./SignInPage";

const members = {
  request: { query: DEMO_MEMBERS },
  result: {
    data: {
      demoMembers: [
        { __typename: "DemoMember", id: "1", name: "Ada Okafor", initials: "AO", summary: "Owner at Riverside Makers" },
        {
          __typename: "DemoMember",
          id: "3",
          name: "Cora Mbeki",
          initials: "CM",
          summary: "Viewer at Riverside Makers",
        },
      ],
    },
  },
};

const signIn = (memberId: string, token: string | null) => ({
  request: { query: SIGN_IN_AS_DEMO, variables: { memberId } },
  result: {
    data: {
      signInAsDemo: {
        __typename: "SignInAsDemoPayload",
        token,
        viewer: token ? { __typename: "Viewer", id: memberId, name: "Ada Okafor" } : null,
        errors: token ? [] : [{ __typename: "UserError", field: "memberId", message: "Choose a person from the list" }],
      },
    },
  },
});

describe("SignInPage", () => {
  it("lists demo people with their roles and signs in as the chosen one", async () => {
    const user = userEvent.setup();
    renderPage(<SignInPage />, {
      mocks: [members, signIn("1", "signed-token")],
      route: "/sign-in",
      path: "/sign-in",
      signedIn: null,
    });

    expect(await screen.findByText("Owner at Riverside Makers")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Continue as Ada Okafor/ }));

    expect(await screen.findByTestId("location")).toHaveTextContent("/app");
    expect(window.localStorage.getItem("live-canvas.token")).toBe("signed-token");
  });

  it("shows the server's message when sign-in is refused", async () => {
    const user = userEvent.setup();
    renderPage(<SignInPage />, {
      mocks: [members, signIn("3", null)],
      route: "/sign-in",
      path: "/sign-in",
      signedIn: null,
    });

    await user.click(await screen.findByRole("button", { name: /Continue as Cora Mbeki/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Choose a person from the list");
  });

  it("explains a failed request", async () => {
    renderPage(<SignInPage />, {
      mocks: [{ request: { query: DEMO_MEMBERS }, error: new Error("down") }],
      route: "/sign-in",
      path: "/sign-in",
      signedIn: null,
    });

    expect(await screen.findByRole("alert")).toHaveTextContent(/reach the server/);
  });
});
