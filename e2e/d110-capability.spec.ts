import { expect, test, type Page } from "@playwright/test"

import {
  addClientRequest,
  addRecord,
  giveRoles,
  lockEarlierTools,
  makePerson,
  makeProject,
  sidewaysScroll,
  signIn,
  tag,
} from "./support/data"

// A Tier 1 project with D1.1 to D1.9 locked, so D1.10 is open, with its LE and
// PM and the client's request.
async function setUp() {
  const project = await makeProject(`Boiler ${tag()}`)
  const le = await makePerson(`Kojo ${tag()}`)
  const pm = await makePerson(`Ama ${tag()}`)

  await giveRoles(le.id, project.id, ["LE"])
  await giveRoles(pm.id, project.id, ["PM"])
  await addClientRequest(project.id, {
    contact_person: "Kwaku Ampofo",
    email: `${tag()}@example.com`,
    organization_name: "Tema Foods Ltd",
    project_title: "Packaged boiler skid",
  })
  await lockEarlierTools(project.id)
  await addRecord(project.id, "D1.8", "locked")
  await addRecord(project.id, "D1.9", "locked")

  return { project, le, pm }
}

async function open(page: Page, email: string, projectId: string) {
  await signIn(page, email)

  // Buttons only answer once the page has loaded its scripts.
  await page.goto(`/projects/${projectId}/tools/D1.10`, {
    waitUntil: "networkidle",
  })
}

async function answer(page: Page, table: string, rows: number) {
  const box = page.getByRole("table", { name: table })

  for (let row = 1; row <= rows; row++) {
    await box
      .getByLabel(`Status (Yes/No/Partial), row ${row}`, { exact: true })
      .click()
    await page.getByRole("option", { name: "Yes", exact: true }).click()
    await box
      .getByLabel(`Justification / Identified Gaps, row ${row}`, {
        exact: true,
      })
      .fill("Checked against the team.")
  }
}

test("the LE assesses every criterion, signs and submits; the PM approves", async ({
  browser,
}) => {
  test.slow()

  const { project, le, pm } = await setUp()

  const lePage = await browser.newPage()

  await open(lePage, le.email, project.id)

  await expect(lePage.locator("output#assessor")).toHaveText(le.name)
  await expect(lePage.locator("output#clientName")).toHaveText("Tema Foods Ltd")

  await answer(lePage, "Technical capability (engineering & manufacturing)", 4)
  await lePage
    .getByRole("table", { name: "Additional technical capacity assessment" })
    .getByRole("button", { name: "Remove row 1" })
    .click()
  await answer(lePage, "Commercial alignment", 5)
  await lePage.getByLabel("Overall Capability Status").click()
  await lePage.getByRole("option", { name: "Partially Capable" }).click()

  await lePage.getByRole("button", { name: "Save draft" }).click()
  await expect(lePage.getByText("Draft saved.")).toBeVisible()
  await lePage.getByRole("button", { name: "Sign Assessor Signature" }).click()
  await expect(lePage.getByText(`Signed by ${le.name} on`)).toBeVisible()
  await expect(lePage.locator("output#assessmentDate")).not.toHaveText(
    "Filled in when signed"
  )
  await lePage.getByRole("button", { name: "Submit for approval" }).click()
  await expect(lePage.getByText("Submitted.")).toBeVisible()
  await lePage.close()

  const pmPage = await browser.newPage()

  await open(pmPage, pm.email, project.id)
  await pmPage.getByRole("button", { name: "Approve" }).click()
  await expect(pmPage.getByText("Approved.")).toBeVisible()
  await pmPage.close()
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
