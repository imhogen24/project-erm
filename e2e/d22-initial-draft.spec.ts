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

// A Tier 1 project with Workbook 1 and D2.1 locked, D1.15 holding two phases
// and two budget lines, with its CA, PM, CR and OM.
async function setUp() {
  const project = await makeProject(`Rice Mill ${tag()}`)
  const ca = await makePerson(`Gifty ${tag()}`)
  const pm = await makePerson(`Ama ${tag()}`)
  const cr = await makePerson(`Yaw ${tag()}`)
  const om = await makePerson(`Kofi ${tag()}`)

  await giveRoles(ca.id, project.id, ["CA"])
  await giveRoles(pm.id, project.id, ["PM"])
  await giveRoles(cr.id, project.id, ["CR"])
  await giveRoles(om.id, project.id, ["OM"])
  await addClientRequest(project.id, {
    organization_name: "Asante Mills",
    contact_person: "Kwame Asante",
  })
  await lockEarlierTools(project.id)

  for (const toolId of ["D1.8", "D1.9", "D1.13", "D1.16", "D2.1"]) {
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
  await addRecord(project.id, "D1.14", "locked", {
    payload: { minimumOverheadMet: true },
  })
  await addRecord(project.id, "D1.15", "locked", {
    payload: {
      phases: [
        { deliverables: "Survey and drawings", duration: "3 weeks" },
        { deliverables: "Fabrication", duration: "6 weeks" },
      ],
      budget: [
        { value: 60000, paymentSchedule: "40% at signing" },
        { value: 34400, paymentSchedule: "60% on handover" },
      ],
    },
  })

  return { project, ca, pm, cr, om }
}

async function open(browser: Browser, email: string, projectId: string) {
  const page = await browser.newPage()

  await signIn(page, email)

  // Buttons only answer once the page has loaded its scripts.
  await page.goto(`/projects/${projectId}/tools/D2.2`, {
    waitUntil: "networkidle",
  })

  return page
}

test("D2.2 starts from the project's figures, with each source's PDF to view", async ({
  browser,
}) => {
  const { project, ca, pm } = await setUp()
  const page = await open(browser, ca.email, project.id)

  await expect(page.locator("#projectManager")).toHaveText(pm.name)
  await expect(page.locator("#projectValue")).toHaveText("GHS 94,400.00")

  const core = page.getByRole("table", { name: "2.0 Core contract variables" })

  await expect(
    core.getByLabel("Value / Input to map into Contract, row 1", {
      exact: true,
    })
  ).toHaveValue("Asante Mills")
  await expect(
    core.getByLabel("Value / Input to map into Contract, row 2", {
      exact: true,
    })
  ).toHaveValue("Kwame Asante")
  await expect(
    core.getByLabel("Value / Input to map into Contract, row 3", {
      exact: true,
    })
  ).toHaveValue("GHS 94,400.00")
  await expect(
    core.getByLabel("Value / Input to map into Contract, row 4", {
      exact: true,
    })
  ).toHaveValue("8 weeks")

  const payments = page.getByRole("table", {
    name: "3.0 Payment milestones (from D1.15)",
  })

  await expect(
    payments.getByLabel("Payment Schedule, row 2", { exact: true })
  ).toHaveValue("60% on handover")
  await expect(
    payments.getByLabel("Payment Schedule, row 3", { exact: true })
  ).toHaveValue("")

  const deliverables = page.getByRole("table", {
    name: "5.0 Project deliverables (from D1.15)",
  })

  await expect(deliverables.getByText("Survey and drawings")).toBeVisible()

  // Each source opens its PDF beside the sheet.
  await page
    .getByRole("button", {
      name: "View Source Reference for Total Contract Value (GHS)",
    })
    .click()
  await expect(
    page.getByRole("dialog").getByTitle("D1.15 Project Brief & Draft Budget")
  ).toBeVisible()
  await page.getByRole("dialog").getByRole("button", { name: "Close" }).click()

  await expect(
    page.getByRole("button", { name: "View Reference Hand-off (D1.16)" })
  ).toBeEnabled()
  await page.close()
})

test("the CA adds a row, is refused with a No, and submits with both Yes", async ({
  browser,
}) => {
  test.slow()

  const { project, ca } = await setUp()
  const page = await open(browser, ca.email, project.id)
  const core = page.getByRole("table", { name: "2.0 Core contract variables" })

  // The sheet's rows cannot be removed; an added one can.
  await expect(core.getByRole("button", { name: "Remove row 1" })).toHaveCount(
    0
  )
  await core.getByRole("button", { name: "Add row" }).click()
  await expect(core.getByText("2.5", { exact: true })).toBeVisible()
  await core
    .getByLabel("Variable Required, row 5", { exact: true })
    .fill("Retention")
  await core
    .getByLabel("Value / Input to map into Contract, row 5", { exact: true })
    .fill("5% for 90 days")
  await expect(core.getByRole("button", { name: "Remove row 5" })).toHaveCount(
    1
  )

  for (const [table, column] of [
    ["3.0 Payment milestones (from D1.15)", "Payment Schedule"],
    ["4.0 Project milestones (from D1.15)", "Contracted Timeline"],
  ] as const) {
    await page
      .getByRole("table", { name: table })
      .getByLabel(`${column}, row 3`, { exact: true })
      .fill("To be agreed")
  }

  const attachments = page.getByRole("table", {
    name: "7.0 Appendix attachment verification",
  })

  for (const row of [1, 2, 3]) {
    await attachments.getByLabel(`Status, row ${row}`, { exact: true }).click()
    await page.getByRole("option", { name: "Attached" }).click()
  }

  await page.getByLabel("Initial Draft Complete?").click()
  await page.getByRole("option", { name: "Yes" }).click()
  await page.getByLabel("Ready for PM Review (D2.3)?").click()
  await page.getByRole("option", { name: "No" }).click()
  await expect(page.getByText("Saved")).toBeVisible()

  await page
    .getByRole("button", { name: "Sign Contract Admin Signature" })
    .click()
  await expect(page.getByText(`Signed by ${ca.name}`)).toBeVisible()

  await page.getByRole("button", { name: "Submit", exact: true }).click()
  await expect(
    page.getByText("Answer Yes once the draft is ready for the PM's review")
  ).toBeVisible()

  await page.getByLabel("Ready for PM Review (D2.3)?").click()
  await page.getByRole("option", { name: "Yes" }).click()
  await expect(page.getByText("Saved")).toBeVisible()

  // Changing an answer clears the signature, so the CA signs again.
  await page
    .getByRole("button", { name: "Sign Contract Admin Signature" })
    .click()
  await expect(page.getByText(`Signed by ${ca.name}`)).toBeVisible()

  await page.getByRole("button", { name: "Submit", exact: true }).click()
  await expect(page.getByText("Submitted and locked.")).toBeVisible()
  await expect(page.locator("#draftedBy")).toHaveText(ca.name)
  await expect(
    page.getByRole("button", { name: "Request a change" })
  ).toBeVisible()
  await page.close()
})

test("the PM and CR read D2.2 with its PDFs, and the OM cannot open it", async ({
  browser,
}) => {
  const { project, pm, cr, om } = await setUp()

  await addRecord(project.id, "D2.2", "draft", {
    payload: { initialDraftComplete: "Yes" },
  })

  for (const reader of [pm, cr]) {
    const page = await open(browser, reader.email, project.id)

    await expect(
      page
        .getByRole("table", { name: "2.0 Core contract variables" })
        .getByLabel("Value / Input to map into Contract, row 1", {
          exact: true,
        })
    ).toBeDisabled()
    await expect(
      page.getByRole("button", {
        name: "View Source Reference for Total Contract Value (GHS)",
      })
    ).toBeEnabled()
    await expect(
      page.getByRole("button", { name: "Submit", exact: true })
    ).toHaveCount(0)
    await page.close()
  }

  const omPage = await browser.newPage()

  await signIn(omPage, om.email)

  const response = await omPage.goto(`/projects/${project.id}/tools/D2.2`)

  expect(response?.status()).toBe(404)
  await omPage.close()
})

test("at 375px D2.2 does not scroll sideways", async ({ page }) => {
  const { project, ca } = await setUp()

  await page.setViewportSize({ width: 375, height: 800 })
  await signIn(page, ca.email)
  await page.goto(`/projects/${project.id}/tools/D2.2`, {
    waitUntil: "networkidle",
  })

  await expect(page.getByRole("button", { name: "Submit" })).toBeVisible()
  expect(await sidewaysScroll(page)).toBe(0)
})
