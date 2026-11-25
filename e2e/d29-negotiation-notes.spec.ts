import { expect, test, type Browser, type Page } from "@playwright/test"

import {
  addClientRequest,
  addRecord,
  giveRoles,
  lockEarlierTools,
  makePerson,
  makeProject,
  projectStatusOf,
  sidewaysScroll,
  signIn,
  tag,
} from "./support/data"

const LIMIT = "Min viable is GHS 90,000"

// A Tier 1 project with Workbook 1 and D2.1 to D2.8 locked, and its CA, PM,
// HE, CR, OM and client.
async function setUp() {
  const project = await makeProject(`Rice Mill ${tag()}`)
  const ca = await makePerson(`Gifty ${tag()}`)
  const pm = await makePerson(`Ama ${tag()}`)
  const he = await makePerson(`Kwesi ${tag()}`)
  const cr = await makePerson(`Yaw ${tag()}`)
  const om = await makePerson(`Kofi ${tag()}`)
  const client = await makePerson(`Kwaku ${tag()}`)

  await giveRoles(ca.id, project.id, ["CA"])
  await giveRoles(pm.id, project.id, ["PM"])
  await giveRoles(he.id, project.id, ["HE"])
  await giveRoles(cr.id, project.id, ["CR"])
  await giveRoles(om.id, project.id, ["OM"])
  await giveRoles(client.id, project.id, ["Client"])
  await addClientRequest(project.id, { organization_name: "Asante Mills" })
  await lockEarlierTools(project.id)

  for (const toolId of ["D1.8", "D1.9", "D1.12", "D1.13", "D1.16"]) {
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
    payload: { budget: [{ value: 60000 }, { value: 34400 }] },
  })
  await addRecord(project.id, "D2.1", "locked")
  await addRecord(project.id, "D2.2", "locked", { submittedBy: ca.id })
  await addRecord(project.id, "D2.3", "locked", {
    payload: { operationalStatus: "Approved" },
    submittedBy: pm.id,
  })
  await addRecord(project.id, "D2.4", "locked", {
    payload: { commercialStatus: "Approved" },
  })
  await addRecord(project.id, "D2.5", "locked", {
    payload: { executiveDecision: "Approved for Client Transmission" },
  })
  await addRecord(project.id, "D2.6", "locked", { submittedBy: ca.id })
  await addRecord(project.id, "D2.7", "locked", {
    payload: { initialResponse: "Requested Negotiation" },
  })
  await addRecord(project.id, "D2.8", "locked", {
    payload: {
      proposedDate: "2026-12-01",
      meetingTime: "10:00",
      platform: "Google Meet",
      script: "Dear Asante Mills",
      inviteSentAt: "2026-11-25T09:00:00.000Z",
      clientConfirmed: "Yes",
      preMeetHeld: "Yes",
      readyForMeeting: "Yes",
    },
    submittedBy: ca.id,
  })

  return { project, ca, pm, he, cr, om, client }
}

async function open(
  browser: Browser,
  email: string,
  projectId: string,
  toolId = "D2.9"
) {
  const page = await browser.newPage()

  await signIn(page, email)

  // Buttons only answer once the page has loaded its scripts.
  await page.goto(`/projects/${projectId}/tools/${toolId}`, {
    waitUntil: "networkidle",
  })

  return page
}

async function choose(page: Page, label: string, option: string) {
  await page.getByRole("combobox", { name: label, exact: true }).click()
  await page.getByRole("option", { name: option, exact: true }).click()
}

function tracker(page: Page) {
  return page.getByRole("table", {
    name: "2.0 Live redline & negotiation tracker",
  })
}

// Fills 2.0's first row.
async function fillClause(page: Page) {
  const table = tracker(page)

  await table
    .getByLabel("Contract Clause in Question, row 1", { exact: true })
    .fill("Sec 3.1 - Total Value")
  await table
    .getByLabel("Client's Requested Change, row 1", { exact: true })
    .fill("Wants 10% discount on final price")
  await table
    .getByLabel("IMHOGEN's Baseline Limit (From D2.6), row 1", { exact: true })
    .fill(LIMIT)
  await table
    .getByLabel("Final Agreed Resolution / Concession, row 1", { exact: true })
    .fill("Agreed to 5% discount")
}

async function signAndSubmit(page: Page, name: string) {
  await expect(page.getByRole("status").getByText("Saved")).toBeVisible()
  await page
    .getByRole("button", { name: "Sign Lead Negotiator Signature" })
    .click()
  await expect(page.getByText(`Signed by ${name}`)).toBeVisible()
  await page.getByRole("button", { name: "Submit", exact: true }).click()
  await expect(page.getByText("Submitted and locked.")).toBeVisible()
}

test("D2.9 starts on D2.8's date with one empty row in 2.0 and 3.0, and locks on Terms Agreed", async ({
  browser,
}) => {
  test.slow()

  const { project, ca } = await setUp()
  const page = await open(browser, ca.email, project.id)

  await expect(page.locator("#actualDate")).toHaveText("1 Dec 2026")
  await expect(page.getByLabel("Start / End Time")).toHaveAttribute(
    "placeholder",
    "00:00 to 00:00"
  )

  const table = tracker(page)

  await expect(table.getByText("2.1", { exact: true })).toBeVisible()
  await expect(
    table.getByLabel("Contract Clause in Question, row 1", { exact: true })
  ).toHaveAttribute("placeholder", "e.g. Sec 3.1 - Total Value")
  await table.getByRole("button", { name: "Add row" }).click()
  await expect(table.getByText("2.2", { exact: true })).toBeVisible()
  await table
    .getByRole("button", { name: /^Remove row/ })
    .last()
    .click()
  await expect(table.getByText("2.2", { exact: true })).toHaveCount(0)

  const parking = page.getByRole("table", {
    name: "3.0 Parking lot (Unresolved contract items)",
  })

  await expect(
    parking.getByLabel("Item Description, row 1", { exact: true })
  ).toBeVisible()

  await fillClause(page)
  await expect(page.getByRole("status").getByText("Saved")).toBeVisible()
  await page.getByRole("button", { name: "Submit", exact: true }).click()
  await expect(
    page.getByRole("combobox", { name: "Meeting Outcome" })
  ).toHaveAttribute("aria-invalid", "true")

  await choose(page, "Meeting Outcome", "Terms Agreed - Proceed to D2.10")
  await signAndSubmit(page, ca.name)

  expect(await projectStatusOf(project.id)).toBe("active")
  await page.close()
})

test("Deadlock locks D2.9 and sends D2.8 back to the CA", async ({
  browser,
}) => {
  test.slow()

  const { project, ca } = await setUp()
  const page = await open(browser, ca.email, project.id)

  await fillClause(page)
  await choose(page, "Meeting Outcome", "Deadlock - Escalate")
  await signAndSubmit(page, ca.name)
  await page.close()

  const invite = await open(browser, ca.email, project.id, "D2.8")

  await expect(
    invite.getByText("D2.9 sent it back: Deadlock - Escalate")
  ).toBeVisible()
  await invite.close()
})

test("Client Withdrawn locks D2.9 and closes the project", async ({
  browser,
}) => {
  test.slow()

  const { project, ca } = await setUp()
  const page = await open(browser, ca.email, project.id)

  await fillClause(page)
  await choose(page, "Meeting Outcome", "Client Withdrawn")
  await signAndSubmit(page, ca.name)
  await page.close()

  expect(await projectStatusOf(project.id)).toBe("closed")
})

test("the client reads 2.0 without IMHOGEN's limit; the PM, HE and CR read all of it; the OM cannot open it", async ({
  browser,
}) => {
  const { project, pm, he, cr, om, client } = await setUp()

  await addRecord(project.id, "D2.9", "draft", {
    payload: {
      redlines: [
        {
          clause: "Sec 3.1 - Total Value",
          requestedChange: "Wants 10% discount on final price",
          baselineLimit: LIMIT,
          resolution: "Agreed to 5% discount",
        },
      ],
    },
  })

  const clientPage = await open(browser, client.email, project.id)

  await expect(clientPage.getByText("Agreed to 5% discount")).toBeVisible()
  await expect(
    clientPage.getByText("IMHOGEN's Baseline Limit (From D2.6)")
  ).toHaveCount(0)
  await expect(clientPage.getByText(LIMIT)).toHaveCount(0)
  await clientPage.close()

  for (const reader of [pm, he, cr]) {
    const page = await open(browser, reader.email, project.id)

    await expect(
      tracker(page).getByLabel("IMHOGEN's Baseline Limit (From D2.6), row 1", {
        exact: true,
      })
    ).toHaveValue(LIMIT)
    await expect(
      page.getByRole("combobox", { name: "Meeting Outcome" })
    ).toBeDisabled()
    await page.close()
  }

  const omPage = await browser.newPage()

  await signIn(omPage, om.email)

  const result = await omPage.goto(`/projects/${project.id}/tools/D2.9`)

  expect(result?.status()).toBe(404)
  await omPage.close()
})

test("at 375px D2.9 does not scroll sideways", async ({ page }) => {
  const { project, ca } = await setUp()

  await page.setViewportSize({ width: 375, height: 800 })
  await signIn(page, ca.email)
  await page.goto(`/projects/${project.id}/tools/D2.9`, {
    waitUntil: "networkidle",
  })

  await expect(page.getByRole("button", { name: "Submit" })).toBeVisible()
  expect(await sidewaysScroll(page)).toBe(0)
})
