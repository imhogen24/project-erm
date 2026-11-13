import { expect, test, type Page } from "@playwright/test"

import {
  addRecord,
  giveRoles,
  makePerson,
  makeProject,
  sidewaysScroll,
  signIn,
  tag,
} from "./support/data"

// A Tier 3 project with D1.1 to D1.4 locked and D1.4 delivered, so T3.D1.8a
// is open, with its AE and LE.
async function setUp() {
  const project = await makeProject(`Pump station ${tag()}`, "Tier_3")
  const ae = await makePerson(`Adwoa ${tag()}`)
  const le = await makePerson(`Yaa ${tag()}`)

  await giveRoles(ae.id, project.id, ["AE"])
  await giveRoles(le.id, project.id, ["LE"])

  for (const toolId of ["D1.1", "D1.2", "T3.D1.3a"]) {
    await addRecord(project.id, toolId, "locked")
  }

  await addRecord(project.id, "D1.4", "locked", {
    payload: { deliveryStatus: "Delivered" },
  })

  return { project, ae, le }
}

async function open(page: Page, email: string, projectId: string) {
  await signIn(page, email)

  // Buttons only answer once the page has loaded its scripts.
  await page.goto(`/projects/${projectId}/tools/T3.D1.8a`, {
    waitUntil: "networkidle",
  })
}

function cell(page: Page, table: string, label: string) {
  return page.getByRole("table", { name: table }).getByLabel(label, {
    exact: true,
  })
}

test("the AE logs the measurements with a photo link, signs and submits; the LE approves", async ({
  browser,
}) => {
  test.slow()

  const { project, ae, le } = await setUp()

  const aePage = await browser.newPage()

  await open(aePage, ae.email, project.id)

  await cell(aePage, "Measurement equipment", "Tool Used, row 1").fill(
    "Tape Measure"
  )
  await cell(aePage, "Critical dimensions", "Feature Name, row 1").fill(
    "Sketched outline of trailer"
  )
  await cell(aePage, "Critical dimensions", "Measurement Method, row 1").fill(
    "Tape Measure"
  )
  await cell(aePage, "Critical dimensions", "Measured Value (mm), row 1").fill(
    "4200 x 1800"
  )
  await cell(aePage, "Critical dimensions", "Confidence (H/M/L), row 1").click()
  await aePage.getByRole("option", { name: "Medium" }).click()

  await cell(aePage, "Photographic evidence", "View Required, row 1").fill(
    "All views"
  )
  await cell(aePage, "Photographic evidence", "Captured? (Y/N), row 1").click()
  await aePage.getByRole("option", { name: "Yes" }).click()

  const link = cell(aePage, "Photographic evidence", "File / Folder, row 1")

  await link.fill("https://drive.example.com/tarkwa-photos")
  await link.blur()

  await expect(
    aePage
      .getByRole("table", { name: "Photographic evidence" })
      .getByText("drive.example.com")
  ).toBeVisible()
  await expect(
    aePage
      .getByRole("table", { name: "Photographic evidence" })
      .getByRole("button", { name: "Upload" })
  ).toHaveCount(0)

  await aePage.getByRole("button", { name: "Save draft" }).click()
  await expect(aePage.getByText("Draft saved.")).toBeVisible()
  await expect(
    aePage.getByRole("link", { name: /Open/ }).first()
  ).toHaveAttribute("href", /\/api\/files\//)

  await aePage
    .getByRole("button", { name: "Sign Lead Measurer Signature" })
    .click()
  await expect(aePage.getByText(`Signed by ${ae.name} on`)).toBeVisible()
  await aePage.getByRole("button", { name: "Submit for approval" }).click()
  await expect(aePage.getByText("Submitted.")).toBeVisible()
  await aePage.close()

  const lePage = await browser.newPage()

  await open(lePage, le.email, project.id)
  await lePage.getByRole("button", { name: "Approve" }).click()
  await expect(lePage.getByText("Approved.")).toBeVisible()
  await expect(
    lePage.getByRole("link", { name: "Locked: T3 Physical Metrology Log" })
  ).toBeVisible()
  await lePage.close()
})

test("an empty file cell offers a link or an upload to the AE", async ({
  page,
}) => {
  const { project, ae } = await setUp()

  await open(page, ae.email, project.id)

  const photos = page.getByRole("table", { name: "Photographic evidence" })

  await expect(photos.getByRole("button", { name: "Upload" })).toBeVisible()
  await expect(
    photos.getByLabel("File / Folder, row 1", { exact: true })
  ).toHaveAttribute("placeholder", "https://")
})

test("at 375px the AE's sheet does not scroll sideways", async ({ page }) => {
  const { project, ae } = await setUp()

  await page.setViewportSize({ width: 375, height: 800 })
  await open(page, ae.email, project.id)

  await expect(
    page.getByRole("button", { name: "Submit for approval" })
  ).toBeVisible()
  expect(await sidewaysScroll(page)).toBe(0)
})
