import { expect, test, type Page } from "@playwright/test"

import {
  addRecord,
  giveRoles,
  makeChangeRequest,
  makePerson,
  makeProject,
  sidewaysScroll,
  signIn,
  tag,
} from "./support/data"

// On D1.1 (Client Email / Web Form) the OM writes, the PM approves and the
// Client Reviewer (CR) only reads.
const REASON = "The client's company name is misspelled"

const REJECTION = "The name matches the signed form"

// The overview square of one tool. The id must match whole, or "D1.1" would
// also find D1.10 to D1.16.
function toolSquare(page: Page, toolId: string) {
  return page
    .getByRole("listitem")
    .filter({ has: page.getByText(toolId, { exact: true }) })
}

function waiting(page: Page) {
  return page.getByRole("region", { name: "Change requests waiting" })
}

async function setUp() {
  const project = await makeProject(`Boiler ${tag()}`)
  const om = await makePerson()
  const pm = await makePerson()
  const reader = await makePerson()

  await giveRoles(om.id, project.id, ["OM"])
  await giveRoles(pm.id, project.id, ["PM"])
  await giveRoles(reader.id, project.id, ["CR"])

  const recordId = await addRecord(project.id, "D1.1", "locked")

  return { project, om, pm, reader, recordId }
}

async function open(page: Page, email: string, projectId: string) {
  await signIn(page, email)
  await page.goto(`/projects/${projectId}`)
}

test("the writer asks for a change on a locked record, and the record shows it", async ({
  page,
}) => {
  const { project, om } = await setUp()

  await open(page, om.email, project.id)

  const square = toolSquare(page, "D1.1")

  await square.getByRole("button", { name: "Request a change" }).click()
  await page.getByLabel("Reason for the change").fill(REASON)
  await page.getByRole("button", { name: "Send request" }).click()

  await expect(square.getByText("Change requested")).toBeVisible()
  await expect(
    square.getByRole("button", { name: "Request a change" })
  ).toHaveCount(0)
  await expect(square.getByText("Locked")).toBeVisible()
})

test("an empty reason shows the error and sends nothing", async ({ page }) => {
  const { project, om } = await setUp()
  const sent: string[] = []

  page.on("request", (request) => {
    if (request.headers()["next-action"]) {
      sent.push(request.url())
    }
  })

  await open(page, om.email, project.id)
  await toolSquare(page, "D1.1")
    .getByRole("button", { name: "Request a change" })
    .click()
  await page.getByLabel("Reason for the change").fill("   ")
  await page.getByRole("button", { name: "Send request" }).click()

  await expect(page.getByText("Enter a reason.")).toBeVisible()
  expect(sent).toEqual([])
})

test("the PM sees the request waiting, with the tool, the reason and who asked", async ({
  page,
}) => {
  const { project, om, pm, recordId } = await setUp()

  await makeChangeRequest(om.id, recordId, REASON)
  await open(page, pm.email, project.id)

  const row = waiting(page).getByRole("listitem")

  await expect(row).toHaveCount(1)
  await expect(row).toContainText("D1.1")
  await expect(row).toContainText("Client Email / Web Form")
  await expect(row).toContainText(REASON)
  await expect(row).toContainText(om.name)
})

test("the PM approves, and the record becomes editable", async ({ page }) => {
  const { project, om, pm, recordId } = await setUp()

  await makeChangeRequest(om.id, recordId, REASON)
  await open(page, pm.email, project.id)
  await waiting(page).getByRole("button", { name: "Approve" }).click()

  await expect(waiting(page)).toHaveCount(0)

  const square = toolSquare(page, "D1.1")

  await expect(square.getByText("Draft")).toBeVisible()
  await expect(square.getByText("Change approved")).toBeVisible()

  await page.reload()

  await expect(square.getByText("Draft")).toBeVisible()
})

test("the PM rejects with a reason, and the record stays locked", async ({
  page,
}) => {
  const { project, om, pm, recordId } = await setUp()

  await makeChangeRequest(om.id, recordId, REASON)
  await open(page, pm.email, project.id)
  await waiting(page).getByRole("button", { name: "Reject" }).click()
  await page.getByLabel("Reason for rejecting").fill(REJECTION)
  await page.getByRole("button", { name: "Reject request" }).click()

  await expect(waiting(page)).toHaveCount(0)

  const square = toolSquare(page, "D1.1")

  await expect(square.getByText("Locked")).toBeVisible()
  await expect(square.getByText("Change requested")).toHaveCount(0)
})

test("rejecting without a reason shows the error and sends nothing", async ({
  page,
}) => {
  const { project, om, pm, recordId } = await setUp()
  const sent: string[] = []

  await makeChangeRequest(om.id, recordId, REASON)
  await open(page, pm.email, project.id)

  page.on("request", (request) => {
    if (request.headers()["next-action"]) {
      sent.push(request.url())
    }
  })

  await waiting(page).getByRole("button", { name: "Reject" }).click()
  await page.getByRole("button", { name: "Reject request" }).click()

  await expect(page.getByText("Enter a reason for rejecting.")).toBeVisible()
  expect(sent).toEqual([])
})

test("a role that can only read has no request action", async ({ page }) => {
  const { project, reader } = await setUp()

  await open(page, reader.email, project.id)

  const square = toolSquare(page, "D1.1")

  await expect(square.getByText("Locked")).toBeVisible()
  await expect(
    square.getByRole("button", { name: "Request a change" })
  ).toHaveCount(0)
})

test("anyone but the PM sees no list of waiting requests", async ({ page }) => {
  const { project, om, recordId } = await setUp()

  await makeChangeRequest(om.id, recordId, REASON)
  await open(page, om.email, project.id)

  await expect(
    toolSquare(page, "D1.1").getByText("Change requested")
  ).toBeVisible()
  await expect(waiting(page)).toHaveCount(0)
})

test("at 375px the PM flow works and nothing scrolls sideways", async ({
  page,
}) => {
  const { project, om, pm, recordId } = await setUp()

  await makeChangeRequest(om.id, recordId, REASON)
  await page.setViewportSize({ width: 375, height: 812 })
  await open(page, pm.email, project.id)

  expect(await sidewaysScroll(page)).toBeLessThanOrEqual(0)
  await expect(waiting(page)).toContainText(REASON)
  await expect(
    waiting(page).getByRole("button", { name: "Approve" })
  ).toBeVisible()
  await expect(
    waiting(page).getByRole("button", { name: "Reject" })
  ).toBeVisible()

  await waiting(page).getByRole("button", { name: "Approve" }).click()

  await expect(waiting(page)).toHaveCount(0)
  await expect(toolSquare(page, "D1.1").getByText("Draft")).toBeVisible()
  expect(await sidewaysScroll(page)).toBeLessThanOrEqual(0)
})

test("at 375px the writer can open the request box and use it", async ({
  page,
}) => {
  const { project, om } = await setUp()

  await page.setViewportSize({ width: 375, height: 812 })
  await open(page, om.email, project.id)
  await toolSquare(page, "D1.1")
    .getByRole("button", { name: "Request a change" })
    .click()

  const box = page.getByLabel("Reason for the change")

  await expect(box).toBeVisible()
  await box.fill(REASON)
  await expect(page.getByRole("button", { name: "Send request" })).toBeVisible()
  expect(await sidewaysScroll(page)).toBeLessThanOrEqual(0)
})
