import { expect, test, type Locator, type Page } from "@playwright/test"

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

const ONE = "https://utfs.io/f/review-one"

const TWO = "https://utfs.io/f/review-two"

function files(statuses: string[]) {
  return statuses.map((status, index) => ({
    label: `File ${index + 1}`,
    dateUploaded: "2026-11-03",
    fileLink: index === 0 ? ONE : TWO,
    status,
  }))
}

// A D1.1 draft as the intake leaves it, with an OM and a PM on the project.
async function setUp(
  request = "Pending",
  statuses = ["Pending", "Pending"],
  state: "draft" | "submitted" = "draft"
) {
  const project = await makeProject(`Trailer ${tag()}`)
  const om = await makePerson()
  const pm = await makePerson()

  await giveRoles(om.id, project.id, ["OM"])
  await giveRoles(pm.id, project.id, ["PM"])

  const recordId = await addRecord(project.id, "D1.1", state, {
    payload: { requestStatus: request, attachedFiles: files(statuses) },
    ...(state === "submitted" && { submittedBy: om.id }),
  })

  return { project, om, pm, recordId }
}

async function open(page: Page, email: string, projectId: string) {
  await signIn(page, email)
  await page.goto(`/projects/${projectId}/tools/D1.1`)
}

function requestStatus(page: Page) {
  return page.getByRole("radiogroup", { name: "Request status" })
}

function fileStatus(page: Page, label: string) {
  return page.getByRole("radiogroup", { name: `Status of ${label}` })
}

function pick(group: Locator, name: string) {
  return group.getByRole("radio", { name, exact: true })
}

function submit(page: Page) {
  return page.getByRole("button", { name: "Submit for approval" })
}

async function choose(group: Locator, name: string) {
  await pick(group, name).click()
}

// The one that is chosen.
async function expectChosen(group: Locator, name: string) {
  await expect(pick(group, name)).toHaveAttribute("aria-checked", "true")
}

test("the OM switches the request to Reviewed and back to Pending", async ({
  page,
}) => {
  const { project, om } = await setUp()

  await open(page, om.email, project.id)

  await expectChosen(requestStatus(page), "Pending")

  await choose(requestStatus(page), "Reviewed")
  await expectChosen(requestStatus(page), "Reviewed")
  await expect(pick(requestStatus(page), "Reviewed")).toBeEnabled()

  await page.reload()
  await expectChosen(requestStatus(page), "Reviewed")

  await choose(requestStatus(page), "Pending")
  await expectChosen(requestStatus(page), "Pending")
  await expect(pick(requestStatus(page), "Pending")).toBeEnabled()

  await page.reload()
  await expectChosen(requestStatus(page), "Pending")
})

test("the OM switches one file and the others stay as they were", async ({
  page,
}) => {
  const { project, om } = await setUp()

  await open(page, om.email, project.id)
  await choose(fileStatus(page, "File 2"), "Reviewed")

  await expectChosen(fileStatus(page, "File 2"), "Reviewed")
  await expect(pick(fileStatus(page, "File 2"), "Reviewed")).toBeEnabled()

  await page.reload()

  await expectChosen(fileStatus(page, "File 1"), "Pending")
  await expectChosen(fileStatus(page, "File 2"), "Reviewed")
  await expectChosen(requestStatus(page), "Pending")
})

test("pressing the chosen status again keeps it and shows no error", async ({
  page,
}) => {
  const { project, om } = await setUp()

  await open(page, om.email, project.id)
  await choose(requestStatus(page), "Reviewed")
  await expectChosen(requestStatus(page), "Reviewed")
  await choose(requestStatus(page), "Reviewed")

  await expectChosen(requestStatus(page), "Reviewed")
  await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0)

  await page.reload()
  await expectChosen(requestStatus(page), "Reviewed")
})

test("Approved is not offered to the OM", async ({ page }) => {
  const { project, om } = await setUp()

  await open(page, om.email, project.id)

  for (const group of [requestStatus(page), fileStatus(page, "File 1")]) {
    await expect(group.getByRole("radio")).toHaveCount(2)
    await expect(pick(group, "Pending")).toBeVisible()
    await expect(pick(group, "Reviewed")).toBeVisible()
    await expect(pick(group, "Approved")).toHaveCount(0)
  }
})

test("after the PM approves, the OM sees Approved everywhere, read only", async ({
  browser,
  page,
}) => {
  const { project, om, pm } = await setUp(
    "Reviewed",
    ["Reviewed", "Reviewed"],
    "submitted"
  )

  await open(page, pm.email, project.id)
  await page.getByRole("button", { name: "Approve" }).click()
  await expect(page.getByText("Locked", { exact: true })).toBeVisible()

  const context = await browser.newContext()
  const second = await context.newPage()

  await open(second, om.email, project.id)

  const requestTable = second.getByRole("table", { name: "Request status" })

  await expect(
    requestTable.getByText("Approved", { exact: true })
  ).toBeVisible()
  await expect(requestStatus(second)).toHaveCount(0)

  const table = second.getByRole("table", { name: "Attached files" })

  await expect(table.getByText("Approved", { exact: true })).toHaveCount(2)
  await expect(submit(second)).toHaveCount(0)

  await context.close()
})

test("Open file opens the file in a new tab through the ERM", async ({
  page,
  context,
}) => {
  const { project, om, recordId } = await setUp()

  await context.route("https://utfs.io/**", (route) =>
    route.fulfill({ status: 200, contentType: "text/plain", body: "the file" })
  )

  await open(page, om.email, project.id)

  const button = page.getByRole("link", { name: /^Open file/ }).first()

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
})

test("a client, or a person outside the project, never reaches the screen", async ({
  page,
}) => {
  const { project } = await setUp()
  const client = await makePerson()
  const stranger = await makePerson()

  await giveRoles(client.id, project.id, ["Client"])

  await open(page, client.email, project.id)
  await expect(page.getByText(NOT_FOUND)).toBeVisible()
  await expect(requestStatus(page)).toHaveCount(0)

  await page.context().clearCookies()
  await open(page, stranger.email, project.id)
  await expect(page.getByText(NOT_FOUND)).toBeVisible()
})

test("a request with no files says so, and nothing fails", async ({ page }) => {
  const { project, om } = await setUp("Pending", [])

  await open(page, om.email, project.id)

  await expect(page.getByText("No files were attached")).toBeVisible()
  await expect(submit(page)).toBeDisabled()

  await choose(requestStatus(page), "Reviewed")

  await expect(submit(page)).toBeEnabled()
})

test("at 375px nothing scrolls sideways and the buttons work", async ({
  page,
}) => {
  const { project, om } = await setUp()

  await page.setViewportSize({ width: 375, height: 812 })
  await open(page, om.email, project.id)

  expect(await sidewaysScroll(page)).toBeLessThanOrEqual(0)

  await choose(fileStatus(page, "File 1"), "Reviewed")
  await expectChosen(fileStatus(page, "File 1"), "Reviewed")
  await expect(
    page.getByRole("link", { name: /^Open file/ }).first()
  ).toBeVisible()

  expect(await sidewaysScroll(page)).toBeLessThanOrEqual(0)
})

test("Submit for approval stays disabled while the request or any file is pending", async ({
  page,
}) => {
  const { project, om } = await setUp()

  await open(page, om.email, project.id)
  await expect(submit(page)).toBeDisabled()

  await choose(requestStatus(page), "Reviewed")
  await choose(fileStatus(page, "File 1"), "Reviewed")
  await expect(submit(page)).toBeDisabled()

  await choose(fileStatus(page, "File 2"), "Reviewed")
  await expect(submit(page)).toBeEnabled()

  await choose(fileStatus(page, "File 1"), "Pending")
  await expect(submit(page)).toBeDisabled()
})

test("submitting sends D1.1 for approval and the statuses become read only", async ({
  page,
}) => {
  const { project, om } = await setUp()

  await open(page, om.email, project.id)
  await choose(requestStatus(page), "Reviewed")
  await choose(fileStatus(page, "File 1"), "Reviewed")
  await choose(fileStatus(page, "File 2"), "Reviewed")
  await submit(page).click()

  await expect(page.getByText("Submitted", { exact: true })).toBeVisible()
  await expect(submit(page)).toHaveCount(0)
  await expect(pick(requestStatus(page), "Reviewed")).toBeDisabled()
  await expectChosen(requestStatus(page), "Reviewed")
})
