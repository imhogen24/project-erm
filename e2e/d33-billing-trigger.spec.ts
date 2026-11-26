import { expect, test, type Browser } from "@playwright/test"

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

const fabrication = "2.2 Fabrication Milestone (Design Approval)"

// A Tier 1 project with Workbooks 1 and 2 locked and D3.1 locked with three
// milestones, 40%, 40% and 20% of GHS 94,400.00. Its PM, FO, HE and OM.
async function setUp() {
  const project = await makeProject(`Rice Mill ${tag()}`)
  const pm = await makePerson(`Ama ${tag()}`)
  const fo = await makePerson(`Esi ${tag()}`)
  const he = await makePerson(`Kojo ${tag()}`)
  const om = await makePerson(`Kofi ${tag()}`)

  await giveRoles(pm.id, project.id, ["PM"])
  await giveRoles(fo.id, project.id, ["FO"])
  await giveRoles(he.id, project.id, ["HE"])
  await giveRoles(om.id, project.id, ["OM"])
  await addClientRequest(project.id, { organization_name: "Asante Mills" })
  await lockEarlierTools(project.id)

  for (const toolId of [
    "D1.8",
    "D1.9",
    "D1.10",
    "D1.11",
    "D1.12",
    "D1.13",
    "D1.14",
    "D1.15",
    "D1.16",
    "D2.1",
    "D2.2",
    "D2.3",
    "D2.4",
    "D2.5",
    "D2.6",
    "D2.7",
    "D2.8",
    "D2.9",
    "D2.10",
    "D2.11",
    "D2.12",
  ]) {
    await addRecord(project.id, toolId, "locked")
  }

  await addRecord(project.id, "D3.1", "locked", {
    payload: {
      paymentSchedule: [
        {
          milestone: "Advance Payment (Contract Signing)",
          percentage: 40,
          amountDue: 37760,
        },
        {
          milestone: "Fabrication Milestone (Design Approval)",
          percentage: 40,
          amountDue: 37760,
        },
        {
          milestone: "Final Handover (System Delivery)",
          percentage: 20,
          amountDue: 18880,
        },
      ],
    },
  })

  return { project, pm, fo, he, om }
}

async function open(
  browser: Browser,
  email: string,
  projectId: string,
  query = ""
) {
  const page = await browser.newPage()

  await signIn(page, email)

  // Buttons only answer once the page has loaded its scripts.
  await page.goto(`/projects/${projectId}/tools/D3.3${query}`, {
    waitUntil: "networkidle",
  })

  return page
}

test("D3.3 starts on the next milestone with its value, and refuses an incomplete trigger", async ({
  browser,
}) => {
  test.slow()

  const { project, pm, fo } = await setUp()
  const page = await open(browser, pm.email, project.id)

  await expect(page.locator("#milestone")).toContainText(fabrication)
  await expect(page.locator("#milestoneValue")).toHaveText(
    "40% / GHS 37,760.00"
  )
  await expect(page.locator("#recipient")).toHaveText(fo.name)

  // No proof, no answers and no signature, so submitting is refused.
  await page.getByRole("button", { name: "Submit for approval" }).click()
  await expect(page.getByRole("alert").first()).toBeVisible()
  await expect(page.getByLabel("Document control")).not.toContainText(
    "Submitted"
  )
  await page.close()
})

test("the FO approves a D3.3, which records Proceed and opens the next one", async ({
  browser,
}) => {
  test.slow()

  const { project, pm, fo } = await setUp()

  await addRecord(project.id, "D3.3", "submitted", {
    cycle: 1,
    submittedBy: pm.id,
    submittedAt: new Date(),
    payload: {
      milestone: fabrication,
      proofOfCompletion: "https://example.com/design-approval.pdf",
      clientAccepted: "Yes",
      openDisputes: "No",
      pmSignature: { signedBy: pm.id, signedAt: new Date().toISOString() },
    },
  })

  const page = await open(browser, fo.email, project.id)

  await expect(page.locator("#triggerSentBy")).toHaveText(pm.name)
  await page.getByRole("button", { name: "Approve" }).click()
  await expect(page.getByText("Approved.")).toBeVisible()

  await page.goto(`/projects/${project.id}/tools/D3.3?cycle=1`, {
    waitUntil: "networkidle",
  })
  await expect(page.getByLabel("Document control")).toContainText("Locked")
  await expect(page.locator("#actionTaken")).toContainText(
    "Proceed to D3.4 Draft Invoice"
  )
  await expect(page.locator("#financeOfficer")).toHaveText(fo.name)
  await page.close()

  // A new D3.3 opens for the PM on the last milestone.
  const next = await open(browser, pm.email, project.id)

  await expect(next.locator("#milestone")).toContainText(
    "2.3 Final Handover (System Delivery)"
  )
  await expect(
    next.getByRole("navigation", { name: "D3.3 by milestone" })
  ).toContainText(`D3.3 · ${fabrication}`)
  await next.close()
})

test("the HE reads D3.3, and the OM cannot open it", async ({ browser }) => {
  const { project, he, om } = await setUp()

  const omPage = await browser.newPage()

  await signIn(omPage, om.email)
  expect(
    (await omPage.goto(`/projects/${project.id}/tools/D3.3`))?.status()
  ).toBe(404)
  await omPage.close()

  const hePage = await open(browser, he.email, project.id)

  await expect(
    hePage.getByRole("button", { name: "Submit for approval" })
  ).toHaveCount(0)
  await hePage.close()
})

test("at 375px D3.3 does not scroll sideways", async ({ page }) => {
  const { project, pm } = await setUp()

  await page.setViewportSize({ width: 375, height: 800 })
  await signIn(page, pm.email)
  await page.goto(`/projects/${project.id}/tools/D3.3`, {
    waitUntil: "networkidle",
  })

  await expect(
    page.getByRole("button", { name: "Submit for approval" })
  ).toBeVisible()
  expect(await sidewaysScroll(page)).toBe(0)
})
