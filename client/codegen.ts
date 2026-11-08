import type { CodegenConfig } from "@graphql-codegen/cli";

// Generates fully typed documents from the server's schema dump.
// Run `npm run codegen` after changing an operation or the schema.
const config: CodegenConfig = {
  schema: "../server/schema.graphql",
  documents: ["src/**/*.{ts,tsx}", "!src/graphql/generated/**"],
  ignoreNoDocuments: false,
  generates: {
    "src/graphql/generated/": {
      preset: "client",
      config: {
        scalars: { ISO8601DateTime: "string", JSON: "unknown" },
        enumsAsTypes: true,
        useTypeImports: true,
      },
      presetConfig: { fragmentMasking: false },
    },
  },
};

export default config;
