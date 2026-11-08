import { expect, test, type Page } from "@playwright/test";
import { signInAs } from "../e2e/helpers";

// The README screenshot: Ada edits "Build a walnut side table" with a
// connector selected, while Ben, in a second browser, has the decision selected
// and his cursor over the canvas (his name tag and badge show in Ada's view).

const OUTPUT = `${import.meta.dirname}/../../docs/screenshot.png`;

async function openWalnutTable(page: Page, name: string, role: string) {
  await signInAs(page, name);
  await page.getByLabel("Workspace").selectOption({ label: `Riverside Makers (${role})` });
  await page.getByRole("link", { name: "Build a walnut side table" }).click();
  await expect(page.locator(".react-flow__node", { hasText: "Cut legs and aprons" })).toBeVisible();
  await expect(page.locator(".save-status")).toHaveText(/All changes saved|Saved/, { timeout: 15_000 });
}

test("capture docs/screenshot.png", async ({ page, browser }) => {
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  await openWalnutTable(page, "Ada Okafor", "owner");

  const ben = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await openWalnutTable(ben, "Ben Lindqvist", "editor");
  await ben.locator(".react-flow__node", { hasText: "Joints fit snug?" }).click();

  const connector = page.locator("[data-testid=connector]").nth(2).locator(".connector__line");
  const point = await connector.evaluate((element) => {
    const path = element as SVGPathElement;
    const at = path.getPointAtLength(path.getTotalLength() * 0.5);
    const matrix = path.getScreenCTM();
    if (!matrix) throw new Error("The connector is not rendered");
    return { x: at.x * matrix.a + at.y * matrix.c + matrix.e, y: at.x * matrix.b + at.y * matrix.d + matrix.f };
  });
  await page.mouse.click(point.x, point.y);
  await expect(page.getByRole("heading", { name: "Connector", level: 2 })).toBeVisible();
  const target = await ben.locator(".react-flow__node", { hasText: "Pare tenons with a chisel" }).boundingBox();
  if (!target) throw new Error("The step is not on screen");
  await ben.mouse.move(target.x + 60, target.y + target.height + 50, { steps: 10 });
  await expect(page.locator('.peer-cursor[data-member="Ben Lindqvist"]')).toBeVisible();
  await expect(page.locator(".peer-badge__label", { hasText: "Ben Lindqvist" })).toBeVisible();

  await page.screenshot({ path: OUTPUT });
  await ben.close();
});
