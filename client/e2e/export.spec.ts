import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { signInAs } from "./helpers";

// Exporting the seeded "Wire a weather station" plan as a PNG image and as a
// paged PDF. The PDF must have exactly the page count the dialog announced,
// with matching "Page n of N" footers.

async function openPreview(page: Page) {
  await signInAs(page, "Ada Okafor");
  await page.getByLabel("Workspace").selectOption({ label: "Riverside Makers (owner)" });
  await page.locator("li", { hasText: "Wire a weather station" }).getByRole("link", { name: "Preview" }).click();
  await expect(page.locator(".preview-canvas")).toBeVisible();
  await expect(page.locator(".connector__line").first()).toBeAttached();
  await expect(page.locator(".preview-canvas")).not.toHaveClass(/canvas--opening/);
}

async function downloaded(page: Page, start: () => Promise<void>) {
  const download = page.waitForEvent("download");
  await start();
  const file = await download;
  const path = await file.path();
  return { name: file.suggestedFilename(), bytes: await readFile(path) };
}

test("exports the diagram as a PNG image", async ({ page }) => {
  await openPreview(page);
  await page.getByRole("button", { name: /Export/ }).click();
  await page.getByLabel(/PNG image/).check();
  await page.getByLabel("Quality").selectOption("1");
  const { name, bytes } = await downloaded(page, () => page.getByRole("button", { name: "Export PNG" }).click());
  expect(name).toBe("wire-a-weather-station.png");
  // The PNG signature, then an IHDR chunk whose width covers the diagram plus its margin.
  expect([...bytes.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  expect(bytes.readUInt32BE(16)).toBeGreaterThan(400);
  expect(bytes.length).toBeGreaterThan(5_000);
});

test("exports a multi-page PDF whose page count and numbering match the dialog", async ({ page }) => {
  await openPreview(page);
  await page.getByRole("button", { name: /Export/ }).click();
  await page.getByLabel("Paper").selectOption("a4");
  await page.getByLabel("Orientation").selectOption("landscape");
  await page.getByLabel("Quality").selectOption("1");
  const announced = Number(/(\d+) page/.exec((await page.getByTestId("export-page-count").textContent()) ?? "")?.[1]);
  expect(announced).toBeGreaterThan(1);
  const { name, bytes } = await downloaded(page, () => page.getByRole("button", { name: "Export PDF" }).click());
  expect(name).toBe("wire-a-weather-station.pdf");
  const text = bytes.toString("latin1");
  expect(text.startsWith("%PDF-1.4")).toBe(true);
  expect(text.match(/\/Type \/Page /g)).toHaveLength(announced);
  expect(text).toContain(`/Count ${String(announced)}`);
  for (let page = 1; page <= announced; page += 1)
    expect(text).toContain(`(Page ${String(page)} of ${String(announced)}) Tj`);
  // One JPEG per page, A4 landscape at 1×: 1122 × 794 px.
  expect(text.match(/\/Subtype \/Image \/Width 1122 \/Height 794/g)).toHaveLength(announced);
  expect(text).toContain("/Filter /DCTDecode");
});
