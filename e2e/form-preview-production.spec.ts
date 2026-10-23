import { expect, test } from "@playwright/test"

// A production build runs on its own port (see playwright.config.ts).
test.use({ baseURL: "http://localhost:3100" })

test("the form preview is not found in a production build", async ({
  page,
}) => {
  const response = await page.goto("/dev/form-preview")

  expect(response?.status()).toBe(404)
  await expect(page.getByText("This page could not be found.")).toBeVisible()
})

test("a production build does not hide the rest of the app", async ({
  page,
}) => {
  await page.goto("/sign-in")

  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible()
})
