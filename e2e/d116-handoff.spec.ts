import { expect, test, type Browser } from "@playwright/test"

import { handoffChecklist, handoffDirectives } from "@/lib/handoff"

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

// Minutes with every required answer in.
const minutes = {
  meetingDate: "2026-11-20",
  meetingTime: "10:00",
  scopeSummary: "A 3D model and drawings.",
  paymentTerms: "40% advance, 60% handover",
  directives: handoffDirectives.map((each) => ({
    category: each.category,
    directive: "Write it into the contract.",
    source: each.source,
  })),
  checklist: handoffChecklist.map((each) => ({ ...each, status: "Done" })),
}

// A Tier 1 project with D1.1 to D1.15 locked, D1.15's budget at GHS 94,400,
// with its LE, PM and Contract Admin.
async function setUp() {
  const project = await makeProject(`Rice Mill ${tag()}`)
  const le = await makePerson(`Kojo ${tag()}`)
  const pm = await makePerson(`Ama ${tag()}`)
  const ca = await makePerson(`Gifty ${tag()}`)

  await giveRoles(le.id, project.id, ["LE"])
  await giveRoles(pm.id, project.id, ["PM"])
  await giveRoles(ca.id, project.id, ["CA"])
  await addClientRequest(project.id, { organization_name: "Asante Mills" })
  await lockEarlierTools(project.id)

  for (const toolId of ["D1.8", "D1.9", "D1.12", "D1.13"]) {
    await addRecord(project.id, toolId, "locked")
  }

  await addRecord(project.id, "D1.10", "locked", {
    payload: { overallCapabilityStatus: "Capable" },
  })
  await addRecord(project.id, "D1.11", "locked", {
    payload: { goNoGoDecision: "Go" },
  })
  await addRecord(project.id, "D1.14", "locked", {
    payload: { minimumOverheadMet: true },
  })
  await addRecord(project.id, "D1.15", "locked", {
    payload: {
      budget: [{ value: 94400, paymentSchedule: "40% at signing" }],
    },
  })

  return { project, le, pm, ca }
}

async function open(browser: Browser, email: string, projectId: string) {
  const page = await browser.newPage()

  await signIn(page, email)

  // Buttons only answer once the page has loaded its scripts.
  await page.goto(`/projects/${projectId}/tools/D1.16`, {
    waitUntil: "networkidle",
  })

  return page
}

test("D1.16 shows who hands off and receives, D1.15's value and link, and starts the terms and directives", async ({
  browser,
}) => {
  const { project, le, ca } = await setUp()
  const page = await open(browser, le.email, project.id)

  await expect(page.locator("output#leadEngineer")).toHaveText(le.name)
  await expect(page.locator("output#contractAdmin")).toHaveText(ca.name)
  await expect(page.locator("output#projectValue")).toHaveText("GHS 94,400.00")
  await expect(
    page
      .getByRole("table", { name: "Reference document" })
      .getByRole("link", { name: "Open" })
  ).toHaveAttribute("href", `/projects/${project.id}/tools/D1.15`)
  await expect(page.getByLabel("Payment Terms Agreed")).toHaveValue(
    "40% at signing"
  )
  await expect(
    page.getByLabel("Source Reference, row 2", { exact: true })
  ).toHaveValue("D1.11")
  await page.close()
})

test("the LE releases and submits, and the PM accepts and approves", async ({
  browser,
}) => {
  test.slow()

  const { project, le, pm } = await setUp()

  await addRecord(project.id, "D1.16", "draft", { payload: minutes })

  const lePage = await open(browser, le.email, project.id)

  await lePage.getByRole("button", { name: "Sign Engineering Release" }).click()
  await expect(lePage.getByText(`Signed by ${le.name} on`)).toBeVisible()
  await lePage.getByRole("button", { name: "Submit for approval" }).click()
  await expect(lePage.getByText("Submitted.")).toBeVisible()
  await lePage.close()

  const pmPage = await open(browser, pm.email, project.id)

  await pmPage
    .getByRole("button", { name: "Sign Contracting Acceptance" })
    .click()
  await expect(pmPage.getByText(`Signed by ${pm.name} on`)).toBeVisible()
  await pmPage.getByRole("button", { name: "Approve" }).click()
  await expect(pmPage.getByText("Approved.")).toBeVisible()
  await pmPage.close()
})

test("at 375px the LE's minutes do not scroll sideways", async ({ page }) => {
  const { project, le } = await setUp()

  await addRecord(project.id, "D1.16", "draft", { payload: minutes })
  await page.setViewportSize({ width: 375, height: 800 })
  await signIn(page, le.email)
  await page.goto(`/projects/${project.id}/tools/D1.16`, {
    waitUntil: "networkidle",
  })

  await expect(
    page.getByRole("button", { name: "Submit for approval" })
  ).toBeVisible()
  expect(await sidewaysScroll(page)).toBe(0)
})
