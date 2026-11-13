import { expect, test, type Page } from "@playwright/test"

import type { JsonObject } from "@/db/schema"

import {
  addRecord,
  giveRoles,
  makeClient,
  makePerson,
  makeProject,
  sidewaysScroll,
  signIn,
  tag,
} from "./support/data"

// Notes ready for the PM.
const complete = {
  actualDate: "2026-11-17",
  actualStartTime: "14:00",
  actualEndTime: "14:35",
  imhogenPresent: [{ name: "Kwabena Asante", present: true }],
  clientPresent: [{ name: "Kwaku Ampofo", present: true }],
  discussion: [
    {
      minutes: 5,
      topic: "Introductions",
      rawNotes: "They asked about the agenda.",
      remarks: "Their brief was detailed.",
    },
  ],
  primaryOutcome: "We will set a date to visit the site.",
  clientNextStep: "Confirm the proposed date.",
  imhogenNextStep: "Propose a site visit date.",
}

// A Tier 1 project with D1.1 to D1.6 locked, D1.6 holding two agenda topics
// and its invited attendees, so D1.7 is open, and its team.
async function setUp() {
  const project = await makeProject(`Boiler ${tag()}`)
  const om = await makePerson(`Kwabena ${tag()}`)
  const pm = await makePerson(`Ama ${tag()}`)
  const client = await makeClient()

  await giveRoles(om.id, project.id, ["OM"])
  await giveRoles(pm.id, project.id, ["PM"])
  await giveRoles(client.id, project.id, ["Client"])

  for (const toolId of ["D1.1", "D1.2", "D1.3", "D1.4", "D1.5"]) {
    await addRecord(
      project.id,
      toolId,
      "locked",
      toolId === "D1.4" ? { payload: { deliveryStatus: "Delivered" } } : {}
    )
  }

  await addRecord(project.id, "D1.6", "locked", {
    payload: {
      meetingDate: "2026-11-17",
      meetingTime: "14:00",
      imhogenAttendees: [{ personId: om.id, name: om.name, role: "OM" }],
      clientAttendees: "Kwaku Ampofo",
      agenda: [
        { minutes: 5, topic: "Introductions", leadSpeaker: "PM" },
        { minutes: 15, topic: "Technical requirements", leadSpeaker: "LE" },
      ],
    },
  })

  return { project, om, pm, client }
}

async function submitted(
  projectId: string,
  submittedBy: string,
  payload: JsonObject = complete
) {
  return addRecord(projectId, "D1.7", "submitted", { payload, submittedBy })
}

async function open(page: Page, email: string, projectId: string) {
  await signIn(page, email)

  // Buttons only answer once the page has loaded its scripts.
  await page.goto(`/projects/${projectId}/tools/D1.7`, {
    waitUntil: "networkidle",
  })
}

test("the OM starts from D1.6's agenda and attendees, fills the close-out and submits", async ({
  page,
}) => {
  const { project, om } = await setUp()

  await open(page, om.email, project.id)

  const discussion = page.getByRole("table", {
    name: "Live discussion capture (aligns with D1.6 agenda)",
  })

  await expect(
    discussion.getByLabel("Agenda Topic, row 1", { exact: true })
  ).toHaveValue("Introductions")
  await expect(
    discussion.getByLabel("Agenda Topic, row 2", { exact: true })
  ).toHaveValue("Technical requirements")
  await expect(
    page
      .getByRole("table", { name: "Attendees Present (IMHOGEN)" })
      .getByLabel("Name, row 1", { exact: true })
  ).toHaveValue(om.name)
  await expect(
    page
      .getByRole("table", { name: "Attendees Present (Client)" })
      .getByLabel("Name, row 1", { exact: true })
  ).toHaveValue("Kwaku Ampofo")

  await page.getByLabel("Actual End Time").fill("14:35")
  await discussion
    .getByLabel("Raw Notes / Direct Client Statements, row 1", { exact: true })
    .fill("They asked about the agenda.")
  await discussion
    .getByLabel("Raw Notes / Direct Client Statements, row 2", { exact: true })
    .fill("Steam demand is 2 t/h.")
  await page.getByLabel("Primary Outcome").fill("Set a site visit date.")
  await page.getByLabel("Client Next Step").fill("Confirm the date.")
  await page.getByLabel("IMHOGEN Next Step").fill("Propose a date.")
  await page.getByRole("button", { name: "Submit for approval" }).click()

  await expect(page.getByText("Submitted.")).toBeVisible()
})

test("the PM sends D1.7 back with a reason, and the OM sees it", async ({
  browser,
}) => {
  test.slow()

  const { project, om, pm } = await setUp()

  await submitted(project.id, om.id)

  const pmPage = await browser.newPage()

  await open(pmPage, pm.email, project.id)
  await pmPage.getByRole("button", { name: "Send back" }).click()
  await pmPage
    .getByLabel("What needs changing?")
    .fill("Add the client's budget remark.")
  await pmPage.getByRole("button", { name: "Send back to the writer" }).click()
  await expect(pmPage.getByText("Sent back to the writer.")).toBeVisible()
  await pmPage.close()

  const omPage = await browser.newPage()

  await open(omPage, om.email, project.id)
  await expect(omPage.getByText("Sent back for changes")).toBeVisible()
  await expect(
    omPage.getByText("Add the client's budget remark.")
  ).toBeVisible()
  await expect(
    omPage.getByRole("button", { name: "Submit for approval" })
  ).toBeVisible()
  await omPage.close()
})

test("the PM's approval locks D1.7", async ({ page }) => {
  const { project, om, pm } = await setUp()

  await submitted(project.id, om.id)
  await open(page, pm.email, project.id)
  await page.getByRole("button", { name: "Approve" }).click()

  await expect(page.getByText("Approved.")).toBeVisible()
  await expect(
    page.getByRole("link", { name: "Locked: Raw Meeting Notes" })
  ).toBeVisible()
})

test("the client reads D1.7 only once it is approved", async ({ browser }) => {
  const waiting = await setUp()

  await submitted(waiting.project.id, waiting.om.id)

  const before = await browser.newPage()

  await open(before, waiting.client.email, waiting.project.id)
  await expect(
    before.getByText("IMHOGEN shares this with you once it is approved.")
  ).toBeVisible()
  await expect(
    before.getByText("We will set a date to visit the site.")
  ).toHaveCount(0)
  await before.close()

  const approved = await setUp()

  await addRecord(approved.project.id, "D1.7", "locked", {
    payload: complete,
    submittedBy: approved.om.id,
  })

  const after = await browser.newPage()

  await open(after, approved.client.email, approved.project.id)
  await expect(
    after.getByText("We will set a date to visit the site.")
  ).toBeVisible()
  await after.close()
})

test("at 375px the OM's sheet does not scroll sideways", async ({ page }) => {
  const { project, om } = await setUp()

  await page.setViewportSize({ width: 375, height: 800 })
  await open(page, om.email, project.id)

  await expect(
    page.getByRole("button", { name: "Submit for approval" })
  ).toBeVisible()
  expect(await sidewaysScroll(page)).toBe(0)
})
