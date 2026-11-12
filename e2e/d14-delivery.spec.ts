import { expect, test, type Page } from "@playwright/test"

import {
  addAcknowledgementEmail,
  addClientRequest,
  addRecord,
  giveRoles,
  makePerson,
  makeProject,
  sidewaysScroll,
  signIn,
  tag,
} from "./support/data"

// D1.4 delivery tracking (RDP-151): the badges, and the box the PM fixes a
// bounced address in. The job and Retry are tested on the server with a fake
// email service (server/acknowledgement/delivery.test.ts), since this dev
// server may hold a real Resend key: these tests never press Retry.

const CLIENT_EMAIL = "kwaku.ampofo@example.com"

const bounceForPm = "This email bounced. Correct the address and try again."

const bounceForOthers = "This email bounced. The Project Manager has been told."

async function setUp(deliveryStatus: string) {
  const project = await makeProject(`Boiler ${tag()}`)
  const om = await makePerson(`Kwabena ${tag()}`)
  const pm = await makePerson(`Ama ${tag()}`)

  await giveRoles(om.id, project.id, ["OM"])
  await giveRoles(pm.id, project.id, ["PM"])
  await addClientRequest(project.id, {
    contact_person: "Kwaku Ampofo",
    email: CLIENT_EMAIL,
    project_title: "Packaged boiler skid",
  })

  for (const toolId of ["D1.1", "D1.2", "D1.3"]) {
    await addRecord(project.id, toolId, "locked")
  }

  const recordId = await addRecord(project.id, "D1.4", "locked", {
    payload: {
      sentTo: CLIENT_EMAIL,
      subject: "Acknowledgement of Packaged boiler skid request",
      body: "Dear Kwaku Ampofo,",
      dateSent: "2026-11-10",
      timeSent: "09:30",
      deliveryStatus,
    },
  })

  await addAcknowledgementEmail(
    project.id,
    recordId,
    CLIENT_EMAIL,
    deliveryStatus === "Delivered"
      ? "delivered"
      : deliveryStatus === "Bounced"
        ? "bounced"
        : "sent"
  )

  return { project, om, pm }
}

// A tool's tile on the overview, not its line in the sidebar's tree.
const tile = (page: Page, name: string) =>
  page.getByRole("main").getByRole("listitem").filter({ hasText: name })

const retry = (page: Page) => page.getByRole("button", { name: "Retry" })

async function openOverview(page: Page, email: string, projectId: string) {
  await signIn(page, email)
  await page.goto(`/projects/${projectId}`)
}

async function openD14(page: Page, email: string, projectId: string) {
  await signIn(page, email)
  await page.goto(`/projects/${projectId}/tools/D1.4`)
  await page.waitForLoadState("networkidle")
}

for (const status of ["Sent", "Delivered", "Bounced"]) {
  test(`the D1.4 tile shows ${status}`, async ({ page }) => {
    const { project, pm } = await setUp(status)

    await openOverview(page, pm.email, project.id)

    // The chip reads "Email Sent" to a screen reader.
    await expect(
      tile(page, "Acknowledgement Email").getByText(`Email ${status}`, {
        exact: true,
      })
    ).toBeVisible()
  })
}

test("D1.5 stays closed while the email is only Sent, and says why", async ({
  page,
}) => {
  const { project, pm } = await setUp("Sent")

  await openOverview(page, pm.email, project.id)

  await expect(
    tile(page, "Meeting Time Proposal").getByText(
      "This tool opens after D1.4 is delivered."
    )
  ).toBeVisible()
  await expect(
    tile(page, "Meeting Time Proposal").getByRole("link")
  ).toHaveCount(0)
})

test("D1.5 opens once the email is Delivered", async ({ page }) => {
  const { project, pm } = await setUp("Delivered")

  await openOverview(page, pm.email, project.id)

  await expect(
    tile(page, "Meeting Time Proposal").getByRole("link")
  ).toBeVisible()
})

test("after a bounce the PM sees the badge, the box and Retry", async ({
  page,
}) => {
  const { project, pm } = await setUp("Bounced")

  await openD14(page, pm.email, project.id)

  await expect(page.getByText(bounceForPm)).toBeVisible()
  await expect(
    page.getByRole("textbox", { name: /Sent To/ }).first()
  ).toHaveValue(CLIENT_EMAIL)
  await expect(retry(page)).toBeEnabled()
  await expect(page.getByText("Email Bounced", { exact: true })).toBeVisible()
})

test("after a bounce the OM sees the message and no Retry", async ({
  page,
}) => {
  const { project, om } = await setUp("Bounced")

  await openD14(page, om.email, project.id)

  await expect(page.getByText(bounceForOthers)).toBeVisible()
  await expect(page.getByText(bounceForPm)).toHaveCount(0)
  await expect(retry(page)).toHaveCount(0)
})

for (const status of ["Sent", "Delivered"]) {
  test(`the PM has no Retry while the email is ${status}`, async ({ page }) => {
    const { project, pm } = await setUp(status)

    await openD14(page, pm.email, project.id)

    await expect(
      page.getByText(`Email ${status}`, { exact: true })
    ).toBeVisible()
    await expect(retry(page)).toHaveCount(0)
    await expect(page.getByText(bounceForPm)).toHaveCount(0)
  })
}

test("at 375px nothing scrolls sideways and Retry can be reached", async ({
  page,
}) => {
  const { project, pm } = await setUp("Bounced")

  await page.setViewportSize({ width: 375, height: 812 })
  await openOverview(page, pm.email, project.id)

  expect(await sidewaysScroll(page)).toBeLessThanOrEqual(0)

  await page.goto(`/projects/${project.id}/tools/D1.4`)
  await page.waitForLoadState("networkidle")

  expect(await sidewaysScroll(page)).toBeLessThanOrEqual(0)

  const sentTo = page.getByRole("textbox", { name: /Sent To/ }).first()

  await sentTo.fill("kwaku@example.com")
  await expect(sentTo).toHaveValue("kwaku@example.com")
  await retry(page).scrollIntoViewIfNeeded()
  await expect(retry(page)).toBeInViewport()
  expect(await sidewaysScroll(page)).toBeLessThanOrEqual(0)
})
