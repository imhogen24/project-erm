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

// A Tier 1 project with Workbooks 1 and 2 locked as far as D2.12: a contract
// of GHS 94,400.00 with 40% due on execution, in GHS. Its FO, PM, CA, OM and
// client.
async function setUp() {
  const project = await makeProject(`Rice Mill ${tag()}`)
  const fo = await makePerson(`Esi ${tag()}`)
  const pm = await makePerson(`Ama ${tag()}`)
  const ca = await makePerson(`Gifty ${tag()}`)
  const om = await makePerson(`Kofi ${tag()}`)
  const client = await makePerson(`Kwaku ${tag()}`)

  await giveRoles(fo.id, project.id, ["FO"])
  await giveRoles(pm.id, project.id, ["PM"])
  await giveRoles(ca.id, project.id, ["CA"])
  await giveRoles(om.id, project.id, ["OM"])
  await giveRoles(client.id, project.id, ["Client"])
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
  ]) {
    await addRecord(project.id, toolId, "locked")
  }

  await addRecord(project.id, "D2.1", "locked", {
    payload: { executionPercentage: 40, currency: "GHS" },
  })
  await addRecord(project.id, "D2.2", "locked", {
    payload: {
      coreVariables: [
        { variable: "Client Legal Name", value: "Asante Mills" },
        { variable: "Client Representative", value: "Kwaku Ampofo" },
        { variable: "Total Contract Value (GHS)", value: "GHS 94,400.00" },
      ],
    },
  })

  for (const toolId of [
    "D2.3",
    "D2.4",
    "D2.5",
    "D2.6",
    "D2.8",
    "D2.10",
    "D2.11",
    "D2.12",
  ]) {
    await addRecord(project.id, toolId, "locked", { submittedBy: ca.id })
  }

  await addRecord(project.id, "D2.7", "locked", {
    payload: { initialResponse: "Requested Negotiation" },
  })
  await addRecord(project.id, "D2.9", "locked", {
    payload: { meetingOutcome: "Terms Agreed - Proceed to D2.10" },
  })

  return { project, fo, pm, ca, om, client }
}

async function open(browser: Browser, email: string, projectId: string) {
  const page = await browser.newPage()

  await signIn(page, email)

  // Buttons only answer once the page has loaded its scripts.
  await page.goto(`/projects/${projectId}/tools/D3.1`, {
    waitUntil: "networkidle",
  })

  return page
}

const schedule = "2.0 Approved Payment Schedule (From Executed Contract)"

test("D3.1 starts on D2.1's advance and works out each Amount Due as it is typed", async ({
  browser,
}) => {
  test.slow()

  const { project, fo } = await setUp()
  const page = await open(browser, fo.email, project.id)

  await expect(page.locator("#totalProjectValue")).toHaveText("GHS 94,400.00")

  const table = page.getByRole("table", { name: schedule })
  await expect(
    table.getByLabel("Milestone Description, row 1", { exact: true })
  ).toHaveValue("Advance Payment (Contract Signing)")
  await expect(
    table.getByLabel("Percentage (%), row 1", { exact: true })
  ).toHaveValue("40")
  await expect(
    table.getByLabel("Amount Due (GHS), row 1", { exact: true })
  ).toHaveValue("GHS 37,760.00")
  await expect(
    table.getByLabel("Percentage (%), row 2", { exact: true })
  ).toHaveValue("")

  await table.getByLabel("Percentage (%), row 2", { exact: true }).fill("25")
  await expect(
    table.getByLabel("Amount Due (GHS), row 2", { exact: true })
  ).toHaveValue("GHS 23,600.00")

  await table.getByRole("button", { name: "Add row" }).click()
  await table.getByLabel("Percentage (%), row 4", { exact: true }).fill("10")
  await expect(
    table.getByLabel("Amount Due (GHS), row 4", { exact: true })
  ).toHaveValue("GHS 9,440.00")

  const rules = page.getByRole("table", {
    name: "3.0 Financial Compliance Rules",
  })

  await expect(
    rules.getByLabel("Agreed Term, row 4", { exact: true })
  ).toHaveValue("Ghana Cedis (GHS) ONLY")

  // Nothing is answered yet, so submitting is refused.
  await page.getByRole("button", { name: "Submit for approval" }).click()
  await expect(page.getByRole("alert").first()).toBeVisible()
  await expect(page.getByLabel("Document control")).not.toContainText(
    "Submitted"
  )
  await page.close()
})

test("the PM approves a submitted D3.1, which locks it", async ({
  browser,
}) => {
  test.slow()

  const { project, fo, pm } = await setUp()

  await addRecord(project.id, "D3.1", "submitted", {
    submittedBy: fo.id,
    payload: {
      paymentSchedule: [
        {
          milestone: "Advance Payment (Contract Signing)",
          percentage: 40,
          clauseRef: "Section 3.3.1",
        },
        {
          milestone: "Fabrication Milestone (Design Approval)",
          percentage: 40,
          clauseRef: "Section 3.3.2",
        },
        {
          milestone: "Final Handover (System Delivery)",
          percentage: 20,
          clauseRef: "Section 3.3.3",
        },
      ],
      complianceRules: [
        {
          category: "Invoice Payment Window",
          term: "Net 21 Days from Invoice Issuance",
          clauseRef: "Section 4.1",
        },
        {
          category: "Late Payment Penalty",
          term: "2% Monthly Interest on outstanding balance",
          clauseRef: "Section 4.2",
        },
        {
          category: "Tax / VAT Obligations",
          term: "All prices are exclusive of 15% VAT",
          clauseRef: "Section 4.3",
        },
        {
          category: "Accepted Currency",
          term: "Ghana Cedis (GHS) ONLY",
          clauseRef: "Section 4.4",
        },
      ],
      accepted: "Yes",
      foSignature: {
        signedBy: fo.id,
        signedAt: "2026-12-12T09:00:00.000Z",
      },
    },
  })

  const page = await open(browser, pm.email, project.id)

  await expect(page.locator("#extractedBy")).toHaveText(fo.name)
  await page.getByRole("button", { name: "Approve" }).click()
  await expect(page.getByText("Approved.")).toBeVisible()
  await page.reload({ waitUntil: "networkidle" })
  await expect(page.getByLabel("Document control")).toContainText("Locked")
  await page.close()
})

test("the OM cannot open D3.1, and the client reads it", async ({
  browser,
}) => {
  const { project, om, client } = await setUp()

  const omPage = await browser.newPage()

  await signIn(omPage, om.email)
  expect(
    (await omPage.goto(`/projects/${project.id}/tools/D3.1`))?.status()
  ).toBe(404)
  await omPage.close()

  const clientPage = await open(browser, client.email, project.id)

  await expect(
    clientPage.getByRole("button", { name: "Submit for approval" })
  ).toHaveCount(0)
  await clientPage.close()
})

test("at 375px D3.1 does not scroll sideways", async ({ page }) => {
  const { project, fo } = await setUp()

  await page.setViewportSize({ width: 375, height: 800 })
  await signIn(page, fo.email)
  await page.goto(`/projects/${project.id}/tools/D3.1`, {
    waitUntil: "networkidle",
  })

  await expect(
    page.getByRole("button", { name: "Submit for approval" })
  ).toBeVisible()
  expect(await sidewaysScroll(page)).toBe(0)
})
