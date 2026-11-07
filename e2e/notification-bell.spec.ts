import { expect, test, type Page } from "@playwright/test"

import {
  giveRoles,
  makePerson,
  makeProject,
  sidewaysScroll,
  signIn,
} from "./support/data"
import { addNotification } from "./support/notification-data"

// The sidebar (with its bell) shows from the xl breakpoint, the mobile bar
// below it. Both are in the page, one hidden, so only the visible bell counts.
test.use({ viewport: { width: 1440, height: 900 } })

function hoursAgo(hours: number) {
  return new Date(Date.now() - hours * 60 * 60 * 1000)
}

function bell(page: Page) {
  return page.locator('[data-testid="notification-bell"]:visible')
}

function bellCount(page: Page) {
  return page.locator('[data-testid="notification-count"]:visible')
}

function items(page: Page) {
  return page.getByTestId("notification-item")
}

// Three unread, made out of order so the list has to sort them.
async function threeUnread(personId: string, firstPath = "/") {
  await addNotification(personId, {
    title: "Budget review requested",
    path: "/",
    createdAt: hoursAgo(30),
  })
  await addNotification(personId, {
    title: "You were assigned as PM on Boiler",
    path: firstPath,
    createdAt: hoursAgo(2),
  })
  await addNotification(personId, {
    title: "D1.2 is open for you",
    path: "/",
    createdAt: hoursAgo(5),
  })
}

test("1. a person with 3 unread sees 3 on the bell", async ({ page }) => {
  const person = await makePerson()

  await threeUnread(person.id)
  await signIn(page, person.email)

  await expect(bell(page)).toBeVisible()
  await expect(bellCount(page)).toHaveText("3")
})

test("2. a person with none sees no number", async ({ page }) => {
  const person = await makePerson()

  await signIn(page, person.email)

  await expect(bell(page)).toBeVisible()
  await expect(bellCount(page)).toHaveCount(0)
})

test("3. the panel lists newest first with title and time", async ({
  page,
}) => {
  const person = await makePerson()

  await threeUnread(person.id)
  await signIn(page, person.email)
  await bell(page).click()

  await expect(items(page)).toHaveCount(3)
  await expect(items(page).nth(0)).toContainText(
    "You were assigned as PM on Boiler"
  )
  await expect(items(page).nth(1)).toContainText("D1.2 is open for you")
  await expect(items(page).nth(2)).toContainText("Budget review requested")
  await expect(items(page).nth(0).locator("time")).toHaveText("2 hours ago")
  await expect(items(page).nth(1).locator("time")).toHaveText("5 hours ago")
})

test("4. opening one goes to its page and marks it read", async ({ page }) => {
  const person = await makePerson()
  const project = await makeProject()

  await giveRoles(person.id, project.id, ["PM"])
  await threeUnread(person.id, `/projects/${project.id}`)
  await signIn(page, person.email)
  await bell(page).click()
  await items(page).nth(0).click()

  await expect(page).toHaveURL(`/projects/${project.id}`)
  await expect(bellCount(page)).toHaveText("2")

  await bell(page).click()

  await expect(items(page).nth(0)).toHaveAttribute("data-read", "true")
  await expect(items(page).nth(1)).toHaveAttribute("data-read", "false")
  await expect(items(page).nth(2)).toHaveAttribute("data-read", "false")
})

test("5. Mark all read clears the count and every item shows as read", async ({
  page,
}) => {
  const person = await makePerson()

  await threeUnread(person.id)
  await addNotification(person.id, {
    title: "Already read",
    path: "/",
    createdAt: hoursAgo(50),
    read: true,
  })
  await signIn(page, person.email)
  await bell(page).click()
  await page.getByRole("button", { name: "Mark all read" }).click()

  await expect(bellCount(page)).toHaveCount(0)
  await expect(items(page)).toHaveCount(4)

  for (const item of await items(page).all()) {
    await expect(item).toHaveAttribute("data-read", "true")
  }

  // It was saved, not only shown.
  await page.reload()

  await expect(bellCount(page)).toHaveCount(0)
})

test("6. a person with none sees the empty message", async ({ page }) => {
  const person = await makePerson()

  await signIn(page, person.email)
  await bell(page).click()

  await expect(page.getByText("You have no notifications.")).toBeVisible()
  await expect(items(page)).toHaveCount(0)
})

test("7. a signed-out visitor gets the sign-in page and no bell", async ({
  page,
}) => {
  await page.goto("/")

  await expect(page).toHaveURL(/\/sign-in$/)
  await expect(page.getByTestId("notification-bell")).toHaveCount(0)
})

test("8. at 375px the bell works with no sideways scroll", async ({ page }) => {
  const person = await makePerson()

  await threeUnread(person.id)
  await page.setViewportSize({ width: 375, height: 812 })
  await signIn(page, person.email)

  await expect(bellCount(page)).toHaveText("3")

  await bell(page).click()

  await expect(items(page)).toHaveCount(3)
  expect(await sidewaysScroll(page)).toBeLessThanOrEqual(0)

  const markAll = page.getByRole("button", { name: "Mark all read" })

  await expect(markAll).toBeVisible()

  for (const target of [markAll, items(page).first(), items(page).last()]) {
    await target.scrollIntoViewIfNeeded()

    const box = await target.boundingBox()

    expect(box).not.toBeNull()
    expect(box!.x).toBeGreaterThanOrEqual(0)
    expect(box!.x + box!.width).toBeLessThanOrEqual(375)
  }

  await markAll.click()

  await expect(bellCount(page)).toHaveCount(0)
})
