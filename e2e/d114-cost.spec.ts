import { expect, test, type Browser } from "@playwright/test"

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

// A Tier 1 project with D1.1 to D1.13 locked: D1.12's GHS 80,000 floor and
// D1.13's one deliverable, CAD; with its LE and PM.
async function setUp() {
  const project = await makeProject(`Rice Mill ${tag()}`)
  const le = await makePerson(`Kojo ${tag()}`)
  const pm = await makePerson(`Ama ${tag()}`)

  await giveRoles(le.id, project.id, ["LE"])
  await giveRoles(pm.id, project.id, ["PM"])
  await lockEarlierTools(project.id)

  for (const toolId of ["D1.8", "D1.9"]) {
    await addRecord(project.id, toolId, "locked")
  }

  await addRecord(project.id, "D1.10", "locked", {
    payload: { overallCapabilityStatus: "Capable" },
  })
  await addRecord(project.id, "D1.11", "locked", {
    payload: { goNoGoDecision: "Go" },
  })
  await addRecord(project.id, "D1.12", "locked", {
    payload: { costFloor: 80000 },
  })
  await addRecord(project.id, "D1.13", "locked", {
    payload: { includedScope: [{ category: "CAD", description: "A model." }] },
  })

  return { project, le, pm }
}

async function open(browser: Browser, email: string, projectId: string) {
  const page = await browser.newPage()

  await signIn(page, email)

  // Buttons only answer once the page has loaded its scripts.
  await page.goto(`/projects/${projectId}/tools/D1.14`, {
    waitUntil: "networkidle",
  })

  return page
}

test("the LE types the estimate, the totals follow, and it is submitted once the allocations balance", async ({
  browser,
}) => {
  test.slow()

  const { project, le } = await setUp()
  const page = await open(browser, le.email, project.id)
  const cell = (label: string) => page.getByLabel(label, { exact: true })

  await cell("Engineering Module (e.g. Mechanical/Electronics), row 1").fill(
    "Mechanical"
  )
  await cell("Estimated Days, row 1").fill("80")
  await cell("Daily Rate (GHS), row 1").fill("1000")
  await expect(cell("Total Labor Cost (GHS), row 1")).toHaveValue("80000")

  await cell("Applied Rate (%), row 1").fill("15")
  await cell("Applied Rate (%), row 2").fill("7")
  await cell("Applied Rate (%), row 3").fill("15")
  await expect(page.locator("output#totalProjectValue")).toHaveText(
    "GHS 109,600.00"
  )
  await expect(page.locator("output#minimumOverheadMet")).toHaveText("Yes")

  await expect(
    cell("Deliverable Category (Must match SOW D1.13), row 1")
  ).toHaveValue("CAD")
  await cell("Fully Loaded Alloc. Cost (GHS), row 1").fill("100000")
  await expect(page.locator("output#allocationCheck")).toHaveText(
    "GHS 9,600.00 left to allocate"
  )
  await cell("Fully Loaded Alloc. Cost (GHS), row 1").fill("109600")
  await expect(page.locator("output#allocationCheck")).toHaveText(
    "Balanced with the total project value"
  )

  await page.getByRole("button", { name: "Save draft" }).click()
  await expect(page.getByText("Draft saved.")).toBeVisible()
  await page
    .getByRole("button", { name: "Sign Lead Engineer Signature" })
    .click()
  await expect(page.getByText(`Signed by ${le.name} on`)).toBeVisible()
  await page.getByRole("button", { name: "Submit for approval" }).click()
  await expect(page.getByText("Submitted.")).toBeVisible()
  await page.close()
})

test("the PM signs and approves the estimate", async ({ browser }) => {
  const { project, le, pm } = await setUp()

  await addRecord(project.id, "D1.14", "submitted", {
    submittedBy: le.id,
    payload: {
      labor: [{ module: "Mechanical", days: 100, dailyRate: 1000 }],
      markups: [
        { category: "Project Management & QC", rate: 0 },
        { category: "Administrative Overhead", rate: 0 },
        { category: "Sustainability / Risk Margin", rate: 0 },
      ],
      allocations: [{ deliverable: "CAD", cost: 100000 }],
      totalProjectValue: 100000,
      costFloor: 80000,
      minimumOverheadMet: true,
      leadEngineerSignature: {
        signedBy: le.id,
        signedAt: "2026-11-10T10:00:00.000Z",
      },
    },
  })

  const page = await open(browser, pm.email, project.id)

  await expect(page.locator("output#totalProjectValue")).toHaveText(
    "GHS 100,000.00"
  )
  await page
    .getByRole("button", { name: "Sign Head of R&D / Finance Sig" })
    .click()
  await expect(page.getByText(`Signed by ${pm.name} on`)).toBeVisible()
  await page.getByRole("button", { name: "Approve" }).click()
  await expect(page.getByText("Approved.")).toBeVisible()
  await page.close()
})

test("at 375px the LE's sheet does not scroll sideways", async ({ page }) => {
  const { project, le } = await setUp()

  await page.setViewportSize({ width: 375, height: 800 })
  await signIn(page, le.email)
  await page.goto(`/projects/${project.id}/tools/D1.14`, {
    waitUntil: "networkidle",
  })

  await expect(
    page.getByRole("button", { name: "Submit for approval" })
  ).toBeVisible()
  expect(await sidewaysScroll(page)).toBe(0)
})
