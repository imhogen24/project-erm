import { expect, test, type Page } from "@playwright/test"

import {
  addClientRequest,
  addRecord,
  giveRoles,
  makePerson,
  makeProject,
  sidewaysScroll,
  signIn,
  tag,
} from "./support/data"

// D1.4, the client's acknowledgement email (RDP-150). The OM prepares it and
// it saves by itself; the PM sends it. Send itself is tested on the server
// with a fake email service (server/acknowledgement), since this dev server
// may hold a real Resend key: these tests never press it.

const WEB_REQUEST = {
  contact_person: "Kwaku Ampofo",
  email: "kwaku.ampofo@example.com",
  project_title: "Packaged boiler skid",
  created_at: "2026-10-31T09:14:00Z",
}

async function setUp() {
  const project = await makeProject(`Boiler ${tag()}`)
  const om = await makePerson(`Kwabena ${tag()}`)
  const pm = await makePerson(`Ama ${tag()}`)
  const client = await makePerson(`Kwaku ${tag()}`)

  await giveRoles(om.id, project.id, ["OM"])
  await giveRoles(pm.id, project.id, ["PM"])
  await giveRoles(client.id, project.id, ["Client"])
  await addClientRequest(project.id, WEB_REQUEST)

  for (const toolId of ["D1.1", "D1.2", "D1.3"]) {
    await addRecord(project.id, toolId, "locked")
  }

  return { project, om, pm, client }
}

// Waits for the page to settle, so typing goes to the live form and not to
// the text the server drew before the form took over.
async function open(page: Page, email: string, projectId: string) {
  await signIn(page, email)
  await page.goto(`/projects/${projectId}/tools/D1.4`)
  await page.waitForLoadState("networkidle")
}

const body = (page: Page) =>
  page.getByRole("textbox", { name: "Standard Email Template" })

test("the OM sees the email filled in from the web request, and no buttons", async ({
  page,
}) => {
  const { project, om } = await setUp()

  await open(page, om.email, project.id)

  await expect(page.getByRole("textbox", { name: "Subject Line" })).toHaveValue(
    "Acknowledgement of Packaged boiler skid request"
  )
  await expect(body(page)).toHaveValue(/^Dear Kwaku Ampofo,/)
  await expect(body(page)).toHaveValue(/tracking reference: T1-/)
  await expect(page.getByText("kwaku.ampofo@example.com")).toBeVisible()

  for (const name of ["Save draft", "Submit for approval", "Send"]) {
    await expect(page.getByRole("button", { name })).toHaveCount(0)
  }
})

test("the OM's edits save by themselves, and stay after a reload", async ({
  page,
}) => {
  const { project, om } = await setUp()

  await open(page, om.email, project.id)
  await body(page).fill("Dear Kwaku,\n\nThank you for your request.")

  await expect(
    page.getByRole("status").filter({ hasText: "Saved" })
  ).toBeVisible()

  await page.reload()

  await expect(body(page)).toHaveValue(
    "Dear Kwaku,\n\nThank you for your request."
  )
})

test("the PM sees Send once the OM has written the email", async ({ page }) => {
  const { project, pm } = await setUp()

  await addRecord(project.id, "D1.4", "draft", {
    payload: { subject: "Acknowledgement", body: "Dear Kwaku," },
  })
  await open(page, pm.email, project.id)

  await expect(page.getByRole("button", { name: "Send" })).toBeEnabled()
  await expect(body(page)).toBeDisabled()
})

test("Send is off and says what is missing", async ({ page }) => {
  const { project, pm } = await setUp()

  await open(page, pm.email, project.id)

  await expect(page.getByRole("button", { name: "Send" })).toBeDisabled()
  await expect(
    page.getByText(/the Onboarding Manager has not started the email yet/)
  ).toBeVisible()

  await addRecord(project.id, "D1.4", "draft", {
    payload: { subject: "Acknowledgement" },
  })
  await page.reload()

  await expect(page.getByRole("button", { name: "Send" })).toBeDisabled()
  await expect(page.getByText(/add the email text/)).toBeVisible()
})

test("the client reads D1.4 with no buttons", async ({ page }) => {
  const { project, client } = await setUp()

  await addRecord(project.id, "D1.4", "draft", {
    payload: { subject: "Acknowledgement", body: "Dear Kwaku," },
  })
  await open(page, client.email, project.id)

  await expect(body(page)).toBeDisabled()

  for (const name of ["Save draft", "Submit for approval", "Send"]) {
    await expect(page.getByRole("button", { name })).toHaveCount(0)
  }
})

test("at 375px nothing scrolls sideways and the email can be edited", async ({
  page,
}) => {
  const { project, om } = await setUp()

  await page.setViewportSize({ width: 375, height: 812 })
  await open(page, om.email, project.id)

  expect(await sidewaysScroll(page)).toBeLessThanOrEqual(0)

  await body(page).fill("Dear Kwaku,")

  await expect(
    page.getByRole("status").filter({ hasText: "Saved" })
  ).toBeVisible()
  expect(await sidewaysScroll(page)).toBeLessThanOrEqual(0)
})
