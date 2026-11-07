import { expect, test, type Page } from "@playwright/test"

import {
  makeAdmin,
  makeProject,
  sidewaysScroll,
  signIn,
  tag,
} from "./support/data"

// The sidebar (with the Assign staff link) shows from the xl breakpoint.
test.use({ viewport: { width: 1440, height: 900 } })

// Every test shares one dev database that keeps the projects the others made,
// so the exact number is not known. These tests make three projects that need
// a team, then compare the link with what the list itself shows.

async function signInAsAdmin(page: Page) {
  const admin = await makeAdmin()

  await signIn(page, admin.email)

  return admin
}

async function makeWaiting(count: number) {
  for (let each = 0; each < count; each += 1) {
    await makeProject(`Waiting ${tag()}`)
  }
}

function numberIn(text: string) {
  const match = /\((\d+)\)/.exec(text)

  return match ? Number(match[1]) : null
}

test("5. the sidebar link shows how many projects wait, and it matches the list", async ({
  page,
}) => {
  await makeWaiting(3)
  await signInAsAdmin(page)

  const link = page
    .getByRole("complementary", { name: "Sidebar" })
    .getByRole("link", { name: /^Assign staff \(\d+\)$/ })

  // On the team page, the number and the list come from the same page.
  await page.goto("/admin/team")
  await expect(link).toBeVisible()

  const shown = numberIn(await link.innerText())
  const listed = await page.getByRole("main").getByRole("listitem").count()

  expect(shown).toBeGreaterThanOrEqual(3)
  expect(shown).toBe(listed)

  // On any other page it is there too.
  await page.goto("/")
  await expect(link).toHaveText(/^Assign staff \(\d+\)$/)
})

test("7. at 375px the top bar shows Team with the number, with no sideways scroll", async ({
  page,
}) => {
  await makeWaiting(3)
  await page.setViewportSize({ width: 375, height: 812 })
  await signInAsAdmin(page)

  const link = page
    .getByRole("banner")
    .getByRole("link", { name: /^Team \(\d+\)$/ })

  await expect(link).toBeVisible()
  expect(numberIn(await link.innerText())).toBeGreaterThanOrEqual(3)
  expect(await sidewaysScroll(page)).toBeLessThanOrEqual(0)

  await page.goto("/admin/team")

  await expect(link).toBeVisible()
  expect(await sidewaysScroll(page)).toBeLessThanOrEqual(0)

  await link.click()

  await expect(page).toHaveURL(/\/admin\/team$/)
})
