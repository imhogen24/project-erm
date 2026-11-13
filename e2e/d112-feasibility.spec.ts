import { expect, test, type Page } from "@playwright/test"

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

// A Tier 1 project with D1.1 to D1.11 locked, D1.11 a Conditional Go with
// one risk, so D1.12 is open, with its LE, PM and client.
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
    target_timeline: "2 weeks",
  })
  await lockEarlierTools(project.id)

  for (const toolId of ["D1.8", "D1.9"]) {
    await addRecord(project.id, toolId, "locked")
  }

  await addRecord(project.id, "D1.10", "locked", {
    payload: { overallCapabilityStatus: "Partially Capable" },
  })
  await addRecord(project.id, "D1.11", "locked", {
    payload: {
      goNoGoDecision: "Conditional Go",
      risks: [
        {
          category: "Timeline",
          description: "Two weeks is too short.",
          impact: "H",
          mitigation: "Phase the schedule.",
        },
      ],
    },
  })

  return { project, le, pm, client }
}

async function open(page: Page, email: string, projectId: string) {
  await signIn(page, email)

  // Buttons only answer once the page has loaded its scripts.
  await page.goto(`/projects/${projectId}/tools/D1.12`, {
    waitUntil: "networkidle",
  })
}

test("the LE starts from D1.11's risks, assesses each domain, signs and submits; the PM approves", async ({
  browser,
}) => {
  test.slow()

  const { project, le, pm } = await setUp()

  const lePage = await browser.newPage()

  await open(lePage, le.email, project.id)

  await expect(lePage.locator("output#clientTimeline")).toHaveText("2 weeks")
  await expect(
    lePage.getByLabel("Primary Risk Identified, row 1", { exact: true })
  ).toHaveValue("Timeline: Two weeks is too short.")

  const domains = lePage.getByRole("table", {
    name: "Technical capability (engineering & manufacturing)",
  })

  for (const row of [1, 2, 3, 4]) {
    await domains
      .getByLabel(`Status (Capable/Partial), row ${row}`, { exact: true })
      .click()
    await lePage.getByRole("option", { name: "Partial", exact: true }).click()
    await domains
      .getByLabel(`Key Findings / Gaps to Bridge, row ${row}`, { exact: true })
      .fill("Checked.")
  }

  await lePage.getByLabel("IMHOGEN Realistic Timeline").fill("8 weeks")
  await lePage.getByLabel("IMHOGEN Estimated Cost Floor (GHS)").fill("80000")
  await lePage
    .getByLabel("Commercial Alignment Notes")
    .fill("About 8 weeks for the full scope.")
  await lePage
    .getByRole("textbox", { name: /^Recommendation/ })
    .fill("Feasible with a revised scope.")

  await lePage.getByRole("button", { name: "Save draft" }).click()
  await expect(lePage.getByText("Draft saved.")).toBeVisible()
  await lePage
    .getByRole("button", { name: "Sign Head of R&D Signature" })
    .click()
  await expect(lePage.getByText(`Signed by ${le.name} on`)).toBeVisible()
  await lePage.getByRole("button", { name: "Submit for approval" }).click()
  await expect(lePage.getByText("Submitted.")).toBeVisible()
  await lePage.close()

  const pmPage = await browser.newPage()

  await open(pmPage, pm.email, project.id)
  await pmPage.getByRole("button", { name: "Approve" }).click()
  await expect(pmPage.getByText("Approved.")).toBeVisible()
  await pmPage.close()
})

test("the client is told the report comes once approved", async ({ page }) => {
  const { project, le, client } = await setUp()

  await addRecord(project.id, "D1.12", "submitted", {
    payload: { recommendation: "Feasible." },
    submittedBy: le.id,
  })
  await open(page, client.email, project.id)

  await expect(
    page.getByText("IMHOGEN shares this with you once it is approved.")
  ).toBeVisible()
})

test("at 375px the LE's sheet does not scroll sideways", async ({ page }) => {
  const { project, le } = await setUp()

  await page.setViewportSize({ width: 375, height: 800 })
  await open(page, le.email, project.id)

  await expect(
    page.getByRole("button", { name: "Submit for approval" })
  ).toBeVisible()
  expect(await sidewaysScroll(page)).toBe(0)
})
