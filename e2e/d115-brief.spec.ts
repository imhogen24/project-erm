import { expect, test, type Browser } from "@playwright/test"

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

// A brief whose budget adds up to D1.14's GHS 94,400.
const brief = {
  targetStartDate: "2026-12-01",
  vision: "Document the unit.",
  objectives: [{ objective: "An accurate 3D model." }],
  phases: [
    {
      phaseNo: "1",
      name: "Review",
      deliverables: "Review.",
      duration: "1 week",
    },
  ],
  budget: [
    { deliverable: "CAD", value: 94400, paymentSchedule: "40% at signing" },
  ],
  outOfScope: "Fabrication.",
  clientDependencies: "Site access.",
}

// A project with every tool before D1.15 (or T3.D1.15a) locked, D1.13's
// vision and D1.14's one allocation, with its LE, PM and client.
async function setUp(track: "Tier_1" | "Tier_3" = "Tier_1") {
  const project = await makeProject(`Rice Mill ${tag()}`, track)
  const le = await makePerson(`Kojo ${tag()}`)
  const pm = await makePerson(`Ama ${tag()}`)
  const client = await makeClient()

  await giveRoles(le.id, project.id, ["LE"])
  await giveRoles(pm.id, project.id, ["PM"])
  await giveRoles(client.id, project.id, ["Client"])
  await addClientRequest(project.id, {
    organization_name: "Asante Mills",
    contact_person: "Akosua Mensah",
    email: `${tag()}@example.com`,
    project_title: "Rice mill",
  })

  if (track === "Tier_1") {
    await lockEarlierTools(project.id)
  } else {
    for (const toolId of ["D1.1", "D1.2", "T3.D1.3a", "T3.D1.8a"]) {
      await addRecord(project.id, toolId, "locked")
    }

    await addRecord(project.id, "D1.4", "locked", {
      payload: { deliveryStatus: "Delivered" },
    })
  }

  for (const toolId of track === "Tier_1" ? ["D1.8", "D1.9"] : ["D1.9"]) {
    await addRecord(project.id, toolId, "locked")
  }

  await addRecord(project.id, "D1.10", "locked", {
    payload: { overallCapabilityStatus: "Capable" },
  })
  await addRecord(project.id, "D1.11", "locked", {
    payload: { goNoGoDecision: "Go" },
  })
  await addRecord(project.id, "D1.12", "locked", {
    payload: { realisticTimeline: "8 weeks" },
  })
  await addRecord(project.id, "D1.13", "locked", {
    payload: { vision: "A complete documentation package." },
  })
  await addRecord(project.id, "D1.14", "locked", {
    payload: {
      allocations: [{ deliverable: "CAD", cost: 94400 }],
      totalProjectValue: 94400,
      minimumOverheadMet: true,
    },
  })

  return { project, le, pm, client }
}

async function open(
  browser: Browser,
  email: string,
  projectId: string,
  toolId = "D1.15"
) {
  const page = await browser.newPage()

  await signIn(page, email)

  // Buttons only answer once the page has loaded its scripts.
  await page.goto(`/projects/${projectId}/tools/${toolId}`, {
    waitUntil: "networkidle",
  })

  return page
}

test("D1.15 starts from the client's request, D1.13 and D1.14", async ({
  browser,
}) => {
  const { project, le } = await setUp()
  const page = await open(browser, le.email, project.id)

  await expect(page.locator("output#contactPerson")).toHaveText("Akosua Mensah")
  await expect(page.locator("output#duration")).toHaveText("8 weeks")
  await expect(page.getByLabel("Project Vision")).toHaveValue(
    "A complete documentation package."
  )
  await expect(
    page.getByLabel("Allocated Value (GHS), row 1", { exact: true })
  ).toHaveValue("94400")
  await page.close()
})

test("the LE signs and submits the brief, the client waits, and the PM signs and approves", async ({
  browser,
}) => {
  test.slow()

  const { project, le, pm, client } = await setUp()

  await addRecord(project.id, "D1.15", "draft", { payload: brief })

  const lePage = await open(browser, le.email, project.id)

  await lePage
    .getByRole("button", { name: "Sign Head of R&D Signature" })
    .click()
  await expect(lePage.getByText(`Signed by ${le.name} on`)).toBeVisible()
  await lePage.getByRole("button", { name: "Submit for approval" }).click()
  await expect(lePage.getByText("Submitted.")).toBeVisible()
  await lePage.close()

  const clientPage = await open(browser, client.email, project.id)

  await expect(
    clientPage.getByText("IMHOGEN shares this with you once it is approved.")
  ).toBeVisible()
  await clientPage.close()

  const pmPage = await open(browser, pm.email, project.id)

  await pmPage.getByRole("button", { name: "Sign Signature/Date" }).click()
  await expect(pmPage.getByText(`Signed by ${pm.name} on`)).toBeVisible()
  await pmPage.getByRole("button", { name: "Approve" }).click()
  await expect(pmPage.getByText("Approved.")).toBeVisible()
  await pmPage.close()
})

test("the LE prices the Tier 3 quote, the total follows, and it is submitted", async ({
  browser,
}) => {
  test.slow()

  const { project, le } = await setUp("Tier_3")
  const page = await open(browser, le.email, project.id, "T3.D1.15a")

  const scope = page.getByRole("table", { name: "Scope of deliverables" })
  const cell = (label: string) => scope.getByLabel(label, { exact: true })

  await expect(cell("Format, row 1")).toHaveValue("STEP")
  await cell("Qty, row 1").fill("1")
  await cell("Delivery Timeline, row 1").fill("2 weeks")

  const pricing = page.getByRole("table", { name: "Pricing summary" })
  const priced = (label: string) => pricing.getByLabel(label, { exact: true })

  await priced("Rate, row 1").fill("500")
  await priced("Qty, row 1").fill("80")
  await priced("Rate, row 2").fill("0")
  await priced("Qty, row 2").fill("1")
  await priced("Rate, row 3").fill("5000")
  await priced("Qty, row 3").fill("1")
  await expect(priced("Subtotal, row 1")).toHaveValue("40000")
  await expect(page.locator("output#totalT3ProjectValue")).toHaveText(
    "GHS 45,000.00"
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

test("at 375px the LE's brief does not scroll sideways", async ({ page }) => {
  const { project, le } = await setUp()

  await addRecord(project.id, "D1.15", "draft", {
    payload: brief,
  })
  await page.setViewportSize({ width: 375, height: 800 })
  await signIn(page, le.email)
  await page.goto(`/projects/${project.id}/tools/D1.15`, {
    waitUntil: "networkidle",
  })

  await expect(
    page.getByRole("button", { name: "Submit for approval" })
  ).toBeVisible()
  expect(await sidewaysScroll(page)).toBe(0)
})
