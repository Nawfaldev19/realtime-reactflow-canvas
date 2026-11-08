/// <reference types="vitest" />
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { cableUrlFor, DEFAULT_API_URL, securityHeaders } from "./src/security/headers";

// Framework-free algorithm modules (and the editor's pure state logic) stay at 90% coverage or more.
const ALGORITHM_THRESHOLD = { lines: 90, functions: 90, branches: 90, statements: 90 };
const EDITOR_LOGIC = [
  "store",
  "flowAdapter",
  "canvasChanges",
  "shortcuts",
  "editableText",
  "properties",
  "connectorGeometry",
  "frameScheduler",
  "snapping",
  "guideDrawing",
  "layoutAnimation",
];

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, import.meta.dirname, "VITE_");
  const apiUrl = env.VITE_API_URL ?? DEFAULT_API_URL;
  return {
    plugins: [react()],
    server: { port: 5173, strictPort: true },
    // The production build is served with the app's security headers. The
    // development server is not: its hot reload adds inline scripts.
    preview: { headers: securityHeaders({ apiUrl, cableUrl: env.VITE_CABLE_URL ?? cableUrlFor(apiUrl) }) },
    test: {
      environment: "jsdom",
      globals: true,
      setupFiles: ["./src/test/setup.ts"],
      include: ["src/**/*.test.{ts,tsx}"],
      coverage: {
        provider: "v8",
        include: ["src/**/*.{ts,tsx}"],
        // The worker entry is two lines of glue; the job it runs (layout/layeredJob.ts) is tested directly.
        exclude: [
          "src/graphql/generated/**",
          "src/test/**",
          "src/main.tsx",
          "src/**/*.test.{ts,tsx}",
          "src/**/*.d.ts",
          "src/**/*.worker.ts",
        ],
        thresholds: {
          lines: 80,
          functions: 80,
          branches: 75,
          statements: 80,
          "src/document/**": ALGORITHM_THRESHOLD,
          "src/geometry/**": ALGORITHM_THRESHOLD,
          "src/routing/**": ALGORITHM_THRESHOLD,
          "src/layout/**": ALGORITHM_THRESHOLD,
          "src/persistence/{autosave,viewSettingsSaver}.ts": ALGORITHM_THRESHOLD,
          "src/viewport/**": ALGORITHM_THRESHOLD,
          "src/reveal/**": ALGORITHM_THRESHOLD,
          "src/collab/**": ALGORITHM_THRESHOLD,
          "src/versions/**": ALGORITHM_THRESHOLD,
          "src/export/{pagination,pdf,plan,fonts}.ts": ALGORITHM_THRESHOLD,
          [`src/editor/{${EDITOR_LOGIC.join(",")}}.ts`]: ALGORITHM_THRESHOLD,
          "src/editor/slices/**": ALGORITHM_THRESHOLD,
          "src/editor/edges/hits.ts": ALGORITHM_THRESHOLD,
          "src/perf/{flags,guards,renderCounts,stats}.ts": ALGORITHM_THRESHOLD,
          "src/stress/{generate,access}.ts": ALGORITHM_THRESHOLD,
          "src/security/**": ALGORITHM_THRESHOLD,
        },
      },
    },
  };
});
