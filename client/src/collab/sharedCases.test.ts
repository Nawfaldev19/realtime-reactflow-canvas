import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { applyOperation } from "../document/operations";
import { parseDocument, serializeDocument } from "../document/serialize";
import { decodeOperation } from "./protocol";

// The server runs the same cases (server/test/services/operation_applier_test.rb),
// so OperationApplier and applyOperation agree rule for rule.
interface SharedCase {
  readonly name: string;
  readonly document: unknown;
  readonly operation: unknown;
  readonly expected: unknown;
  readonly skipped: number;
}

const { cases } = JSON.parse(
  readFileSync(resolve(process.cwd(), "../server/test/fixtures/files/operation_cases.json"), "utf8"),
) as { cases: SharedCase[] };

describe("shared operation cases", () => {
  it("has cases to run", () => {
    expect(cases.length).toBeGreaterThan(15);
  });

  it.each(cases.map((entry) => [entry.name, entry] as const))("%s", (_name, entry) => {
    const op = decodeOperation(entry.operation);
    if (!op) throw new Error("The case's operation does not decode");
    const { state, skipped } = applyOperation(parseDocument(entry.document).state, op);

    expect(JSON.parse(JSON.stringify(serializeDocument(state)))).toEqual(entry.expected);
    expect(skipped).toBe(entry.skipped);
  });
});
