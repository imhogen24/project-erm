import { expect, test, type Locator, type Page } from "@playwright/test"

import {
  makeAdmin,
  makeProject,
  sidewaysScroll,
  signIn,
  tag,
} from "./support/data"

// From RDP-127. The number of projects waiting for a team, shown as a count
// badge after the IT/Admin's links. Every test shares one dev database that
// keeps the projects the others made, so the exact number is not known: these
// tests make three projects that need a team, then compare the badge with the
// list itself.

// The sidebar (with the Assign staff link) shows from the xl breakpoint.
test.use({ viewport: { width: 1440, height: 900 } })

// Screen readers hear the link as its name, the number, and what it counts.
const counted = (name: string) =>
  new RegExp(`^${name} (\\d+) projects? needs? a team$`)

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

// The number in the link's badge.
async function numberIn(link: Locator) {
  return Number(/(\d+)/.exec((await link.textContent()) ?? "")?.[1])
}

test("the sidebar's Assign staff shows how many projects wait, matching the list", async ({
  page,
}) => {
  await makeWaiting(3)
  await signInAsAdmin(page)

  const link = page
    .getByRole("complementary", { name: "Sidebar" })
    .getByRole("link", { name: counted("Assign staff") })

  await page.goto("/admin/team")
  await expect(link).toBeVisible()

  const shown = await numberIn(link)
  const listed = await page.getByRole("main").getByRole("listitem").count()

  expect(shown).toBeGreaterThanOrEqual(3)
  expect(shown).toBe(listed)

  // On any other page it is there too.
  await page.goto("/")
  await expect(link).toBeVisible()
})

test("at 375px the top bar's Team shows the same count, with no sideways scroll", async ({
  page,
}) => {
  await makeWaiting(3)
  await page.setViewportSize({ width: 375, height: 812 })
  await signInAsAdmin(page)

  const link = page
    .getByRole("banner")
    .getByRole("link", { name: counted("Team") })

  await expect(link).toBeVisible()
  expect(await numberIn(link)).toBeGreaterThanOrEqual(3)
  expect(await sidewaysScroll(page)).toBeLessThanOrEqual(0)

  await link.click()

  await expect(page).toHaveURL(/\/admin\/team$/)
  expect(await sidewaysScroll(page)).toBeLessThanOrEqual(0)
})
