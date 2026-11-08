import { gql } from "@apollo/client";
import { createApolloClient } from "./apollo";

const QUERY = gql`
  query Probe {
    viewer {
      id
    }
  }
`;

function stubFetch(body: object) {
  const fetchMock = vi.fn(() =>
    Promise.resolve(new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } })),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const headersOf = (fetchMock: ReturnType<typeof stubFetch>, call: number) =>
  (fetchMock.mock.calls[call] as unknown as [string, RequestInit])[1].headers as Record<string, string>;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createApolloClient", () => {
  it("sends the current token with each request", async () => {
    const fetchMock = stubFetch({ data: { viewer: null } });
    let token: string | null = "first";
    const client = createApolloClient({ getToken: () => token, onUnauthenticated: vi.fn() });

    await client.query({ query: QUERY, fetchPolicy: "network-only" });
    token = "second";
    await client.query({ query: QUERY, fetchPolicy: "network-only" });

    // Apollo's HttpLink lower-cases header names.
    expect(headersOf(fetchMock, 0)).toMatchObject({ authorization: "Bearer first" });
    expect(headersOf(fetchMock, 1)).toMatchObject({ authorization: "Bearer second" });
  });

  it("omits the header when signed out", async () => {
    const fetchMock = stubFetch({ data: { viewer: null } });
    const client = createApolloClient({ getToken: () => null, onUnauthenticated: vi.fn() });

    await client.query({ query: QUERY });

    expect(headersOf(fetchMock, 0)).not.toHaveProperty("authorization");
  });

  it("signals UNAUTHENTICATED responses", async () => {
    stubFetch({ data: null, errors: [{ message: "Sign in", extensions: { code: "UNAUTHENTICATED" } }] });
    const onUnauthenticated = vi.fn();
    const client = createApolloClient({ getToken: () => "old", onUnauthenticated });

    await expect(client.query({ query: QUERY })).rejects.toThrow("Sign in");
    expect(onUnauthenticated).toHaveBeenCalledOnce();
  });
});
