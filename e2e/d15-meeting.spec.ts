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

// A weekday at least a few days ahead, as "2026-11-17".
function ahead(days: number) {
  const day = new Date(Date.now() + days * 24 * 60 * 60 * 1000)

  return day.toISOString().slice(0, 10)
}

const slots = [
  { date: ahead(5), time: "11:00", timeZone: "Africa/Accra" },
  { date: ahead(5), time: "14:00", timeZone: "Africa/Accra" },
  { date: ahead(6), time: "10:00", timeZone: "Africa/Lagos" },
]

// A Tier 1 project with D1.1 to D1.4 locked and the acknowledgement
// delivered, so D1.5 is open, and its team. The web request's address is a
// reserved test domain, so no email leaves the machine.
async function setUp(payload?: JsonObject) {
  const project = await makeProject(`Boiler ${tag()}`)
  const om = await makePerson()
  const pm = await makePerson()
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

  if (payload) {
    await addRecord(project.id, "D1.5", "draft", { payload })
  }

  return { project, om, pm, client }
}

const sent = {
  slots,
  offeredSlots: slots,
  sentToClientAt: new Date().toISOString(),
  emailText: "Dear Kwaku Ampofo,\n\n- Option 1",
}

async function open(page: Page, email: string, projectId: string) {
  await signIn(page, email)
  // Buttons only answer once the page has loaded its scripts.
  await page.goto(`/projects/${projectId}/tools/D1.5`, {
    waitUntil: "networkidle",
  })
}

function statuses(page: Page) {
  return page
    .getByRole("table", { name: "Proposed meeting times" })
    .getByRole("cell")
    .filter({ hasText: /^(Status)?(Pending|Accepted|Declined)$/ })
}

test("the OM sends the proposed times, and the sheet shows them pending", async ({
  page,
}) => {
  const { project, om } = await setUp({ slots })

  await open(page, om.email, project.id)

  await expect(page.getByText("- Option 2:")).toBeVisible()
  await page.getByRole("button", { name: "Send to client" }).click()

  await expect(page.getByText("Sent.")).toBeVisible()
  await expect(statuses(page)).toHaveCount(3)
  await expect(statuses(page).first()).toContainText("Pending")
  await expect(
    page.getByRole("button", { name: "Confirm meeting" })
  ).toBeDisabled()
})

test("Send to client is off and says why until every time is complete", async ({
  page,
}) => {
  const { project, om } = await setUp({ slots: [{ timeZone: "Africa/Accra" }] })

  await open(page, om.email, project.id)

  await expect(
    page.getByRole("button", { name: "Send to client" })
  ).toBeDisabled()
  await expect(
    page.getByText("give slot 1 a date, a time and a time zone")
  ).toBeVisible()

  await page.getByRole("button", { name: "Add a time" }).click()
  await expect(
    page.getByRole("button", { name: "Remove slot 2" })
  ).toBeVisible()
  await page.getByRole("button", { name: "Remove slot 2" }).click()
  await expect(page.getByRole("button", { name: "Remove slot 2" })).toHaveCount(
    0
  )
})

test("the client chooses a time with a comment, and the OM sees it accepted", async ({
  browser,
}) => {
  // Two people sign in, one after the other.
  test.slow()

  const { project, om, client } = await setUp(sent)

  const clientPage = await browser.newPage()

  await open(clientPage, client.email, project.id)

  await expect(
    clientPage.getByText("Choose a time for your discovery meeting")
  ).toBeVisible()
  await clientPage.getByRole("radio", { name: "Option 2" }).click()
  await clientPage.getByLabel("Comment").fill("Our plant manager will join")
  await clientPage.getByRole("button", { name: "Choose this time" }).click()

  await expect(clientPage.getByText("Chosen.")).toBeVisible()
  await expect(clientPage.getByText("Your choice")).toBeVisible()

  const omPage = await browser.newPage()

  await open(omPage, om.email, project.id)

  await expect(statuses(omPage).nth(1)).toContainText("Accepted")
  await expect(statuses(omPage).first()).toContainText("Declined")
  await expect(omPage.getByText("Our plant manager will join")).toBeVisible()
})

test("the client proposes another time, and the OM can add it as a time", async ({
  browser,
}) => {
  // Two people sign in, one after the other.
  test.slow()

  const { project, om, client } = await setUp(sent)

  const clientPage = await browser.newPage()

  await open(clientPage, client.email, project.id)
  await clientPage
    .getByRole("button", { name: "None of these suit me" })
    .click()

  await expect(
    clientPage.getByRole("button", { name: "Propose this time" })
  ).toBeDisabled()

  await clientPage.getByRole("button", { name: "Date", exact: true }).click()
  await clientPage.getByRole("button", { name: /next month/i }).click()
  await clientPage.getByRole("gridcell", { name: "15" }).first().click()
  await clientPage.getByLabel("Time", { exact: true }).fill("15:30")
  await clientPage.getByRole("button", { name: "Propose this time" }).click()

  await expect(clientPage.getByText("Proposed.")).toBeVisible()

  const omPage = await browser.newPage()

  await open(omPage, om.email, project.id)

  await expect(omPage.getByText(/^The client proposed/)).toBeVisible()
  await omPage.getByRole("button", { name: "Add as a time" }).click()
  await expect(
    omPage.getByRole("button", { name: "Remove slot 4" })
  ).toBeVisible()
})

test("the OM confirms the meeting once chosen, and D1.5 locks", async ({
  page,
}) => {
  const { project, om } = await setUp({
    ...sent,
    chosenSlot: 2,
    agreedDate: slots[1]!.date,
    agreedTime: slots[1]!.time,
    agreedTimeZone: slots[1]!.timeZone,
    clientConfirmed: true,
  })

  await open(page, om.email, project.id)

  await expect(
    page.getByText("add the meeting link", { exact: false })
  ).toHaveCount(0)
  await page
    .getByRole("combobox", { name: "Meeting Platform/Location" })
    .click()
  await page.getByRole("option", { name: "Google Meet" }).click()

  await expect(
    page.getByText("add the meeting link (https://...)")
  ).toBeVisible()

  await page
    .getByLabel("Direct Meeting Link")
    .fill("https://meet.google.com/zpr-zhib-amp")
  await page.getByRole("button", { name: "Confirm meeting" }).click()

  await expect(page.getByText("Confirmed.")).toBeVisible()
  await expect(
    page.getByRole("link", { name: "Locked: Meeting Time Proposal" })
  ).toBeVisible()
})

test("the client sees the confirmed meeting with a link to join", async ({
  page,
}) => {
  const { project, client } = await setUp()

  await addRecord(project.id, "D1.5", "locked", {
    payload: {
      ...sent,
      chosenSlot: 1,
      agreedDate: slots[0]!.date,
      agreedTime: slots[0]!.time,
      agreedTimeZone: slots[0]!.timeZone,
      clientConfirmed: true,
      platform: "Google Meet",
      meetingLink: "https://meet.google.com/zpr-zhib-amp",
    },
  })

  await open(page, client.email, project.id)

  await expect(page.getByText("Your discovery meeting")).toBeVisible()
  await expect(
    page.getByRole("link", { name: "Join the meeting" })
  ).toHaveAttribute("href", "https://meet.google.com/zpr-zhib-amp")
})

test("before any times are sent the client sees there are none yet", async ({
  page,
}) => {
  const { project, client } = await setUp({ slots })

  await open(page, client.email, project.id)

  await expect(page.getByText("No times yet.")).toBeVisible()
})

test("the PM reads D1.5 with nothing to press", async ({ page }) => {
  const { project, pm } = await setUp(sent)

  await open(page, pm.email, project.id)

  await expect(statuses(page)).toHaveCount(3)
  await expect(
    page.getByRole("button", { name: "Send to client" })
  ).toHaveCount(0)
  await expect(
    page.getByRole("button", { name: "Confirm meeting" })
  ).toHaveCount(0)
  await expect(
    page.getByRole("button", { name: "Change the times" })
  ).toHaveCount(0)
})

test("at 375px the client can choose and nothing scrolls sideways", async ({
  page,
}) => {
  const { project, client } = await setUp(sent)

  await page.setViewportSize({ width: 375, height: 800 })
  await open(page, client.email, project.id)

  await page.getByRole("radio", { name: "Option 1" }).click()
  await page.getByRole("button", { name: "Choose this time" }).click()
  await expect(page.getByText("Chosen.")).toBeVisible()
  expect(await sidewaysScroll(page)).toBe(0)
})

test("at 375px the OM's sheet does not scroll sideways", async ({ page }) => {
  const { project, om } = await setUp({ slots })

  await page.setViewportSize({ width: 375, height: 800 })
  await open(page, om.email, project.id)

  await expect(
    page.getByRole("button", { name: "Send to client" })
  ).toBeVisible()
  expect(await sidewaysScroll(page)).toBe(0)
})
