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
  return page.getByRole("combobox", { name: "Request status" })
}

function fileStatus(page: Page, label: string) {
  return page.getByRole("combobox", { name: `Status of ${label}` })
}

function submit(page: Page) {
  return page.getByRole("button", { name: "Submit for approval" })
}

async function choose(select: ReturnType<typeof requestStatus>, name: string) {
  await select.click()
  await select.page().getByRole("option", { name }).click()
}

test("the OM switches the request to Reviewed and back to Pending", async ({
  page,
}) => {
  const { project, om } = await setUp()

  await open(page, om.email, project.id)

  await expect(requestStatus(page)).toHaveText("Pending")

  await choose(requestStatus(page), "Reviewed")
  await expect(requestStatus(page)).toHaveText("Reviewed")
  await expect(requestStatus(page)).toBeEnabled()

  await page.reload()
  await expect(requestStatus(page)).toHaveText("Reviewed")

  await choose(requestStatus(page), "Pending")
  await expect(requestStatus(page)).toHaveText("Pending")
  await expect(requestStatus(page)).toBeEnabled()

  await page.reload()
  await expect(requestStatus(page)).toHaveText("Pending")
})

test("the OM switches one file and the others stay as they were", async ({
  page,
}) => {
  const { project, om } = await setUp()

  await open(page, om.email, project.id)
  await choose(fileStatus(page, "File 2"), "Reviewed")

  await expect(fileStatus(page, "File 2")).toHaveText("Reviewed")
  await expect(fileStatus(page, "File 2")).toBeEnabled()

  await page.reload()

  await expect(fileStatus(page, "File 1")).toHaveText("Pending")
  await expect(fileStatus(page, "File 2")).toHaveText("Reviewed")
  await expect(requestStatus(page)).toHaveText("Pending")
})

test("Approved is not offered to the OM", async ({ page }) => {
  const { project, om } = await setUp()

  await open(page, om.email, project.id)

  for (const select of [requestStatus(page), fileStatus(page, "File 1")]) {
    await select.click()

    await expect(page.getByRole("option", { name: "Reviewed" })).toBeVisible()
    await expect(page.getByRole("option", { name: "Pending" })).toBeVisible()
    await expect(page.getByRole("option", { name: "Approved" })).toHaveCount(0)

    await page.keyboard.press("Escape")
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

  await expect(requestStatus(second)).toHaveText("Approved")
  await expect(requestStatus(second)).toBeDisabled()

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
  await expect(fileStatus(page, "File 1")).toHaveText("Reviewed")
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
  await expect(requestStatus(page)).toBeDisabled()
  await expect(requestStatus(page)).toHaveText("Reviewed")
})
