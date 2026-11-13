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

// A Tier 1 project with D1.1 to D1.8 locked, so D1.9 is open, with its OM, HE
// and PM and the client's request.
async function setUp() {
  const project = await makeProject(`Boiler ${tag()}`)
  const om = await makePerson(`Kwabena ${tag()}`)
  const he = await makePerson(`Kwesi ${tag()}`)
  const pm = await makePerson(`Ama ${tag()}`)

  await giveRoles(om.id, project.id, ["OM"])
  await giveRoles(he.id, project.id, ["HE"])
  await giveRoles(pm.id, project.id, ["PM"])
  await addClientRequest(project.id, {
    contact_person: "Kwaku Ampofo",
    email: `${tag()}@example.com`,
    organization_name: "Tema Foods Ltd",
    project_title: "Packaged boiler skid",
    target_timeline: "12 weeks",
  })

  for (const toolId of [
    "D1.1",
    "D1.2",
    "D1.3",
    "D1.5",
    "D1.6",
    "D1.7",
    "D1.8",
  ]) {
    await addRecord(project.id, toolId, "locked")
  }

  await addRecord(project.id, "D1.4", "locked", {
    payload: { deliveryStatus: "Delivered" },
  })

  return { project, om, he, pm }
}

async function open(page: Page, email: string, projectId: string) {
  await signIn(page, email)

  // Buttons only answer once the page has loaded its scripts.
  await page.goto(`/projects/${projectId}/tools/D1.9`, {
    waitUntil: "networkidle",
  })
}

test("the OM sees what the system filled, fills every review and submits; the HE approves", async ({
  browser,
}) => {
  test.slow()

  const { project, om, he, pm } = await setUp()

  const omPage = await browser.newPage()

  await open(omPage, om.email, project.id)

  await expect(omPage.locator("output#requestedBy")).toHaveText(pm.name)
  await expect(omPage.locator("output#clientName")).toHaveText("Tema Foods Ltd")
  await expect(omPage.locator("output#requiredCompletion")).toHaveText(
    "12 weeks"
  )
  await expect(omPage.getByText("D1.8 Needs Assessment Notes")).toBeVisible()

  await omPage
    .getByLabel("Primary Review Objective")
    .fill("Check the request is realistic.")
  await omPage.getByLabel("Priority Level").click()
  await omPage.getByRole("option", { name: "High" }).click()

  await expect(
    omPage.getByLabel("Assigned Reviewer, row 1", { exact: true })
  ).toHaveValue("")

  for (const row of [1, 2, 3, 4]) {
    await omPage
      .getByLabel(`Assigned Reviewer, row ${row}`, { exact: true })
      .fill("Kwesi Appiah")
    await omPage
      .getByLabel(`Specific Focus / Question for Reviewer, row ${row}`, {
        exact: true,
      })
      .fill("Is it feasible?")
    await omPage.getByLabel(`Status, row ${row}`, { exact: true }).click()
    await omPage.getByRole("option", { name: "Passed" }).click()
  }

  await omPage.getByRole("button", { name: "Submit for approval" }).click()
  await expect(omPage.getByText("Submitted.")).toBeVisible()
  await omPage.close()

  const hePage = await browser.newPage()

  await open(hePage, he.email, project.id)
  await hePage.getByRole("button", { name: "Approve" }).click()
  await expect(hePage.getByText("Approved.")).toBeVisible()
  await expect(
    hePage.getByRole("link", { name: "Locked: Internal Review Request" })
  ).toBeVisible()
  await hePage.close()
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
