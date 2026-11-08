import type { ReactElement } from "react";
import { render } from "@testing-library/react";
import { MockedProvider, type MockedResponse } from "@apollo/client/testing";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { SessionProvider } from "../lib/session";
import { SignedInContext, type SignedIn } from "../components/workspace";

export const SIGNED_IN: SignedIn = {
  viewer: {
    __typename: "Viewer",
    id: "1",
    name: "Ada Okafor",
    email: "ada@example.com",
    initials: "AO",
    navigationMode: null,
  },
  workspaces: [
    {
      __typename: "Workspace",
      id: "10",
      name: "Foundry Lane Workshop",
      slug: "foundry-lane",
      role: "EDITOR",
      canEdit: true,
      navigationMode: "PAN",
    },
    {
      __typename: "Workspace",
      id: "20",
      name: "Riverside Makers",
      slug: "riverside-makers",
      role: "VIEWER",
      canEdit: false,
      navigationMode: "SCROLL",
    },
  ],
};

/** Shows the current path so tests can assert navigation. */
export function LocationProbe() {
  const location = useLocation();
  return <p data-testid="location">{location.pathname}</p>;
}

interface Options {
  mocks?: MockedResponse[];
  route?: string;
  path?: string;
  signedIn?: SignedIn | null;
}

/** Renders a page with Apollo mocks, a router, a session and (optionally) a signed-in member. */
export function renderPage(
  ui: ReactElement,
  { mocks = [], route = "/", path = "*", signedIn = SIGNED_IN }: Options = {},
) {
  const page = signedIn ? <SignedInContext.Provider value={signedIn}>{ui}</SignedInContext.Provider> : ui;
  return render(
    <SessionProvider>
      <MockedProvider mocks={mocks}>
        <MemoryRouter initialEntries={[route]}>
          <Routes>
            <Route path={path} element={page} />
            <Route path="*" element={<LocationProbe />} />
          </Routes>
        </MemoryRouter>
      </MockedProvider>
    </SessionProvider>,
  );
}
