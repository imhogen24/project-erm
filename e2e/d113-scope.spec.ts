import { expect, test, type Browser, type Page } from "@playwright/test"

import {
  addClientRequest,
  addRecord,
  giveRoles,
  lockEarlierTools,
  makeClient,
  makePerson,
  makeProject,
  sidewaysScroll,
  signIn,
  tag,
} from "./support/data"

// A week ahead, as "2026-11-19".
function ahead(days: number) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10)
}

const slot = { date: ahead(7), time: "10:00", timeZone: "Africa/Accra" }

// A Tier 1 project with D1.1 to D1.12 locked, and a D1.13 draft holding the
// scope, one meeting time, the platform and the link, with its LE, PM and
// client. The client's address is a reserved test domain, so no email leaves
// the machine.
async function setUp() {
  const project = await makeProject(`Boiler ${tag()}`)
  const le = await makePerson(`Kojo ${tag()}`)
  const pm = await makePerson(`Ama ${tag()}`)
  const client = await makeClient()

  await giveRoles(le.id, project.id, ["LE"])
  await giveRoles(pm.id, project.id, ["PM"])
  await giveRoles(client.id, project.id, ["Client"])
  await addClientRequest(project.id, {
    contact_person: "Kwaku Ampofo",
    email: `${tag()}@example.com`,
    project_title: "Packaged boiler skid",
  })
  await lockEarlierTools(project.id)

  for (const toolId of ["D1.8", "D1.9", "D1.12"]) {
    await addRecord(project.id, toolId, "locked")
  }

  await addRecord(project.id, "D1.10", "locked", {
    payload: { overallCapabilityStatus: "Capable" },
  })
  await addRecord(project.id, "D1.11", "locked", {
    payload: { goNoGoDecision: "Go" },
  })
  await addRecord(project.id, "D1.13", "draft", {
    payload: {
      vision: "Document the trailer.",
      includedScope: [{ category: "CAD", description: "A 3D model." }],
      phases: [{ name: "Review", activities: "Review.", duration: "1 week" }],
      slots: [slot],
      platform: "Google Meet",
      meetingLink: "https://meet.google.com/abc-defg-hij",
    },
  })

  return { project, le, pm, client }
}

async function open(browser: Browser, email: string, projectId: string) {
  const page = await browser.newPage()

  await signIn(page, email)

  // Buttons only answer once the page has loaded its scripts.
  await page.goto(`/projects/${projectId}/tools/D1.13`, {
    waitUntil: "networkidle",
  })

  return page
}

test("the LE books the alignment meeting, the client chooses, the invite goes, and the PM approves the scope", async ({
  browser,
}) => {
  test.slow()

  const { project, le, pm, client } = await setUp()

  let lePage: Page = await open(browser, le.email, project.id)
  const invite = lePage.getByRole("button", { name: "Send calendar invite" })

  await expect(invite).toBeDisabled()
  await lePage.getByRole("button", { name: "Send times to client" }).click()
  await expect(lePage.getByText("Times sent.")).toBeVisible()
  await lePage.close()

  const clientPage = await open(browser, client.email, project.id)

  await expect(
    clientPage.getByText(
      "Choose a time for your feasibility & engineering alignment meeting"
    )
  ).toBeVisible()
  await clientPage.getByRole("radio", { name: "Option 1" }).click()
  await clientPage.getByRole("button", { name: "Choose this time" }).click()
  await expect(
    clientPage.getByText("Your feasibility & engineering alignment meeting")
  ).toBeVisible()
  await clientPage.close()

  lePage = await open(browser, le.email, project.id)
  await lePage.getByRole("button", { name: "Send calendar invite" }).click()
  await expect(lePage.getByText("Invite sent.")).toBeVisible()
  await lePage
    .getByRole("button", { name: "Sign PM / Lead Engineer Signature" })
    .click()
  await expect(lePage.getByText(`Signed by ${le.name} on`)).toBeVisible()
  await lePage.getByRole("button", { name: "Submit for approval" }).click()
  await expect(lePage.getByText("Submitted.")).toBeVisible()
  await lePage.close()

  const pmPage = await open(browser, pm.email, project.id)

  await pmPage.getByRole("button", { name: "Approve" }).click()
  await expect(pmPage.getByText("Approved.")).toBeVisible()
  await expect(pmPage.locator("output#scopeLocked")).toHaveText("Yes")
  await pmPage.close()
})

test("submitting before the invite is sent says so", async ({ browser }) => {
  const { project, le } = await setUp()

  const page = await open(browser, le.email, project.id)

  await page.getByRole("button", { name: "Submit for approval" }).click()
  await expect(
    page.getByText("Send the meeting's calendar invite first")
  ).toBeVisible()
  await page.close()
})

test("at 375px the LE's sheet does not scroll sideways", async ({ page }) => {
  const { project, le } = await setUp()

  await page.setViewportSize({ width: 375, height: 800 })
  await signIn(page, le.email)
  await page.goto(`/projects/${project.id}/tools/D1.13`, {
    waitUntil: "networkidle",
  })

  await expect(
    page.getByRole("button", { name: "Send times to client" })
  ).toBeVisible()
  expect(await sidewaysScroll(page)).toBe(0)
})
