import { expect, test } from "@playwright/test"

test("a signed-out visitor is sent to /sign-in", async ({ page }) => {
  await page.goto("/")

  expect(new URL(page.url()).pathname).toBe("/sign-in")
})
