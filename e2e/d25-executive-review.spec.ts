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

// A Tier 1 project with Workbook 1, D2.1, the CA's D2.2, the PM's D2.3 and the
// FO's D2.4 locked as Approved, and its HE, PM, FO, CA, CR and OM.
async function setUp() {
  const project = await makeProject(`Rice Mill ${tag()}`)
  const he = await makePerson(`Kwesi ${tag()}`)
  const pm = await makePerson(`Ama ${tag()}`)
  const fo = await makePerson(`Esi ${tag()}`)
  const ca = await makePerson(`Gifty ${tag()}`)
  const cr = await makePerson(`Yaw ${tag()}`)
  const om = await makePerson(`Kofi ${tag()}`)

  await giveRoles(he.id, project.id, ["HE"])
  await giveRoles(pm.id, project.id, ["PM"])
  await giveRoles(fo.id, project.id, ["FO"])
  await giveRoles(ca.id, project.id, ["CA"])
  await giveRoles(cr.id, project.id, ["CR"])
  await giveRoles(om.id, project.id, ["OM"])
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
  await addRecord(project.id, "D2.2", "locked", {
    payload: { initialDraftComplete: "Yes", readyForPmReview: "Yes" },
    submittedBy: ca.id,
  })
  await addRecord(project.id, "D2.3", "locked", {
    payload: { operationalStatus: "Approved" },
    submittedBy: pm.id,
  })
  await addRecord(project.id, "D2.4", "locked", {
    payload: { commercialStatus: "Approved" },
    submittedBy: fo.id,
  })

  return { project, he, pm, fo, ca, cr, om }
}

async function open(
  browser: Browser,
  email: string,
  projectId: string,
  toolId = "D2.5"
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

const strategy =
  "Does this project align with IMHO GEN's long-term strategic objectives for 2026?"

// Answers every starting row and the strategy question.
async function answerAll(page: Page) {
  for (const row of [1, 2, 3]) {
    await choose(page, `Status (Verified / Missing), row ${row}`, "Verified")
  }

  for (const row of [1, 2, 3, 4]) {
    await choose(page, `Status (Yes/No), row ${row}`, "Yes")
  }

  await choose(page, strategy, "Yes")
}

async function signAndSubmit(page: Page, name: string) {
  await expect(page.getByText("Saved")).toBeVisible()
  await page
    .getByRole("button", { name: "Sign Head of R&D / Ops Signature" })
    .click()
  await expect(page.getByText(`Signed by ${name}`)).toBeVisible()
  await page.getByRole("button", { name: "Submit", exact: true }).click()
  await expect(page.getByText("Submitted and locked.")).toBeVisible()
}

test("D2.5 shows 1.0, starts from the sheet's rows, and its directive follows the decision", async ({
  browser,
}) => {
  const { project, he } = await setUp()
  const page = await open(browser, he.email, project.id)

  await expect(page.locator("#executive")).toHaveText(he.name)
  await expect(page.locator("#projectValue")).toHaveText("GHS 94,400.00")
  await expect(
    page.getByRole("button", { name: "View Reference Draft" })
  ).toBeEnabled()
  await expect(
    page.getByRole("button", {
      name: "View Finance Review (D2.4 Finance Approved)",
    })
  ).toBeEnabled()

  const risks = page.getByRole("table", {
    name: "3.0 Macro risk assessment (executive level)",
  })

  await expect(
    risks.getByLabel("Risk Category, row 1", { exact: true })
  ).toHaveValue("Technical & Scope Risk")
  await expect(
    risks.getByLabel("Executive Assessment Question, row 2", { exact: true })
  ).toHaveValue(
    "Does the timeline allow sufficient buffer for Kumasi supply chain delays?"
  )

  await risks
    .getByLabel("Executive Assessment Question, row 2", { exact: true })
    .fill("Is there a two-week supply buffer?")
  await expect(
    risks.getByLabel("Executive Assessment Question, row 2", { exact: true })
  ).toHaveValue("Is there a two-week supply buffer?")

  await expect(risks.getByRole("button", { name: /^Remove row/ })).toHaveCount(
    0
  )
  await risks.getByRole("button", { name: "Add row" }).click()
  await expect(risks.getByText("3.5", { exact: true })).toBeVisible()

  await expect(
    page.getByLabel("Executive Justification for Acceptance")
  ).toHaveAttribute("placeholder", /critical foothold/)

  await expect(page.locator("#nextStepDirective")).toHaveText(
    "Shown once a decision is chosen"
  )
  await choose(page, "Executive Decision", "Approved for Client Transmission")
  await expect(page.locator("#nextStepDirective")).toHaveText(
    "Proceed to D2.6 (Lock Draft) and D2.7 (Client Transmittal)"
  )
  await choose(page, "Executive Decision", "Rejected")
  await expect(page.locator("#nextStepDirective")).toHaveText("Project Closed")
  await choose(page, "Executive Decision", "Hold for Revision")
  await expect(page.locator("#nextStepDirective")).toHaveText(
    "Return to Contract Admin for Edits"
  )
  await page.close()
})

test("Hold for Revision locks D2.5 and sends D2.2 back to the CA", async ({
  browser,
}) => {
  test.slow()

  const { project, he, ca } = await setUp()
  const page = await open(browser, he.email, project.id)

  await answerAll(page)
  await choose(page, "Executive Decision", "Hold for Revision")
  await signAndSubmit(page, he.name)
  await page.close()

  const draft = await open(browser, ca.email, project.id, "D2.2")

  await expect(
    draft.getByText("D2.5 sent it back: Hold for Revision")
  ).toBeVisible()
  await draft.close()
})

test("Rejected locks D2.5 and closes the project", async ({ browser }) => {
  test.slow()

  const { project, he } = await setUp()
  const page = await open(browser, he.email, project.id)

  await answerAll(page)
  await choose(page, "Executive Decision", "Rejected")
  await signAndSubmit(page, he.name)

  await page.close()

  expect(await projectStatusOf(project.id)).toBe("closed")
})

test("the PM, FO, CA and CR read D2.5, and the OM cannot open it", async ({
  browser,
}) => {
  const { project, pm, fo, ca, cr, om } = await setUp()

  await addRecord(project.id, "D2.5", "draft", {
    payload: {
      riskAssessment: [{ category: "Technical & Scope Risk" }],
      executiveDecision: "Rejected",
    },
  })

  for (const reader of [pm, fo, ca, cr]) {
    const page = await open(browser, reader.email, project.id)

    await expect(page.locator("#nextStepDirective")).toHaveText(
      "Project Closed"
    )
    await expect(
      page
        .getByRole("table", {
          name: "3.0 Macro risk assessment (executive level)",
        })
        .getByLabel("Risk Category, row 1", { exact: true })
    ).toBeDisabled()
    await expect(
      page.getByRole("button", { name: "Submit", exact: true })
    ).toHaveCount(0)
    await page.close()
  }

  const omPage = await browser.newPage()

  await signIn(omPage, om.email)

  const response = await omPage.goto(`/projects/${project.id}/tools/D2.5`)

  expect(response?.status()).toBe(404)
  await omPage.close()
})

test("at 375px D2.5 does not scroll sideways", async ({ page }) => {
  const { project, he } = await setUp()

  await page.setViewportSize({ width: 375, height: 800 })
  await signIn(page, he.email)
  await page.goto(`/projects/${project.id}/tools/D2.5`, {
    waitUntil: "networkidle",
  })

  await expect(page.getByRole("button", { name: "Submit" })).toBeVisible()
  expect(await sidewaysScroll(page)).toBe(0)
})
