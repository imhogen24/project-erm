import { randomUUID } from "node:crypto"

import { expect, test } from "@playwright/test"

import {
  addRecord,
  giveRoles,
  makePerson,
  makeProject,
  sidewaysScroll,
  signIn,
  tag,
} from "./support/data"

const NOT_FOUND = "This page could not be found."

test("the list shows only the projects the person is on", async ({ page }) => {
  const person = await makePerson()
  const a = await makeProject(`Alpha ${tag()}`)
  const b = await makeProject(`Bravo ${tag()}`)
  const c = await makeProject(`Charlie ${tag()}`)

  await giveRoles(person.id, a.id, ["PM"])
  await giveRoles(person.id, b.id, ["OM"])
  await signIn(page, person.email)

  await expect(
    page.getByRole("main").getByRole("link", { name: a.name })
  ).toBeVisible()
  await expect(
    page.getByRole("main").getByRole("link", { name: b.name })
  ).toBeVisible()
  await expect(page.getByText(c.name)).toHaveCount(0)
})

test("a card shows the roles the person holds on that project", async ({
  page,
}) => {
  const person = await makePerson()
  const project = await makeProject()

  await giveRoles(person.id, project.id, ["PM", "OM"])
  await signIn(page, person.email)

  await expect(
    page.getByRole("main").getByRole("link", { name: project.name })
  ).toContainText("Your roles: OM, PM")
})

test("a person on no project is told so", async ({ page }) => {
  const person = await makePerson()

  await signIn(page, person.email)

  await expect(page.getByText("You are not on any project yet.")).toBeVisible()
})

test("clicking a card opens that project", async ({ page }) => {
  const person = await makePerson()
  const project = await makeProject()

  await giveRoles(person.id, project.id, ["PM"])
  await signIn(page, person.email)
  await page.getByRole("main").getByRole("link", { name: project.name }).click()

  await expect(page).toHaveURL(`/projects/${project.id}`)
  await expect(
    page.getByRole("heading", { name: project.name, level: 1 })
  ).toBeVisible()
})

test("each tool row shows the state of its newest record", async ({ page }) => {
  const person = await makePerson()
  const started = await makeProject()
  const empty = await makeProject()

  await giveRoles(person.id, started.id, ["PM"])
  await giveRoles(person.id, empty.id, ["PM"])
  await addRecord(started.id, "D1.1", "locked")
  await signIn(page, person.email)

  await page.goto(`/projects/${started.id}`)
  await expect(
    page.getByRole("listitem").filter({ hasText: "D1.1" })
  ).toContainText("Locked")

  await page.goto(`/projects/${empty.id}`)
  await expect(
    page.getByRole("listitem").filter({ hasText: "D1.1" })
  ).toContainText("Not started")
})

test("tools sit under a heading for their workbook", async ({ page }) => {
  const person = await makePerson()
  const project = await makeProject()

  await giveRoles(person.id, project.id, ["PM"])
  await signIn(page, person.email)
  await page.goto(`/projects/${project.id}`)

  await expect(page.getByRole("heading", { name: "Workbook 1" })).toBeVisible()
  await expect(page.getByText("Client Email / Web Form")).toBeVisible()
})

test("the back link returns to the project list", async ({ page }) => {
  const person = await makePerson()
  const project = await makeProject()

  await giveRoles(person.id, project.id, ["PM"])
  await signIn(page, person.email)
  await page.goto(`/projects/${project.id}`)
  await page.getByRole("link", { name: "Your projects" }).click()

  await expect(page).toHaveURL(/\/$/)
})

test("a project the person is not on shows the not found page", async ({
  page,
}) => {
  const person = await makePerson()
  const other = await makeProject()

  await signIn(page, person.email)
  await page.goto(`/projects/${other.id}`)

  await expect(page.getByText(NOT_FOUND)).toBeVisible()
  await expect(page.getByText(other.name)).toHaveCount(0)
})

test("an unknown project shows the same not found page", async ({ page }) => {
  const person = await makePerson()

  await signIn(page, person.email)
  await page.goto(`/projects/${randomUUID()}`)

  await expect(page.getByText(NOT_FOUND)).toBeVisible()
})

test("a project id that is not an id shows the not found page too", async ({
  page,
}) => {
  const person = await makePerson()

  await signIn(page, person.email)
  await page.goto("/projects/not-an-id")

  await expect(page.getByText(NOT_FOUND)).toBeVisible()
})

test("the header shows the app name and the person's name on every page", async ({
  page,
}) => {
  const person = await makePerson(`Ama Owusu ${tag()}`)
  const project = await makeProject()

  await giveRoles(person.id, project.id, ["PM"])
  await signIn(page, person.email)

  // The sidebar is on the list, with no top bar at this width.
  const sidebar = page.getByRole("complementary", { name: "Sidebar" })

  await expect(sidebar.getByRole("link", { name: "IMHOGEN ERM" })).toBeVisible()
  await expect(sidebar.getByText(person.name)).toBeVisible()
  await expect(page.getByRole("banner")).toBeHidden()

  // Inside a project it is the same sidebar, now with the project's name.
  await page.goto(`/projects/${project.id}`)

  await expect(sidebar.getByRole("link", { name: "IMHOGEN ERM" })).toBeVisible()
  await expect(sidebar.getByText(person.name)).toBeVisible()
  await expect(sidebar.getByText(project.name)).toBeVisible()
  await expect(page.getByRole("banner")).toBeHidden()
})

test("the sidebar jumps to a workbook on the same page", async ({ page }) => {
  const person = await makePerson()
  const project = await makeProject()

  await giveRoles(person.id, project.id, ["PM"])
  await signIn(page, person.email)
  await page.goto(`/projects/${project.id}`)
  await page
    .getByRole("complementary", { name: "Sidebar" })
    .getByRole("link", { name: "Workbook 1" })
    .click()

  await expect(page).toHaveURL(/#wb01$/)
})

test("the app name links back to the project list", async ({ page }) => {
  const person = await makePerson()
  const project = await makeProject()

  await giveRoles(person.id, project.id, ["PM"])
  await signIn(page, person.email)
  await page.goto(`/projects/${project.id}`)
  await page
    .getByRole("complementary", { name: "Sidebar" })
    .getByRole("link", { name: "IMHOGEN ERM" })
    .click()

  await expect(page).toHaveURL(/\/$/)
})

test("signing out goes to /sign-in and stays signed out", async ({ page }) => {
  const person = await makePerson()

  await signIn(page, person.email)
  await page.getByRole("button", { name: "Sign out" }).click()

  await expect(page).toHaveURL(/\/sign-in$/)

  await page.goto("/")

  await expect(page).toHaveURL(/\/sign-in$/)
})

test("a signed-out visitor is sent to /sign-in from a project address", async ({
  page,
}) => {
  await page.goto("/projects/anything")

  await expect(page).toHaveURL(/\/sign-in$/)
})

test("the sign-in page has no app header", async ({ page }) => {
  await page.goto("/sign-in")

  await expect(page.getByRole("banner")).toHaveCount(0)
  await expect(page.getByRole("complementary")).toHaveCount(0)
})

test("at 375px the list does not scroll sideways and Sign out works", async ({
  page,
}) => {
  const person = await makePerson(`Kwame Mensah ${tag()}`)
  const project = await makeProject(`Long ${"Name".repeat(20)} ${tag()}`)

  await giveRoles(person.id, project.id, ["PM", "OM"])
  await page.setViewportSize({ width: 375, height: 812 })
  await signIn(page, person.email)

  expect(await sidewaysScroll(page)).toBeLessThanOrEqual(0)
  await expect(page.getByText(person.name)).toBeHidden()

  await page.getByRole("button", { name: "Sign out" }).click()

  await expect(page).toHaveURL(/\/sign-in$/)
})

test("at 375px the overview does not scroll sideways and shows name and badge", async ({
  page,
}) => {
  const person = await makePerson()
  const project = await makeProject(`Long ${"Name".repeat(20)} ${tag()}`)

  await giveRoles(person.id, project.id, ["PM"])
  await page.setViewportSize({ width: 375, height: 812 })
  await signIn(page, person.email)
  await page.goto(`/projects/${project.id}`)

  expect(await sidewaysScroll(page)).toBeLessThanOrEqual(0)

  const row = page.getByRole("listitem").filter({ hasText: "D1.1" })

  await expect(row.getByText("Client Email / Web Form")).toBeVisible()
  await expect(row.getByText("Not started")).toBeVisible()
})
