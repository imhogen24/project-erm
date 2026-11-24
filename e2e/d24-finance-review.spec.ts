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

// A Tier 1 project with Workbook 1, D2.1, the CA's D2.2 and the PM's D2.3
// locked as Approved, with D1.14's minimum overhead met, and its FO, PM, CA,
// CR and OM.
async function setUp() {
  const project = await makeProject(`Rice Mill ${tag()}`)
  const fo = await makePerson(`Esi ${tag()}`)
  const pm = await makePerson(`Ama ${tag()}`)
  const ca = await makePerson(`Gifty ${tag()}`)
  const cr = await makePerson(`Yaw ${tag()}`)
  const om = await makePerson(`Kofi ${tag()}`)

  await giveRoles(fo.id, project.id, ["FO"])
  await giveRoles(pm.id, project.id, ["PM"])
  await giveRoles(ca.id, project.id, ["CA"])
  await giveRoles(cr.id, project.id, ["CR"])
  await giveRoles(om.id, project.id, ["OM"])
  await addClientRequest(project.id, { organization_name: "Asante Mills" })
  await lockEarlierTools(project.id)

  for (const toolId of ["D1.8", "D1.9", "D1.12", "D1.13", "D1.15", "D1.16"]) {
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
  await addRecord(project.id, "D2.1", "locked")
  await addRecord(project.id, "D2.2", "locked", {
    payload: { initialDraftComplete: "Yes", readyForPmReview: "Yes" },
    submittedBy: ca.id,
  })
  await addRecord(project.id, "D2.3", "locked", {
    payload: { operationalStatus: "Approved" },
    submittedBy: pm.id,
  })

  return { project, fo, pm, ca, cr, om }
}

async function open(
  browser: Browser,
  email: string,
  projectId: string,
  toolId = "D2.4"
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

test("D2.4 starts from the sheet's rows, shows D1.14's answer in row 2.2, and its directive follows the status", async ({
  browser,
}) => {
  const { project, fo } = await setUp()
  const page = await open(browser, fo.email, project.id)

  await expect(page.locator("#financeOfficer")).toHaveText(fo.name)
  await expect(
    page.getByRole("button", { name: "View Reference Draft" })
  ).toBeEnabled()
  await expect(
    page.getByRole("button", { name: "View PM Review (D2.3 Edits)" })
  ).toBeEnabled()

  const value = page.getByRole("table", {
    name: "2.0 Project value & margin verification",
  })

  await expect(
    value.getByLabel("Financial Element, row 1", { exact: true })
  ).toHaveValue("Total Contract Value (GHS) matches D1.15?")
  await expect(
    value.getByLabel("Contract Clause Ref, row 1", { exact: true })
  ).toHaveAttribute("placeholder", "e.g. Section 3.1")

  // Row 2.2 reads D1.14's answer and has no field to type in.
  await expect(
    value.getByLabel("Contract Clause Ref, row 2", { exact: true })
  ).toHaveCount(0)
  await expect(
    value.getByRole("cell").filter({ hasText: "Contract Clause Ref, row 2" })
  ).toContainText("Yes")

  await value
    .getByLabel("Financial Element, row 3", { exact: true })
    .fill("Currency (GHS) and VAT stated?")
  await expect(
    value.getByLabel("Financial Element, row 3", { exact: true })
  ).toHaveValue("Currency (GHS) and VAT stated?")

  await expect(value.getByRole("button", { name: /^Remove row/ })).toHaveCount(
    0
  )
  await value.getByRole("button", { name: "Add row" }).click()
  await expect(value.getByText("2.4", { exact: true })).toBeVisible()
  await expect(
    value.getByRole("button", { name: "Remove row 4" }).first()
  ).toBeAttached()

  await expect(page.locator("#nextStepDirective")).toHaveText(
    "Shown once a status is chosen"
  )
  await choose(page, "Commercial Verification Status", "Approved")
  await expect(page.locator("#nextStepDirective")).toHaveText(
    "Proceed to Executive Review (D2.5)"
  )
  await choose(page, "Commercial Verification Status", "Revisions Required")
  await expect(page.locator("#nextStepDirective")).toHaveText(
    "Return to Contract Admin for Edits"
  )
  await page.close()
})

test("Revisions Required locks D2.4 and sends D2.2 back to the CA", async ({
  browser,
}) => {
  test.slow()

  const { project, fo, ca } = await setUp()
  const page = await open(browser, fo.email, project.id)

  for (const row of [1, 2, 3]) {
    await choose(page, `Status (Accurate / Mismatch), row ${row}`, "Accurate")
    await choose(page, `Adequately Protected? (Yes/No), row ${row}`, "Yes")
  }

  for (const row of [1, 2, 3, 4]) {
    await choose(page, `Cash Flow Safe? (Yes/No), row ${row}`, "No")
  }

  await choose(page, "Commercial Verification Status", "Revisions Required")
  await expect(page.getByText("Saved")).toBeVisible()

  await page
    .getByRole("button", { name: "Sign Finance Officer Signature" })
    .click()
  await expect(page.getByText(`Signed by ${fo.name}`)).toBeVisible()

  await page.getByRole("button", { name: "Submit", exact: true }).click()
  await expect(page.getByText("Submitted and locked.")).toBeVisible()
  await page.close()

  const draft = await open(browser, ca.email, project.id, "D2.2")

  await expect(
    draft.getByText("D2.4 sent it back: Revisions Required")
  ).toBeVisible()
  await draft.close()
})

test("the PM, CA and CR read D2.4, and the OM cannot open it", async ({
  browser,
}) => {
  const { project, pm, ca, cr, om } = await setUp()

  await addRecord(project.id, "D2.4", "draft", {
    payload: {
      valueVerification: [
        { element: "Total Contract Value (GHS) matches D1.15?" },
      ],
      commercialStatus: "Approved",
    },
  })

  for (const reader of [pm, ca, cr]) {
    const page = await open(browser, reader.email, project.id)

    await expect(page.locator("#nextStepDirective")).toHaveText(
      "Proceed to Executive Review (D2.5)"
    )
    await expect(
      page
        .getByRole("table", { name: "2.0 Project value & margin verification" })
        .getByLabel("Financial Element, row 1", { exact: true })
    ).toBeDisabled()
    await expect(
      page.getByRole("button", { name: "Submit", exact: true })
    ).toHaveCount(0)
    await page.close()
  }

  const omPage = await browser.newPage()

  await signIn(omPage, om.email)

  const response = await omPage.goto(`/projects/${project.id}/tools/D2.4`)

  expect(response?.status()).toBe(404)
  await omPage.close()
})

test("at 375px D2.4 does not scroll sideways", async ({ page }) => {
  const { project, fo } = await setUp()

  await page.setViewportSize({ width: 375, height: 800 })
  await signIn(page, fo.email)
  await page.goto(`/projects/${project.id}/tools/D2.4`, {
    waitUntil: "networkidle",
  })

  await expect(page.getByRole("button", { name: "Submit" })).toBeVisible()
  expect(await sidewaysScroll(page)).toBe(0)
})
