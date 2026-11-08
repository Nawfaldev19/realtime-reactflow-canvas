import { defineConfig, devices } from "@playwright/test";
import base from "./playwright.config";

// `npm run screenshot` rewrites docs/screenshot.png and `npm run record:hero`
// rewrites docs/hero.gif, both from the seeded demo, with the same servers and
// freshly seeded database as the end-to-end suite.
export default defineConfig({
  ...base,
  testDir: "./scripts",
  testMatch: ["screenshot.ts", "record-hero.ts"],
  retries: 0,
  reporter: "list",
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
    },
  ],
});
