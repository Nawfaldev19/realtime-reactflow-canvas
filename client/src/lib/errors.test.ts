import { ApolloError } from "@apollo/client";
import { GraphQLError } from "graphql";
import { describeError, errorCodes } from "./errors";

const withCode = (code?: string) =>
  new ApolloError({ graphQLErrors: [new GraphQLError("x", { extensions: code ? { code } : {} })] });

describe("errors", () => {
  it("reads extension codes", () => {
    expect(errorCodes(withCode("NOT_FOUND"))).toEqual(["NOT_FOUND"]);
    expect(errorCodes(withCode())).toEqual([""]);
    expect(errorCodes(new Error("plain"))).toEqual([]);
  });

  it("describes each kind of failure in plain words", () => {
    expect(describeError(withCode("NOT_FOUND"))).toMatch(/couldn't find/);
    expect(describeError(withCode("FORBIDDEN"))).toMatch(/role/);
    expect(describeError(new ApolloError({ networkError: new Error("down") }))).toMatch(/reach the server/);
    expect(describeError(new Error("other"))).toMatch(/Something went wrong/);
  });
});
