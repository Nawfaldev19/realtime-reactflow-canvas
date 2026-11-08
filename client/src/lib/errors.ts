import { ApolloError } from "@apollo/client";

export function errorCodes(error: unknown): string[] {
  if (!(error instanceof ApolloError)) return [];
  return error.graphQLErrors.map((graphQLError) => {
    const code = graphQLError.extensions?.code;
    return typeof code === "string" ? code : "";
  });
}

/** A short, human message for any failed request. */
export function describeError(error: unknown): string {
  const codes = errorCodes(error);
  if (codes.includes("NOT_FOUND"))
    return "We couldn't find that. It may have been deleted, or it belongs to a workspace you are not in.";
  if (codes.includes("FORBIDDEN")) return "Your role in this workspace doesn't allow that.";
  if (error instanceof ApolloError && error.networkError)
    return "We couldn't reach the server. Check that it is running and try again.";
  return "Something went wrong. Please try again.";
}
