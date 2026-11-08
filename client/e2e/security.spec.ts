import { expect, test } from "@playwright/test";
import { newDiagram } from "./helpers";

// The production build, served by `vite preview` with the app's security
// headers (src/security/headers.ts), on its own port. Every feature that
// stretches the content security policy runs once: the API and its socket,
// web fonts, the layout worker, and export (data and blob images, font
// embedding). Any violation the browser reports fails the test.

const PRODUCTION = "http://localhost:5175";
const API = "http://localhost:3100";

test.use({ baseURL: PRODUCTION });

test("the production build sends its security headers and runs under its policy", async ({ page }) => {
  const violations: string[] = [];
  page.on("console", (message) => {
    if (/Content Security Policy|Refused to/.test(message.text())) violations.push(message.text());
  });
  await page.addInitScript(() => {
    const reported: string[] = [];
    Object.assign(window, { __violations: reported });
    document.addEventListener("securitypolicyviolation", (event) => {
      reported.push(`${event.effectiveDirective}: ${event.blockedURI}`);
    });
  });
  const reported = () => page.evaluate(() => (window as unknown as { __violations: string[] }).__violations);

  const response = await page.goto("/");
  const headers = response?.headers() ?? {};
  expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(headers["content-security-policy"]).toContain("script-src 'self'");
  expect(headers["content-security-policy"]).toContain(`connect-src 'self' ${API} ws://localhost:3100`);
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["x-frame-options"]).toBe("DENY");

  await newDiagram(page, "Policy check");
  await expect(page.getByRole("list", { name: "People in this diagram" })).toBeVisible({ timeout: 15_000 });

  await page.getByRole("button", { name: "Layout" }).click();
  const menu = page.getByRole("dialog", { name: "Layout" });
  await menu.getByRole("button", { name: "Layered" }).click();
  await expect(menu.getByRole("button", { name: "Layered" })).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Preview" }).click();
  await expect(page.locator(".preview-canvas")).not.toHaveClass(/canvas--opening/);
  await page.getByRole("button", { name: /Export/ }).click();
  await page.getByLabel(/PNG image/).check();
  await page.getByLabel("Quality").selectOption("1");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export PNG" }).click();
  expect((await download).suggestedFilename()).toBe("policy-check.png");

  expect(await reported()).toEqual([]);
  expect(violations).toEqual([]);
});

test("the API forbids framing and content sniffing", async ({ request }) => {
  const response = await request.get(`${API}/up`);

  expect(response.headers()["content-security-policy"]).toBe(
    "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  );
  expect(response.headers()["x-content-type-options"]).toBe("nosniff");
  expect(response.headers()["x-frame-options"]).toBe("DENY");
});
