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

// A Tier 1 project with D1.1 to D1.7 locked, so D1.8 is open, with the web
// request the client sent and its team.
async function setUp() {
  const project = await makeProject(`Boiler ${tag()}`)
  const le = await makePerson(`Kojo ${tag()}`)
  const pm = await makePerson(`Ama ${tag()}`)

  await giveRoles(le.id, project.id, ["LE"])
  await giveRoles(pm.id, project.id, ["PM"])
  await addClientRequest(project.id, {
    contact_person: "Kwaku Ampofo",
    email: `${tag()}@example.com`,
    material_inputs: "Carbon steel plate",
    human_system: "One operator per shift",
  })

  for (const toolId of ["D1.1", "D1.2", "D1.3", "D1.5", "D1.6", "D1.7"]) {
    await addRecord(project.id, toolId, "locked")
  }

  await addRecord(project.id, "D1.4", "locked", {
    payload: { deliveryStatus: "Delivered" },
  })

  return { project, le, pm }
}

async function open(page: Page, email: string, projectId: string) {
  await signIn(page, email)

  // Buttons only answer once the page has loaded its scripts.
  await page.goto(`/projects/${projectId}/tools/D1.8`, {
    waitUntil: "networkidle",
  })
}

test("the LE sees the client's answers and the system's metadata, signs and submits", async ({
  page,
}) => {
  const { project, le } = await setUp()

  await open(page, le.email, project.id)

  await expect(page.getByText("Client: Carbon steel plate")).toBeVisible()
  await expect(page.getByText("Client: One operator per shift")).toBeVisible()
  await expect(page.getByText("Kwaku Ampofo")).toHaveCount(0)
  await expect(page.getByText(project.name).first()).toBeVisible()

  await page
    .getByLabel("Confirmed Constraints / Specifications, row 1", {
      exact: true,
    })
    .fill("S275 plate, 12 mm shell")
  await page.getByRole("button", { name: "Save draft" }).click()
  await expect(page.getByText("Draft saved.")).toBeVisible()

  await page
    .getByRole("button", { name: "Sign Lead Engineer Signature" })
    .click()
  await expect(page.getByText(`Signed by ${le.name} on`)).toBeVisible()

  await page.getByRole("button", { name: "Submit for approval" }).click()
  await expect(page.getByText("Submitted.")).toBeVisible()
  await expect(page.locator("output#synthesisComplete")).toHaveText("Yes")
})

test("the PM approves D1.8, which locks it and makes it ready for D1.9", async ({
  browser,
}) => {
  test.slow()

  const { project, le, pm } = await setUp()

  const lePage = await browser.newPage()

  await open(lePage, le.email, project.id)
  await lePage.getByRole("button", { name: "Save draft" }).click()
  await expect(lePage.getByText("Draft saved.")).toBeVisible()
  await lePage
    .getByRole("button", { name: "Sign Lead Engineer Signature" })
    .click()
  await expect(lePage.getByText(`Signed by ${le.name} on`)).toBeVisible()
  await lePage.getByRole("button", { name: "Submit for approval" }).click()
  await expect(lePage.getByText("Submitted.")).toBeVisible()
  await lePage.close()

  const pmPage = await browser.newPage()

  await open(pmPage, pm.email, project.id)
  await pmPage.getByRole("button", { name: "Approve" }).click()
  await expect(pmPage.getByText("Approved.")).toBeVisible()
  await expect(pmPage.locator("output#readyForReview")).toHaveText("Yes")
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
