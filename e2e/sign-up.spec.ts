import { expect, test, type Page } from "@playwright/test"

import { PASSWORD, accountOf, confirmLink, tag } from "./support/data"

// Every address is on example.com, which no inbox can have: the server never
// hands these emails to the real provider.
function newEmail() {
  return `${tag()}-${tag()}@example.com`
}

async function signUp(page: Page, email: string) {
  await page.goto("/sign-up", { waitUntil: "networkidle" })
  await page.getByLabel("Full name").fill("Kwaku Ampofo")
  await page.getByLabel("Email").fill(email)
  await page.getByLabel("Password").fill(PASSWORD)
  await page.getByRole("button", { name: "Create account" }).click()
  await expect(page).toHaveURL(/\/verify-email/, { timeout: 30_000 })
}

test("the sign-in page links to sign-up", async ({ page }) => {
  await page.goto("/sign-in")
  await page.getByRole("link", { name: "Create an account" }).click()

  await expect(
    page.getByRole("heading", { name: "Create your account", level: 1 })
  ).toBeVisible()
})

test("the form names each field it refuses", async ({ page }) => {
  await page.goto("/sign-up", { waitUntil: "networkidle" })
  await page.getByLabel("Email").fill("not an email")
  await page.getByLabel("Password").fill("short")
  await page.getByRole("button", { name: "Create account" }).click()

  await expect(page.getByText("Enter your name.")).toBeVisible()
  await expect(
    page.getByText("Enter an email address, such as name@company.com.")
  ).toBeVisible()
  await expect(page.getByText("Use at least 8 characters.")).toBeVisible()
  expect(new URL(page.url()).pathname).toBe("/sign-up")
})

test("signing up makes a client account and asks to confirm the email", async ({
  page,
}) => {
  const email = newEmail()

  await signUp(page, email)

  await expect(
    page.getByRole("heading", { name: "Check your email", level: 1 })
  ).toBeVisible()
  await expect(page.getByText(email)).toBeVisible()
  expect(await accountOf(email)).toEqual({
    accountType: "client",
    emailVerified: false,
  })
})

test("the link can be sent again", async ({ page }) => {
  await signUp(page, newEmail())

  await page.getByRole("button", { name: "Send the link again" }).click()

  await expect(page.getByText("Sent. Check your inbox.")).toBeVisible()
})

test("signing in before confirming goes to the confirm-email page", async ({
  page,
}) => {
  const email = newEmail()

  await signUp(page, email)

  await page.goto("/sign-in", { waitUntil: "networkidle" })
  await page.getByLabel("Email").fill(email)
  await page.getByLabel("Password").fill(PASSWORD)
  await page.getByRole("button", { name: "Sign in" }).click()

  await expect(page).toHaveURL(/\/verify-email/)
  await expect(
    page.getByRole("heading", { name: "Check your email", level: 1 })
  ).toBeVisible()
})

test("the link confirms the email, signs the client in and offers to start a project", async ({
  page,
}) => {
  const email = newEmail()

  await signUp(page, email)
  await page.goto(await confirmLink(email))

  await expect(page).toHaveURL(/\/$/, { timeout: 30_000 })
  await expect(
    page.getByRole("link", { name: "Start new project" })
  ).toBeVisible()
  expect((await accountOf(email))?.emailVerified).toBe(true)
})
