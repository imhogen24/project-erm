import { expect, test, type Page } from "@playwright/test"

import type { JsonObject } from "@/db/schema"

import {
  addClientRequest,
  addRecord,
  giveRoles,
  makeClient,
  makePerson,
  makeProject,
  sidewaysScroll,
  signIn,
  tag,
} from "./support/data"

// A weekday a week ahead, as "2026-11-19".
function ahead(days: number) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10)
}

const meetingDay = ahead(7)

// A Tier 1 project with D1.1 to D1.5 locked, D1.5 confirmed for a week ahead
// on Google Meet, so D1.6 is open, and its team. The web request's address is
// a reserved test domain, so no email leaves the machine.
async function setUp(payload?: JsonObject) {
  const project = await makeProject(`Boiler ${tag()}`)
  const om = await makePerson(`Kwabena ${tag()}`)
  const pm = await makePerson(`Ama ${tag()}`)
  const client = await makeClient()

  await giveRoles(om.id, project.id, ["OM"])
  await giveRoles(pm.id, project.id, ["PM"])
  await giveRoles(client.id, project.id, ["Client"])
  await addClientRequest(project.id, {
    contact_person: "Kwaku Ampofo",
    email: `${tag()}@example.com`,
    project_title: "Packaged boiler skid",
  })

  for (const toolId of ["D1.1", "D1.2", "D1.3", "D1.4"]) {
    await addRecord(
      project.id,
      toolId,
      "locked",
      toolId === "D1.4" ? { payload: { deliveryStatus: "Delivered" } } : {}
    )
  }

  await addRecord(project.id, "D1.5", "locked", {
    payload: {
      chosenSlot: 1,
      agreedDate: meetingDay,
      agreedTime: "14:00",
      agreedTimeZone: "Africa/Accra",
      clientConfirmed: true,
      platform: "Google Meet",
      meetingLink: "https://meet.google.com/zpr-zhib-amp",
    },
  })

  if (payload) {
    await addRecord(project.id, "D1.6", "draft", { payload })
  }

  return { project, om, pm, client }
}

async function open(page: Page, email: string, projectId: string) {
  await signIn(page, email)

  // Buttons only answer once the page has loaded its scripts.
  await page.goto(`/projects/${projectId}/tools/D1.6`, {
    waitUntil: "networkidle",
  })
}

test("the OM sees the meeting from D1.5 and the sheet's agenda, and sends the invite", async ({
  page,
}) => {
  const { project, om } = await setUp()

  await open(page, om.email, project.id)

  await expect(page.getByText("14:00 GMT")).toBeVisible()
  await expect(
    page.getByRole("link", { name: "https://meet.google.com/zpr-zhib-amp" })
  ).toBeVisible()
  await expect(page.getByText("Kwaku Ampofo")).toBeVisible()
  await expect(page.getByLabel("Topic 1", { exact: true })).toHaveValue(
    "Introductions & Project Overview"
  )
  await expect(page.getByLabel("Topic 5", { exact: true })).toHaveValue(
    "Next Steps & Q&A"
  )

  const send = page.getByRole("button", { name: "Send calendar invite" })

  await expect(send).toBeDisabled()
  await expect(page.getByText("choose who attends from IMHOGEN")).toBeVisible()

  await page.getByRole("checkbox", { name: om.name }).click()
  await expect(page.getByText("✓ Saved")).toBeVisible()
  await send.click()

  await expect(page.getByText("Invite sent.")).toBeVisible()
  await expect(page.getByText(/^Invite sent \d/)).toBeVisible()
})

test("Ready for the meeting locks D1.6 once the invite is sent and every check is done", async ({
  page,
}) => {
  test.slow()

  const { project, om } = await setUp()

  await open(page, om.email, project.id)

  const ready = page.getByRole("button", { name: "Ready for the meeting" })

  await expect(ready).toBeDisabled()

  await page.getByRole("checkbox", { name: om.name }).click()
  await page.getByRole("button", { name: "Send calendar invite" }).click()
  await expect(page.getByText("Invite sent.")).toBeVisible()

  for (const group of await page
    .getByRole("radiogroup", { name: /^Status:/ })
    .all()) {
    await group.getByRole("radio", { name: "Done", exact: true }).click()
  }

  await expect(ready).toBeEnabled()
  await ready.click()

  await expect(page.getByText("Ready.")).toBeVisible()
  await expect(
    page.getByRole("link", { name: "Locked: Calendar Invite & Agenda" })
  ).toBeVisible()
})

test("the OM adds and removes agenda topics", async ({ page }) => {
  const { project, om } = await setUp()

  await open(page, om.email, project.id)

  await page.getByRole("button", { name: "Add a topic" }).click()
  await page.getByLabel("Topic 6", { exact: true }).fill("Site visit")
  await expect(page.getByText("✓ Saved")).toBeVisible()

  await page.getByRole("button", { name: "Remove topic 6" }).click()
  await expect(page.getByLabel("Topic 6", { exact: true })).toHaveCount(0)
})

test("the PM and the client read D1.6 with nothing to press", async ({
  browser,
}) => {
  const { project, pm, client } = await setUp({
    agenda: [{ minutes: 30, topic: "Boiler sizing", leadSpeaker: "LE" }],
  })

  for (const reader of [pm, client]) {
    const page = await browser.newPage()

    await open(page, reader.email, project.id)

    await expect(page.getByText("Boiler sizing")).toBeVisible()
    await expect(
      page.getByRole("button", { name: "Send calendar invite" })
    ).toHaveCount(0)
    await expect(
      page.getByRole("button", { name: "Ready for the meeting" })
    ).toHaveCount(0)
    await page.close()
  }
})

test("at 375px the OM's sheet does not scroll sideways", async ({ page }) => {
  const { project, om } = await setUp()

  await page.setViewportSize({ width: 375, height: 800 })
  await open(page, om.email, project.id)

  await expect(
    page.getByRole("button", { name: "Send calendar invite" })
  ).toBeVisible()
  expect(await sidewaysScroll(page)).toBe(0)
})
