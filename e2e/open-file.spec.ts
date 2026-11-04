import { expect, test, type Page } from "@playwright/test"

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

const ONE = "https://utfs.io/f/file-one"

const TWO = "https://utfs.io/f/file-two"

function files(links: string[]) {
  return links.map((fileLink, index) => ({
    label: `File ${index + 1}`,
    dateUploaded: "2026-11-03",
    fileLink,
    status: "Pending",
  }))
}

async function setUp(links = [ONE, TWO], state: "draft" | "locked" = "draft") {
  const project = await makeProject(`Trailer ${tag()}`)
  const om = await makePerson()

  await giveRoles(om.id, project.id, ["OM"])

  const recordId = await addRecord(project.id, "D1.1", state, {
    payload: { requestStatus: "Pending", attachedFiles: files(links) },
  })

  return { project, om, recordId }
}

async function open(page: Page, email: string, projectId: string) {
  await signIn(page, email)
  await page.goto(`/projects/${projectId}/tools/D1.1`)
}

function openButtons(page: Page) {
  return page.getByRole("link", { name: /^Open file/ })
}

test("each stored file shows an Open file button", async ({ page }) => {
  const { project, om } = await setUp()

  await open(page, om.email, project.id)

  await expect(openButtons(page)).toHaveCount(2)
})

test("Open file goes through the ERM and opens the file in a new tab", async ({
  page,
  context,
}) => {
  const { project, om, recordId } = await setUp([ONE])

  await context.route("https://utfs.io/**", (route) =>
    route.fulfill({ status: 200, contentType: "text/plain", body: "the file" })
  )

  await open(page, om.email, project.id)

  const button = openButtons(page).first()

  await expect(button).toHaveAttribute("target", "_blank")
  await expect(button).toHaveAttribute(
    "href",
    `/api/files/${recordId}?ref=${encodeURIComponent(ONE)}`
  )

  const [popup] = await Promise.all([
    context.waitForEvent("page"),
    button.click(),
  ])

  await popup.waitForURL(ONE)
  expect(popup.url()).toBe(ONE)
})

test("a file with no link has no button", async ({ page }) => {
  const { project, om } = await setUp([ONE, ""])

  await open(page, om.email, project.id)

  await expect(openButtons(page)).toHaveCount(1)
})

test("the files table cannot be edited in the form", async ({ page }) => {
  const { project, om } = await setUp()

  await open(page, om.email, project.id)

  const table = page.getByRole("table", { name: "Attached files" })

  await expect(table).toBeVisible()
  await expect(table.getByRole("textbox")).toHaveCount(0)
  await expect(table.getByRole("button", { name: "Add row" })).toHaveCount(0)
  await expect(table.getByRole("button", { name: /^Remove/ })).toHaveCount(0)
  await expect(table.getByText("File 1")).toBeVisible()
})

test("on a locked record the button still works", async ({ page, context }) => {
  const { project, om } = await setUp([ONE], "locked")

  await context.route("https://utfs.io/**", (route) =>
    route.fulfill({ status: 200, contentType: "text/plain", body: "the file" })
  )

  await open(page, om.email, project.id)

  const [popup] = await Promise.all([
    context.waitForEvent("page"),
    openButtons(page).first().click(),
  ])

  await popup.waitForURL(ONE)
})

test("a person who may not read the record never reaches the page", async ({
  page,
}) => {
  const { project } = await setUp()
  const stranger = await makePerson()

  await open(page, stranger.email, project.id)

  await expect(page.getByText(NOT_FOUND)).toBeVisible()
  await expect(openButtons(page)).toHaveCount(0)
})

test("at 375px the page does not scroll sideways and the button is usable", async ({
  page,
}) => {
  const { project, om } = await setUp()

  await page.setViewportSize({ width: 375, height: 800 })
  await open(page, om.email, project.id)

  const button = openButtons(page).first()

  await expect(button).toBeVisible()
  expect(await sidewaysScroll(page)).toBe(0)

  const box = await button.boundingBox()

  expect(box?.height).toBeGreaterThanOrEqual(24)
})
