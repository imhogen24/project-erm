import { expect, test, type Page } from "@playwright/test"

import {
  addRecord,
  giveRoles,
  makePerson,
  makeProject,
  signIn,
  tag,
} from "./support/data"

async function setUp() {
  const project = await makeProject(`Trailer ${tag()}`)
  const person = await makePerson()

  await giveRoles(person.id, project.id, ["PM"])

  return { project, person }
}

function tree(page: Page) {
  return page
    .getByRole("complementary", { name: "Sidebar" })
    .getByRole("group", { name: "Project tools" })
}

// The tools are listed by name, so each is found by its name.
const names = {
  "D1.1": "Client Email / Web Form",
  "D1.2": "Initial Inquiry Notification",
} as const

function toolLink(page: Page, toolId: keyof typeof names) {
  return page
    .getByRole("complementary", { name: "Sidebar" })
    .getByRole("link", { name: new RegExp(names[toolId]) })
}

test("the sidebar shows the project's workbooks as folders that open and close", async ({
  page,
}) => {
  const { project, person } = await setUp()

  await signIn(page, person.email)
  await page.goto(`/projects/${project.id}`)

  const folder = page
    .getByRole("complementary", { name: "Sidebar" })
    .getByRole("button", { name: "Onboarding (WB01)" })

  await expect(folder).toBeVisible()
  await expect(folder).toHaveAttribute("aria-expanded", "true")
  await expect(toolLink(page, "D1.1")).toBeVisible()

  await folder.click()
  await expect(folder).toHaveAttribute("aria-expanded", "false")
  await expect(toolLink(page, "D1.1")).toBeHidden()

  await folder.click()
  await expect(toolLink(page, "D1.1")).toBeVisible()
})

test("every workbook is a folder, and one with no tools says so", async ({
  page,
}) => {
  const { project, person } = await setUp()

  await signIn(page, person.email)
  await page.goto(`/projects/${project.id}`)

  const sidebar = page.getByRole("complementary", { name: "Sidebar" })

  for (const name of [
    "Onboarding (WB01)",
    "Contracting (WB02)",
    "Payments (WB03)",
    "Team planning (WB04)",
    "Engineering design (WB05)",
    "Client review (WB06)",
    "Procurement (WB07)",
    "Fabrication (WB08)",
    "Quality control (WB09)",
    "Documentation (WB10)",
    "Delivery (WB11)",
    "Post-delivery support (WB12)",
    "Marketing (WB13)",
  ]) {
    await expect(
      sidebar.getByRole("button", { name, exact: true })
    ).toBeVisible()
  }

  await sidebar
    .getByRole("button", { name: "Marketing (WB13)", exact: true })
    .click()

  await expect(sidebar.getByText("No tools yet")).toBeVisible()
})

test("a tool in the tree opens that tool, and the open tool is marked", async ({
  page,
}) => {
  const { project, person } = await setUp()

  await signIn(page, person.email)
  await page.goto(`/projects/${project.id}`)
  await toolLink(page, "D1.1").click()

  await expect(page).toHaveURL(
    new RegExp(`/projects/${project.id}/tools/D1.1$`)
  )
  await expect(toolLink(page, "D1.1")).toHaveAttribute("aria-current", "page")
  await expect(toolLink(page, "D1.2")).not.toHaveAttribute(
    "aria-current",
    "page"
  )

  // Still there on the tool page, so another tool is one click away.
  await toolLink(page, "D1.2").click()
  await expect(page).toHaveURL(new RegExp(`/tools/D1.2$`))
  await expect(toolLink(page, "D1.2")).toHaveAttribute("aria-current", "page")
})

test("each tool says where it stands, in words", async ({ page }) => {
  const { project, person } = await setUp()

  await addRecord(project.id, "D1.1", "locked")
  await signIn(page, person.email)
  await page.goto(`/projects/${project.id}`)

  await expect(toolLink(page, "D1.1")).toContainText("Locked")
  await expect(toolLink(page, "D1.2")).toContainText("Not started")
})

test("a tool in progress has dots travelling round its square, and an open lock", async ({
  page,
}) => {
  const { project, person } = await setUp()

  await addRecord(project.id, "D1.2", "draft")
  await signIn(page, person.email)
  await page.goto(`/projects/${project.id}`)

  const link = toolLink(page, "D1.2")

  await expect(link.locator("svg[data-progress]")).toHaveAttribute(
    "data-progress",
    "active"
  )
  await expect(link.locator("[data-lock]")).toHaveAttribute("data-lock", "open")

  const animation = await link
    .locator("svg[data-progress] rect")
    .evaluate((rect) => getComputedStyle(rect).animationName)

  expect(animation).toBe("tool-march")
})

test("the dots hold still for a person who asks for less motion", async ({
  page,
}) => {
  const { project, person } = await setUp()

  await page.emulateMedia({ reducedMotion: "reduce" })
  await addRecord(project.id, "D1.2", "submitted")
  await signIn(page, person.email)
  await page.goto(`/projects/${project.id}`)

  const animation = await toolLink(page, "D1.2")
    .locator("svg[data-progress] rect")
    .evaluate((rect) => getComputedStyle(rect).animationName)

  expect(animation).toBe("none")
})

test("a locked tool has a solid square and a closed lock, and one not started has neither", async ({
  page,
}) => {
  const { project, person } = await setUp()

  await addRecord(project.id, "D1.1", "locked")
  await signIn(page, person.email)
  await page.goto(`/projects/${project.id}`)

  const locked = toolLink(page, "D1.1")

  await expect(locked.locator("svg[data-progress]")).toHaveAttribute(
    "data-progress",
    "done"
  )
  await expect(locked.locator("[data-lock]")).toHaveAttribute(
    "data-lock",
    "closed"
  )

  const waiting = toolLink(page, "D1.2")

  await expect(waiting.locator("svg[data-progress]")).toHaveAttribute(
    "data-progress",
    "none"
  )
  await expect(waiting.locator("[data-lock]")).toHaveAttribute(
    "data-lock",
    "open"
  )
})

test("the main page still lists the tool tiles", async ({ page }) => {
  const { project, person } = await setUp()

  await signIn(page, person.email)
  await page.goto(`/projects/${project.id}`)

  await expect(
    page
      .getByRole("main")
      .getByRole("link", { name: "D1.1 Client Email / Web Form" })
  ).toBeVisible()
})

test("outside a project the sidebar has no tree", async ({ page }) => {
  const { person } = await setUp()

  await signIn(page, person.email)

  await expect(tree(page)).toHaveCount(0)
})

test("on a phone the top bar is shown and the page does not scroll sideways", async ({
  page,
}) => {
  const { project, person } = await setUp()

  await page.setViewportSize({ width: 375, height: 812 })
  await signIn(page, person.email)
  await page.goto(`/projects/${project.id}/tools/D1.1`)

  await expect(page.getByRole("banner")).toBeVisible()
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth
    )
  ).toBeLessThanOrEqual(0)
})
