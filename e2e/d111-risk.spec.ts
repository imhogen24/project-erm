import { expect, test, type Page } from "@playwright/test"

import {
  addRecord,
  giveRoles,
  lockEarlierTools,
  makePerson,
  makeProject,
  sidewaysScroll,
  signIn,
  tag,
} from "./support/data"

// A Tier 1 project with D1.1 to D1.10 locked, D1.10 Partially Capable, so
// D1.11 is open, with its LE and PM.
async function setUp() {
  const project = await makeProject(`Boiler ${tag()}`)
  const le = await makePerson(`Kojo ${tag()}`)
  const pm = await makePerson(`Ama ${tag()}`)

  await giveRoles(le.id, project.id, ["LE"])
  await giveRoles(pm.id, project.id, ["PM"])
  await lockEarlierTools(project.id)
  await addRecord(project.id, "D1.8", "locked")
  await addRecord(project.id, "D1.9", "locked")
  await addRecord(project.id, "D1.10", "locked", {
    payload: { overallCapabilityStatus: "Partially Capable" },
  })

  return { project, le, pm }
}

async function open(page: Page, email: string, projectId: string) {
  await signIn(page, email)

  // Buttons only answer once the page has loaded its scripts.
  await page.goto(`/projects/${projectId}/tools/D1.11`, {
    waitUntil: "networkidle",
  })
}

async function choose(page: Page, label: string, option: string) {
  await page.getByLabel(label, { exact: true }).click()
  await page.getByRole("option", { name: option, exact: true }).click()
}

test("the LE records a risk, answers the questions, decides, signs and submits; the PM approves", async ({
  browser,
}) => {
  test.slow()

  const { project, le, pm } = await setUp()

  const lePage = await browser.newPage()

  await open(lePage, le.email, project.id)

  await expect(lePage.locator("output#overallCapabilityStatus")).toHaveText(
    "Partially Capable"
  )

  await lePage
    .getByLabel("Primary Review Objective")
    .fill("Assess the risks of the requested scope.")
  await lePage
    .getByLabel("Risk Category, row 1", { exact: true })
    .fill("Requested timeline")
  await lePage
    .getByLabel("Specific Risk Description, row 1", { exact: true })
    .fill("The scope may not fit the timeline.")
  await choose(lePage, "Probability (H/M/L), row 1", "H")
  await choose(lePage, "Impact (H/M/L), row 1", "H")
  await lePage
    .getByLabel("Proposed Mitigation Strategy, row 1", { exact: true })
    .fill("Phase the schedule.")

  for (const row of [1, 2, 3, 4]) {
    await choose(lePage, `Status (Yes/No/Partial), row ${row}`, "No")
    await lePage
      .getByLabel(`Remarks / Conditions, row ${row}`, { exact: true })
      .fill("Checked.")
  }

  await lePage.getByLabel("Overall Risk Profile").fill("High, manageable.")
  await lePage
    .getByRole("combobox", { name: /Project Go \/ No-Go Decision/ })
    .click()
  await lePage
    .getByRole("option", { name: "Conditional Go", exact: true })
    .click()

  await lePage.getByRole("button", { name: "Save draft" }).click()
  await expect(lePage.getByText("Draft saved.")).toBeVisible()
  await lePage.getByRole("button", { name: "Sign Assessor Signature" }).click()
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

test("at 375px the LE's sheet does not scroll sideways", async ({ page }) => {
  const { project, le } = await setUp()

  await page.setViewportSize({ width: 375, height: 800 })
  await open(page, le.email, project.id)

  await expect(
    page.getByRole("button", { name: "Submit for approval" })
  ).toBeVisible()
  expect(await sidewaysScroll(page)).toBe(0)
})
