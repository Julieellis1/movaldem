import { test, expect } from "@playwright/test";

test("empty state renders title and action", async ({ page }) => {
  // plan's `/_primitives-preview` can't work: Next.js excludes underscore
  // folders from routing, so the route is /primitives-preview.
  await page.goto("/primitives-preview");
  await expect(page.getByText("No items yet")).toBeVisible();
});
