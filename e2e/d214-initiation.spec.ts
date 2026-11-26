import { expect, test, type Browser } from "@playwright/test"

import {
  addClientRequest,
  addRecord,
  addUpload,
  giveRoles,
  lockEarlierTools,
  makePerson,
  makeProject,
  sidewaysScroll,
  signIn,
  tag,
} from "./support/data"
import { pickDate } from "./support/pick-date"

// A Tier 1 project with Workbook 1 and D2.1 to D2.13 locked: a contract of
// GHS 94,400.00 with 40% due on execution, an 8-week timeline, and D2.12's
// invoice and executed contract. Its CA, FO, PM, OM and client.
async function setUp() {
  const project = await makeProject(`Rice Mill ${tag()}`)
  const ca = await makePerson(`Gifty ${tag()}`)
  const fo = await makePerson(`Esi ${tag()}`)
  const pm = await makePerson(`Ama ${tag()}`)
  const om = await makePerson(`Kofi ${tag()}`)
  const client = await makePerson(`Kwaku ${tag()}`)

  await giveRoles(ca.id, project.id, ["CA"])
  await giveRoles(fo.id, project.id, ["FO"])
  await giveRoles(pm.id, project.id, ["PM"])
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
    payload: { executionPercentage: 40 },
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
  await addRecord(project.id, "D2.6", "locked", {
    payload: {
      baseline: [
        {
          variable: "Total Contract Value (GHS)",
          baselineValue: "GHS 94,400.00",
        },
        { variable: "Advance Payment %", baselineValue: "40%" },
        { variable: "Total Project Timeline", baselineValue: "8 weeks" },
      ],
    },
  })

  for (const toolId of ["D2.3", "D2.4", "D2.5", "D2.8", "D2.10", "D2.11"]) {
    await addRecord(project.id, toolId, "locked", { submittedBy: ca.id })
  }

  await addRecord(project.id, "D2.7", "locked", {
    payload: { initialResponse: "Requested Negotiation" },
  })
  await addRecord(project.id, "D2.9", "locked", {
    payload: { meetingOutcome: "Terms Agreed - Proceed to D2.10" },
  })

  const executed = await addUpload(
    ca.id,
    `key-${tag()}`,
    "Executed.pdf",
    project.id
  )

  await addRecord(project.id, "D2.12", "locked", {
    payload: {
      invoiceNumber: "IMHO-INV26-ADV-011",
      executedPdf: `file:${executed.id}`,
    },
  })
  await addRecord(project.id, "D2.13", "locked")

  return { project, ca, fo, pm, om, client }
}

async function open(browser: Browser, email: string, projectId: string) {
  const page = await browser.newPage()

  await signIn(page, email)

  // Buttons only answer once the page has loaded its scripts.
  await page.goto(`/projects/${projectId}/tools/D2.14`, {
    waitUntil: "networkidle",
  })

  return page
}

const paymentDate = "Date Payment Cleared IMHO GEN Bank Account"

test("D2.14 starts from D2.12 and the advance, and its dates follow the payment until changed", async ({
  browser,
}) => {
  test.slow()

  const { project, ca, pm } = await setUp()
  const page = await open(browser, ca.email, project.id)

  await expect(page.locator("#assignedPm")).toHaveText(pm.name)
  await expect(page.locator("#totalTimeline")).toHaveText("8 weeks")
  await expect(page.getByLabel("Advance Invoice Number")).toHaveValue(
    "IMHO-INV26-ADV-011"
  )
  await expect(page.getByLabel("Amount Expected")).toHaveValue("37760")
  await expect(
    page.getByRole("button", {
      name: "View Link to Executed Contract (For PM reference)",
    })
  ).toBeEnabled()
  await expect(
    page.getByRole("button", { name: "Sign Finance Clearance Signature" })
  ).toHaveCount(0)

  const pmTask = page
    .getByRole("table", { name: "4.0 Launch confirmation" })
    .getByRole("row")
    .filter({ hasText: "formally received" })

  await expect(pmTask).toContainText("Pending")
  await expect(pmTask.getByRole("combobox")).toHaveCount(0)

  await pickDate(page, paymentDate, "2026-12-14")
  await expect(page.locator("#startDate")).toHaveText("14 Dec 2026")
  await expect(page.locator("#targetDate")).toHaveText("8 Feb 2027")

  // A start typed by hand stays; the target follows it.
  await pickDate(page, "Official Project Start Date (Day 1)", "2026-12-21")
  await pickDate(page, paymentDate, "2026-12-15")
  await expect(page.locator("#startDate")).toHaveText("21 Dec 2026")
  await expect(page.locator("#targetDate")).toHaveText("15 Feb 2027")

  // 5.0's answer is asked for first.
  await page.getByRole("button", { name: "Submit for approval" }).click()
  await expect(
    page.getByRole("alert").filter({ hasText: "Required" })
  ).toHaveCount(1)
  await page.close()
})

test("after submit the FO signs, then the PM, whose signature locks it", async ({
  browser,
}) => {
  test.slow()

  const { project, fo, pm } = await setUp()

  await addRecord(project.id, "D2.14", "submitted", {
    payload: {
      invoiceNumber: "IMHO-INV26-ADV-011",
      amountExpected: 37760,
      paymentDate: "2026-12-14",
      startDate: "2026-12-14",
      targetDate: "2027-02-08",
      launchTasks: [
        {
          task: 'Has the central tracking database been updated to "Active Engineering Phase"?',
          assignee: "Contract Admin",
          status: "Done",
        },
        {
          task: "Has the Project Manager formally received this Initiation Notice?",
          assignee: "Project Manager",
          status: "Pending",
        },
      ],
      authorized: "Yes",
    },
  })

  const early = await open(browser, pm.email, project.id)

  await expect(
    early.getByRole("button", {
      name: "Sign Head of Operations / R&D Signature",
    })
  ).toHaveCount(0)
  await early.close()

  const foPage = await open(browser, fo.email, project.id)

  await foPage
    .getByRole("button", { name: "Sign Finance Clearance Signature" })
    .click()
  await expect(foPage.getByText(`Signed by ${fo.name}`)).toBeVisible()
  await foPage.close()

  const pmPage = await open(browser, pm.email, project.id)

  await pmPage
    .getByRole("button", { name: "Sign Head of Operations / R&D Signature" })
    .click()
  await expect(pmPage.getByText(`Signed by ${pm.name}`)).toBeVisible()
  await pmPage.reload({ waitUntil: "networkidle" })
  await expect(pmPage.getByLabel("Document control")).toContainText("Locked")
  await expect(
    pmPage
      .getByRole("table", { name: "4.0 Launch confirmation" })
      .getByRole("row")
      .filter({ hasText: "formally received" })
  ).toContainText("Done")
  await pmPage.close()
})

test("the client and the OM cannot open D2.14", async ({ browser }) => {
  const { project, om, client } = await setUp()

  for (const person of [om, client]) {
    const page = await browser.newPage()

    await signIn(page, person.email)

    const result = await page.goto(`/projects/${project.id}/tools/D2.14`)

    expect(result?.status()).toBe(404)
    await page.close()
  }
})

test("at 375px D2.14 does not scroll sideways", async ({ page }) => {
  const { project, ca } = await setUp()

  await page.setViewportSize({ width: 375, height: 800 })
  await signIn(page, ca.email)
  await page.goto(`/projects/${project.id}/tools/D2.14`, {
    waitUntil: "networkidle",
  })

  await expect(
    page.getByRole("button", { name: "Submit for approval" })
  ).toBeVisible()
  expect(await sidewaysScroll(page)).toBe(0)
})
