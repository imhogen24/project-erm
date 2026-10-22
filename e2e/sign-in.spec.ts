import { expect, test, type Page } from "@playwright/test"
import { hashPassword } from "better-auth/crypto"

import { createDatabase } from "@/db"

const email = "sign-in-page@example.com"

const password = "correct-horse-battery"

// The page tests need one real account. It is added straight to the dev
// database and left there, so running the tests again finds it.
test.beforeAll(async () => {
  const url = process.env.DATABASE_URL

  if (!url) {
    throw new Error("DATABASE_URL is not set. Run with `bun run test:e2e`.")
  }

  const database = createDatabase(url)

  try {
    const { rows: found } = await database.pool.query<{ id: string }>(
      "SELECT id FROM people WHERE email = $1",
      [email]
    )

    let personId = found[0]?.id

    if (!personId) {
      const { rows: created } = await database.pool.query<{ id: string }>(
        "INSERT INTO people (name, email) VALUES ($1, $2) RETURNING id",
        ["Sign In Page", email]
      )

      personId = created[0]!.id
    }

    await database.pool.query(
      `INSERT INTO accounts (person_id, account_id, provider_id, password)
       SELECT $1::uuid, $1::text, 'credential', $2
       WHERE NOT EXISTS (
         SELECT 1 FROM accounts WHERE person_id = $1::uuid AND provider_id = 'credential'
       )`,
      [personId, await hashPassword(password)]
    )
  } finally {
    await database.pool.end()
  }
})

async function fillAndSubmit(page: Page, address: string, secret: string) {
  await page.getByLabel("Email").fill(address)
  await page.getByLabel("Password").fill(secret)
  await page.getByRole("button", { name: "Sign in" }).click()
}

test("the page shows the form without redirecting away", async ({ page }) => {
  await page.goto("/sign-in")

  expect(new URL(page.url()).pathname).toBe("/sign-in")
  await expect(page.getByText("IMHOGEN ERM")).toBeVisible()
  await expect(
    page.getByRole("heading", { name: "Sign in", level: 1 })
  ).toBeVisible()
  await expect(page.getByLabel("Email")).toBeVisible()
  await expect(page.getByLabel("Password")).toBeVisible()
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible()
})

test("a valid email and password land on /", async ({ page }) => {
  await page.goto("/sign-in")
  await fillAndSubmit(page, email, password)

  await expect(page).toHaveURL(/\/$/)
})

test("a wrong password shows the error and stays on /sign-in", async ({
  page,
}) => {
  await page.goto("/sign-in")
  await fillAndSubmit(page, email, "not-the-password")

  await expect(page.getByText("Wrong email or password.")).toBeVisible()
  expect(new URL(page.url()).pathname).toBe("/sign-in")
})

test("an unknown email shows the same error", async ({ page }) => {
  await page.goto("/sign-in")
  await fillAndSubmit(page, "nobody-at-all@example.com", password)

  await expect(page.getByText("Wrong email or password.")).toBeVisible()
  expect(new URL(page.url()).pathname).toBe("/sign-in")
})

test("empty fields show a message and send nothing", async ({ page }) => {
  const sent: string[] = []

  page.on("request", (request) => {
    if (request.url().includes("/api/auth/")) {
      sent.push(request.url())
    }
  })

  await page.goto("/sign-in")
  await page.getByRole("button", { name: "Sign in" }).click()

  await expect(page.getByText("Enter your email.")).toBeVisible()
  await expect(page.getByText("Enter your password.")).toBeVisible()

  await page.getByLabel("Email").fill(email)
  await page.getByRole("button", { name: "Sign in" }).click()

  await expect(page.getByText("Enter your email.")).toBeHidden()
  await expect(page.getByText("Enter your password.")).toBeVisible()
  expect(sent).toEqual([])
})

test("the button is disabled and reads Signing in… while waiting", async ({
  page,
}) => {
  await page.route("**/api/auth/sign-in/email", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1500))
    await route.continue()
  })

  await page.goto("/sign-in")
  await fillAndSubmit(page, email, password)

  const waiting = page.getByRole("button", { name: "Signing in…" })

  await expect(waiting).toBeVisible()
  await expect(waiting).toBeDisabled()
  await expect(page).toHaveURL(/\/$/)
})

test("a failed sign-in does not leave the button stuck", async ({ page }) => {
  await page.goto("/sign-in")
  await fillAndSubmit(page, email, "not-the-password")

  await expect(page.getByText("Wrong email or password.")).toBeVisible()
  await expect(page.getByRole("button", { name: "Sign in" })).toBeEnabled()
})

test("at 375px there is no sideways scroll and the form works", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto("/sign-in")

  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth
  )

  expect(overflow).toBeLessThanOrEqual(0)

  await fillAndSubmit(page, email, password)

  await expect(page).toHaveURL(/\/$/)
})
