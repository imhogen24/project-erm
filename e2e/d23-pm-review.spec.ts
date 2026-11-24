import { expect, test, type Browser, type Page } from "@playwright/test"

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

// A Tier 1 project with Workbook 1, D2.1 and the CA's D2.2 locked, D1.15
// listing two client dependencies, with its PM, CA, CR and OM.
async function setUp() {
  const project = await makeProject(`Rice Mill ${tag()}`)
  const pm = await makePerson(`Ama ${tag()}`)
  const ca = await makePerson(`Gifty ${tag()}`)
  const cr = await makePerson(`Yaw ${tag()}`)
  const om = await makePerson(`Kofi ${tag()}`)

  await giveRoles(pm.id, project.id, ["PM"])
  await giveRoles(ca.id, project.id, ["CA"])
  await giveRoles(cr.id, project.id, ["CR"])
  await giveRoles(om.id, project.id, ["OM"])
  await addClientRequest(project.id, { organization_name: "Asante Mills" })
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
  await addRecord(project.id, "D1.12", "locked")
  await addRecord(project.id, "D1.14", "locked", {
    payload: { minimumOverheadMet: true },
  })
  await addRecord(project.id, "D1.15", "locked", {
    payload: {
      clientDependencies:
        "Client signs off the CAD before fabrication\nSite access on weekdays",
    },
  })
  await addRecord(project.id, "D2.2", "locked", {
    payload: { initialDraftComplete: "Yes", readyForPmReview: "Yes" },
    submittedBy: ca.id,
  })

  return { project, pm, ca, cr, om }
}

async function open(
  browser: Browser,
  email: string,
  projectId: string,
  toolId = "D2.3"
) {
  const page = await browser.newPage()

  await signIn(page, email)

  // Buttons only answer once the page has loaded its scripts.
  await page.goto(`/projects/${projectId}/tools/${toolId}`, {
    waitUntil: "networkidle",
  })

  return page
}

// A table cell's select is labelled by its column and row; a field's select
// by its label.
async function choose(page: Page, label: string, option: string) {
  const select = label.includes(", row ")
    ? page.getByLabel(label, { exact: true })
    : page.getByRole("combobox", { name: label, exact: true })

  await select.click()
  await page.getByRole("option", { name: option, exact: true }).click()
}

test("D2.3 starts from the sheet's rows and D1.15's dependencies, and its directive follows the status", async ({
  browser,
}) => {
  const { project, pm } = await setUp()
  const page = await open(browser, pm.email, project.id)

  await expect(page.locator("#projectManager")).toHaveText(pm.name)
  await expect(
    page.getByRole("button", { name: "View Reference Draft" })
  ).toBeEnabled()

  const scope = page.getByRole("table", {
    name: "2.0 Scope & deliverables verification",
  })

  await expect(
    scope.getByLabel("Deliverable Category, row 1", { exact: true })
  ).toHaveValue("Engineering Design")
  await expect(
    scope.getByLabel("PM Comments / Required Edits, row 4", { exact: true })
  ).toHaveAttribute("placeholder", "Are boundaries tight enough?")

  const dependencies = page.getByRole("table", {
    name: "4.0 Critical dependencies & client obligations",
  })

  await expect(
    dependencies.getByLabel("Client Dependency required for timeline, row 2", {
      exact: true,
    })
  ).toHaveValue("Site access on weekdays")

  await scope.getByRole("button", { name: "Add row" }).click()
  await expect(scope.getByText("2.5", { exact: true })).toBeVisible()

  await expect(page.locator("#nextStepDirective")).toHaveText(
    "Shown once a status is chosen"
  )
  await choose(page, "Operational Verification Status", "Approved")
  await expect(page.locator("#nextStepDirective")).toHaveText(
    "Proceed to Finance Review (D2.4)"
  )
  await choose(page, "Operational Verification Status", "Revisions Required")
  await expect(page.locator("#nextStepDirective")).toHaveText(
    "Return to Contract Admin for Edits"
  )
  await page.close()
})

test("Revisions Required locks D2.3 and sends D2.2 back to the CA", async ({
  browser,
}) => {
  test.slow()

  const { project, pm, ca } = await setUp()
  const page = await open(browser, pm.email, project.id)

  for (const row of [1, 2, 3, 4]) {
    await choose(page, `Status (Accurate / Mismatch), row ${row}`, "Accurate")
    await choose(page, `Workshop Feasible? (Yes/No), row ${row}`, "Yes")
  }

  for (const row of [1, 2]) {
    await choose(page, `Adequately Protected? (Yes/No), row ${row}`, "No")
  }

  await choose(page, "Operational Verification Status", "Revisions Required")
  await expect(page.getByText("Saved")).toBeVisible()

  await page.getByRole("button", { name: "Sign PM Signature" }).click()
  await expect(page.getByText(`Signed by ${pm.name}`)).toBeVisible()

  await page.getByRole("button", { name: "Submit", exact: true }).click()
  await expect(page.getByText("Submitted and locked.")).toBeVisible()
  await page.close()

  const draft = await open(browser, ca.email, project.id, "D2.2")

  await expect(
    draft.getByText("D2.3 sent it back: Revisions Required")
  ).toBeVisible()
  await expect(
    draft.getByRole("button", { name: "Sign Contract Admin Signature" })
  ).toBeEnabled()
  await draft.close()
})

test("the CA and CR read D2.3, and the OM cannot open it", async ({
  browser,
}) => {
  const { project, ca, cr, om } = await setUp()

  await addRecord(project.id, "D2.3", "draft", {
    payload: {
      scopeVerification: [{ category: "Engineering Design" }],
      operationalStatus: "Approved",
    },
  })

  for (const reader of [ca, cr]) {
    const page = await open(browser, reader.email, project.id)

    await expect(page.locator("#nextStepDirective")).toHaveText(
      "Proceed to Finance Review (D2.4)"
    )
    await expect(
      page
        .getByRole("table", { name: "2.0 Scope & deliverables verification" })
        .getByLabel("Deliverable Category, row 1", { exact: true })
    ).toBeDisabled()
    await expect(
      page.getByRole("button", { name: "Submit", exact: true })
    ).toHaveCount(0)
    await page.close()
  }

  const omPage = await browser.newPage()

  await signIn(omPage, om.email)

  const response = await omPage.goto(`/projects/${project.id}/tools/D2.3`)

  expect(response?.status()).toBe(404)
  await omPage.close()
})

test("at 375px D2.3 does not scroll sideways", async ({ page }) => {
  const { project, pm } = await setUp()

  await page.setViewportSize({ width: 375, height: 800 })
  await signIn(page, pm.email)
  await page.goto(`/projects/${project.id}/tools/D2.3`, {
    waitUntil: "networkidle",
  })

  await expect(page.getByRole("button", { name: "Submit" })).toBeVisible()
  expect(await sidewaysScroll(page)).toBe(0)
})
