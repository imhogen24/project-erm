import { expect, test, type Page } from "@playwright/test"

import type { JsonObject } from "@/db/schema"

import {
  addClientRequest,
  addRecord,
  giveRoles,
  makePerson,
  makeProject,
  signIn,
  tag,
} from "./support/data"
import { unreadApprovals } from "./support/notification-data"

// On D1.2 and D1.3 the OM writes and the PM approves. D1.3 opens once D1.1
// and D1.2 are locked.
async function setUp() {
  const project = await makeProject(`Withdraw ${tag()}`)
  const om = await makePerson()
  const pm = await makePerson()

  await giveRoles(om.id, project.id, ["OM"])
  await giveRoles(pm.id, project.id, ["PM"])

  return { project, om, pm }
}

async function openD13(projectId: string) {
  await addRecord(projectId, "D1.1", "locked")
  await addRecord(projectId, "D1.2", "locked")
}

// A D1.3 with every required answer in.
const complete: JsonObject = {
  coreObjectives: [
    { item: "Primary Purpose / Business Goal", description: "A new trailer" },
    { item: "Main Deliverables Requested", description: "Drawings" },
    { item: "Specific Constraints Noted" },
  ],
}

async function open(page: Page, email: string, path: string) {
  await signIn(page, email)
  await page.goto(path)
}

function button(page: Page, name: string) {
  return page.getByRole("button", { name, exact: true })
}

test("the OM submits D1.3, withdraws it, edits it and submits again; the PM sees only the new submission", async ({
  page,
  browser,
}) => {
  const { project, om, pm } = await setUp()
  const path = `/projects/${project.id}/tools/D1.3`

  await openD13(project.id)
  await addRecord(project.id, "D1.3", "draft", { payload: complete })
  await open(page, om.email, path)

  await button(page, "Submit for approval").click()

  await expect(page.getByText("Submitted", { exact: true })).toBeVisible()
  expect(await unreadApprovals(pm.id)).toBe(1)

  await button(page, "Withdraw").click()
  await expect(page.getByText("Take this back to fix it?")).toBeVisible()
  await button(page, "Yes, withdraw").click()

  await expect(page.getByText("Draft", { exact: true })).toBeVisible()
  await expect(button(page, "Withdraw")).toHaveCount(0)
  await expect(page.getByText("Iteration 1")).toBeVisible()
  await expect(page.getByText("Sent back for changes")).toHaveCount(0)
  expect(await unreadApprovals(pm.id)).toBe(0)

  // The PM has nothing to approve while the OM fixes it.
  const pmPage = await (await browser.newContext()).newPage()

  await open(pmPage, pm.email, path)
  await expect(pmPage.getByText("Draft", { exact: true })).toBeVisible()
  await expect(button(pmPage, "Approve")).toHaveCount(0)

  const description = page.getByRole("textbox", { name: /Description/ })

  await description.first().fill("A new trailer, 12 m long")
  await button(page, "Submit for approval").click()

  await expect(page.getByText("Submitted", { exact: true })).toBeVisible()
  expect(await unreadApprovals(pm.id)).toBe(1)

  await pmPage.reload()
  await expect(button(pmPage, "Approve")).toBeVisible()
  await expect(
    pmPage.getByRole("textbox", { name: /Description/ }).first()
  ).toHaveValue("A new trailer, 12 m long")
})

test("the PM does not see Withdraw on a D1.3 the OM submitted", async ({
  page,
}) => {
  const { project, om, pm } = await setUp()

  await openD13(project.id)
  await addRecord(project.id, "D1.3", "submitted", {
    payload: complete,
    submittedBy: om.id,
  })
  await open(page, pm.email, `/projects/${project.id}/tools/D1.3`)

  await expect(button(page, "Approve")).toBeVisible()
  await expect(button(page, "Withdraw")).toHaveCount(0)
})

test("another OM does not see Withdraw on a D1.3 they did not submit", async ({
  page,
}) => {
  const { project, om } = await setUp()
  const other = await makePerson()

  await giveRoles(other.id, project.id, ["OM"])
  await openD13(project.id)
  await addRecord(project.id, "D1.3", "submitted", {
    payload: complete,
    submittedBy: om.id,
  })
  await open(page, other.email, `/projects/${project.id}/tools/D1.3`)

  await expect(page.getByText("Submitted", { exact: true })).toBeVisible()
  await expect(button(page, "Withdraw")).toHaveCount(0)
})

test("once the PM approves, the OM sees Request a change in place of Withdraw", async ({
  page,
  browser,
}) => {
  const { project, om, pm } = await setUp()
  const path = `/projects/${project.id}/tools/D1.3`

  await openD13(project.id)
  await addRecord(project.id, "D1.3", "submitted", {
    payload: complete,
    submittedBy: om.id,
  })
  await open(page, om.email, path)

  await expect(button(page, "Withdraw")).toBeVisible()

  const pmPage = await (await browser.newContext()).newPage()

  await open(pmPage, pm.email, path)
  await button(pmPage, "Approve").click()
  await expect(pmPage.getByText("Locked", { exact: true })).toBeVisible()

  await page.reload()

  await expect(page.getByText("Locked", { exact: true })).toBeVisible()
  await expect(button(page, "Withdraw")).toHaveCount(0)

  await button(page, "Request a change").click()
  await page.getByLabel("Reason for the change").fill("The goal changed")
  await button(page, "Send request").click()

  await expect(
    page.getByText("Change requested", { exact: true })
  ).toBeVisible()
  await expect(button(page, "Request a change")).toHaveCount(0)

  // The PM decides it on the project page, as any change request.
  await pmPage.goto(`/projects/${project.id}`)
  await expect(pmPage.getByText("The goal changed")).toBeVisible()
})

test("the OM withdraws a submitted D1.2 on its own screen", async ({
  page,
}) => {
  const { project, om } = await setUp()

  await addRecord(project.id, "D1.1", "locked")
  await addClientRequest(project.id, { email: "client@example.com" })
  await addRecord(project.id, "D1.2", "submitted", {
    payload: {
      digitalRecords: [],
      triageChecklist: [],
      triageDecision: "Proceed to D1.3",
    },
    submittedBy: om.id,
  })
  await open(page, om.email, `/projects/${project.id}/tools/D1.2`)

  await expect(button(page, "Submit for approval")).toHaveCount(0)

  await button(page, "Withdraw").click()
  await button(page, "Yes, withdraw").click()

  await expect(page.getByText("Draft", { exact: true })).toBeVisible()
  await expect(button(page, "Submit for approval")).toBeVisible()
  await expect(button(page, "Withdraw")).toHaveCount(0)
})
