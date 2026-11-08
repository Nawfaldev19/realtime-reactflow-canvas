import { ApolloClient, ApolloLink, HttpLink, InMemoryCache, from } from "@apollo/client";
import { onError } from "@apollo/client/link/error";
import { DEFAULT_API_URL } from "../security/headers";

export const API_URL: string = import.meta.env.VITE_API_URL ?? DEFAULT_API_URL;

interface ClientOptions {
  getToken: () => string | null;
  onUnauthenticated: () => void;
}

/** Every request carries the bearer token; the server checks workspace access per record. */
export function createApolloClient({ getToken, onUnauthenticated }: ClientOptions) {
  const auth = new ApolloLink((operation, forward) => {
    const token = getToken();
    operation.setContext(({ headers = {} }: { headers?: Record<string, string> }) => ({
      headers: { ...headers, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    }));
    return forward(operation);
  });

  // `response` is the Apollo Client 3 name; version 4 renames it to `result`.
  // eslint-disable-next-line @typescript-eslint/no-deprecated
  const authErrors = onError(({ response }) => {
    if (response?.errors?.some((error) => error.extensions?.code === "UNAUTHENTICATED")) onUnauthenticated();
  });

  return new ApolloClient({
    link: from([authErrors, auth, new HttpLink({ uri: API_URL })]),
    cache: new InMemoryCache(),
  });
}
