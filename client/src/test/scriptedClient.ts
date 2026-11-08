import { ApolloClient, ApolloLink, InMemoryCache, Observable, type FetchResult, type Operation } from "@apollo/client";

/** An Apollo client whose replies come from a function, for tests whose variables are not known in advance. */
export function scriptedClient(reply: (operation: Operation) => FetchResult | Error) {
  const operations: Operation[] = [];
  const link = new ApolloLink(
    (operation) =>
      new Observable<FetchResult>((observer) => {
        operations.push(operation);
        const result = reply(operation);
        if (result instanceof Error) observer.error(result);
        else {
          observer.next(result);
          observer.complete();
        }
      }),
  );
  return { client: new ApolloClient({ link, cache: new InMemoryCache() }), operations };
}
