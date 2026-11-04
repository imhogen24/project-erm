import { expect, test, type Page } from "@playwright/test"

import type { JsonObject } from "@/db/schema"

import {
  addClientRequest,
  giveRoles,
  makePerson,
  makeProject,
  sidewaysScroll,
  signIn,
  tag,
} from "./support/data"

const BUTTON = "View client request"

const submission = {
  custom_engineering_id: "internal-id",
  organization_name: "Syntropy Engineering Solutions",
  contact_person: "Ama Mensah",
  email: "ama@client.example.com",
  project_scope: ["Design", "Build"],
  project_title: "Freezer trailer",
  by_products: null,
  file_attachments: ["https://utfs.io/f/secret-file-key"],
  notify_attempts: 3,
  updated_at: "2026-11-01T09:00:00+00:00",
}

async function setUp(answers: JsonObject = submission) {
  const project = await makeProject(`Trailer ${tag()}`)
  const om = await makePerson()

  await giveRoles(om.id, project.id, ["OM"])
  await addClientRequest(project.id, answers)

  return { project, om }
}

function panel(page: Page) {
  return page.getByRole("dialog", { name: "Client request" })
}

test("the button opens a panel with every answer, labelled and read only", async ({
  page,
}) => {
  const { project, om } = await setUp()

  await signIn(page, om.email)
  await page.goto(`/projects/${project.id}`)
  await page.getByRole("button", { name: BUTTON }).click()

  await expect(panel(page)).toBeVisible()
  await expect(panel(page).getByText("Organization name")).toBeVisible()
  await expect(
    panel(page).getByText("Syntropy Engineering Solutions")
  ).toBeVisible()
  await expect(panel(page).getByText("Design, Build")).toBeVisible()
  await expect(panel(page).getByText("Not given")).toBeVisible()
  await expect(panel(page).getByRole("textbox")).toHaveCount(0)
  await expect(panel(page).getByRole("combobox")).toHaveCount(0)
})

test("the button is on the project page and on a tool page", async ({
  page,
}) => {
  const { project, om } = await setUp()

  await signIn(page, om.email)

  await page.goto(`/projects/${project.id}`)
  await expect(page.getByRole("button", { name: BUTTON })).toBeVisible()

  await page.goto(`/projects/${project.id}/tools/D1.1`)
  await expect(page.getByRole("button", { name: BUTTON })).toBeVisible()
})

test("the panel leaves out the internal columns and the files", async ({
  page,
}) => {
  const { project, om } = await setUp()

  await signIn(page, om.email)
  await page.goto(`/projects/${project.id}`)
  await page.getByRole("button", { name: BUTTON }).click()

  await expect(panel(page)).toBeVisible()
  await expect(panel(page)).not.toContainText("internal-id")
  await expect(panel(page)).not.toContainText("Notify attempts")
  await expect(panel(page)).not.toContainText("Updated at")
  await expect(panel(page)).not.toContainText("secret-file-key")
  await expect(panel(page)).not.toContainText("File attachments")
})

test("a long request scrolls inside the panel", async ({ page }) => {
  const long = Object.fromEntries(
    Array.from({ length: 60 }, (_, index) => [
      `question_${index}`,
      `Answer number ${index}`,
    ])
  )

  const { project, om } = await setUp(long)

  await signIn(page, om.email)
  await page.goto(`/projects/${project.id}`)
  await page.getByRole("button", { name: BUTTON }).click()

  const scrolls = await panel(page)
    .locator("dl")
    .evaluate((element) => element.scrollHeight > element.clientHeight)

  expect(scrolls).toBe(true)

  await panel(page).getByText("Answer number 59").scrollIntoViewIfNeeded()
  await expect(panel(page).getByText("Answer number 59")).toBeInViewport()
})

test("the close button and Escape close the panel", async ({ page }) => {
  const { project, om } = await setUp()

  await signIn(page, om.email)
  await page.goto(`/projects/${project.id}`)

  await page.getByRole("button", { name: BUTTON }).click()
  await panel(page).getByRole("button", { name: "Close" }).click()
  await expect(panel(page)).toBeHidden()

  await page.getByRole("button", { name: BUTTON }).click()
  await expect(panel(page)).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(panel(page)).toBeHidden()
  await expect(page.getByRole("button", { name: BUTTON })).toBeVisible()
})

test("a client gets no button", async ({ page }) => {
  const { project } = await setUp()
  const client = await makePerson()

  await giveRoles(client.id, project.id, ["Client"])

  await signIn(page, client.email)
  await page.goto(`/projects/${project.id}`)

  await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
  await expect(page.getByRole("button", { name: BUTTON })).toHaveCount(0)
})

test("a person on another project never reaches the page or the button", async ({
  page,
}) => {
  const { project } = await setUp()
  const other = await makePerson()
  const elsewhere = await makeProject(`Other ${tag()}`)

  await giveRoles(other.id, elsewhere.id, ["OM"])

  await signIn(page, other.email)
  await page.goto(`/projects/${project.id}`)

  await expect(page.getByText("This page could not be found.")).toBeVisible()
  await expect(page.getByRole("button", { name: BUTTON })).toHaveCount(0)
})

test("a project with no saved request has no button", async ({ page }) => {
  const project = await makeProject(`Manual ${tag()}`)
  const om = await makePerson()

  await giveRoles(om.id, project.id, ["OM"])

  await signIn(page, om.email)
  await page.goto(`/projects/${project.id}`)

  await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
  await expect(page.getByRole("button", { name: BUTTON })).toHaveCount(0)
})

test("on a phone the panel fills the width and the page does not scroll sideways", async ({
  page,
}) => {
  const { project, om } = await setUp()

  await page.setViewportSize({ width: 375, height: 800 })
  await signIn(page, om.email)
  await page.goto(`/projects/${project.id}`)
  await page.getByRole("button", { name: BUTTON }).click()

  await expect(panel(page)).toBeVisible()

  const box = await panel(page).boundingBox()

  expect(box?.width).toBeGreaterThanOrEqual(374)
  expect(await sidewaysScroll(page)).toBe(0)
})
