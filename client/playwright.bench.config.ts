import { defineConfig, devices } from "@playwright/test";

const PORT = 4175;

// Browsers live inside the project (client/.pw-browsers), never in a global cache.
process.env.PLAYWRIGHT_BROWSERS_PATH ??= `${import.meta.dirname}/.pw-browsers`;

// The benchmark (npm run bench) measures the production build served by
// `vite preview`; the stress page needs no API server. One worker, so runs
// never compete for the CPU.
export default defineConfig({
  testDir: "./scripts",
  testMatch: "benchmark.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 0,
  reporter: "list",
  use: { baseURL: `http://localhost:${String(PORT)}` },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
    },
  ],
  webServer: {
    command: `npx vite build --outDir dist-bench --emptyOutDir && npx vite preview --outDir dist-bench --port ${String(PORT)} --strictPort`,
    url: `http://localhost:${String(PORT)}`,
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
