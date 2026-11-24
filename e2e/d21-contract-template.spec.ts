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

// A Tier 1 project with Workbook 1 locked through D1.16, D1.15's budget at
// GHS 94,400, with its CA, PM and OM.
async function setUp() {
  const project = await makeProject(`Rice Mill ${tag()}`)
  const ca = await makePerson(`Gifty ${tag()}`)
  const pm = await makePerson(`Ama ${tag()}`)
  const om = await makePerson(`Kofi ${tag()}`)

  await giveRoles(ca.id, project.id, ["CA"])
  await giveRoles(pm.id, project.id, ["PM"])
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
    payload: { budget: [{ value: 94400, paymentSchedule: "40% at signing" }] },
  })

  return { project, ca, pm, om }
}

async function open(browser: Browser, email: string, projectId: string) {
  const page = await browser.newPage()

  await signIn(page, email)

  // Buttons only answer once the page has loaded its scripts.
  await page.goto(`/projects/${projectId}/tools/D2.1`, {
    waitUntil: "networkidle",
  })

  return page
}

test("D2.1 starts filled in, with the clauses fixed and their values filled from the project", async ({
  browser,
}) => {
  const { project, ca, pm } = await setUp()
  const page = await open(browser, ca.email, project.id)

  await expect(page.getByLabel("Reviewed By (Legal/Exec)")).toHaveValue(pm.name)
  await expect(page.getByLabel("Governing Jurisdiction")).toHaveValue("Ghana")
  await expect(page.getByLabel("Default Currency")).toHaveValue("GHS")

  const clauses = page.getByRole("table", { name: "Standard legal clauses" })

  await expect(clauses.getByText("2.8", { exact: true })).toBeVisible()
  await expect(
    clauses.getByText(
      'This Engineering Services Agreement ("Agreement") is entered into by and between IMHOGEN LTD ("Service Provider") and Asante Mills ("Client").'
    )
  ).toBeVisible()
  await expect(
    clauses.getByText(
      "Client agrees to pay the total sum of GHS 94,400.00 as follows: [X]% upon execution"
    )
  ).toBeVisible()

  await page.getByLabel("Payable upon Execution (%)").fill("40")
  await expect(
    clauses.getByText(
      "Client agrees to pay the total sum of GHS 94,400.00 as follows: 40% upon execution"
    )
  ).toBeVisible()

  // A standard clause has no box to type in and no Remove.
  await expect(
    clauses.getByLabel("Clause Category, row 1", { exact: true })
  ).toHaveCount(0)
  await expect(
    clauses.getByRole("button", { name: "Remove row 1" })
  ).toHaveCount(0)

  await expect(
    page.getByRole("button", {
      name: "View Appendix D",
    })
  ).toBeEnabled()
  await page.close()
})

test("the CA adds clause 2.9, archives one and submits, which locks D2.1", async ({
  browser,
}) => {
  test.slow()

  const { project, ca } = await setUp()
  const page = await open(browser, ca.email, project.id)
  const clauses = page.getByRole("table", { name: "Standard legal clauses" })

  await page.getByLabel("Payable upon Execution (%)").fill("40")
  await page.getByRole("button", { name: "Add row" }).click()
  await expect(clauses.getByText("2.9", { exact: true })).toBeVisible()
  await clauses
    .getByLabel("Clause Category, row 9", { exact: true })
    .fill("Site Access")
  await clauses
    .getByLabel("Standard Clause Text, row 9", { exact: true })
    .fill("The Client gives IMHOGEN safe access to the site.")
  await expect(page.getByText("Saved")).toBeVisible()

  await page.getByRole("button", { name: "Submit", exact: true }).click()
  await expect(page.getByText("Submitted and locked.")).toBeVisible()
  await expect(page.getByText("Locked").first()).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Request a change" })
  ).toBeVisible()
  await page.close()
})

test("the PM reads D2.1 without editing it, and the OM cannot open it", async ({
  browser,
}) => {
  const { project, pm, om } = await setUp()

  await addRecord(project.id, "D2.1", "draft", {
    payload: { jurisdiction: "Ghana", currency: "GHS" },
  })

  const pmPage = await open(browser, pm.email, project.id)

  await expect(pmPage.getByLabel("Default Currency")).toBeDisabled()
  await expect(
    pmPage.getByRole("button", { name: "Submit", exact: true })
  ).toHaveCount(0)
  await pmPage.close()

  const omPage = await browser.newPage()

  await signIn(omPage, om.email)

  const response = await omPage.goto(`/projects/${project.id}/tools/D2.1`)

  expect(response?.status()).toBe(404)
  await omPage.close()
})

test("at 375px D2.1 does not scroll sideways", async ({ page }) => {
  const { project, ca } = await setUp()

  await page.setViewportSize({ width: 375, height: 800 })
  await signIn(page, ca.email)
  await page.goto(`/projects/${project.id}/tools/D2.1`, {
    waitUntil: "networkidle",
  })

  await expect(page.getByRole("button", { name: "Submit" })).toBeVisible()
  expect(await sidewaysScroll(page)).toBe(0)
})
