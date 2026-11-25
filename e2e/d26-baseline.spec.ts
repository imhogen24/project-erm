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

// A Tier 1 project with Workbook 1, D2.1, the CA's D2.2, the PM's D2.3, the
// FO's D2.4 and the HE's D2.5 locked, the last as Approved for Client
// Transmission, and its CA, PM, FO, HE, CR and OM.
async function setUp() {
  const project = await makeProject(`Rice Mill ${tag()}`)
  const ca = await makePerson(`Gifty ${tag()}`)
  const pm = await makePerson(`Ama ${tag()}`)
  const fo = await makePerson(`Esi ${tag()}`)
  const he = await makePerson(`Kwesi ${tag()}`)
  const cr = await makePerson(`Yaw ${tag()}`)
  const om = await makePerson(`Kofi ${tag()}`)

  await giveRoles(ca.id, project.id, ["CA"])
  await giveRoles(pm.id, project.id, ["PM"])
  await giveRoles(fo.id, project.id, ["FO"])
  await giveRoles(he.id, project.id, ["HE"])
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
    payload: {
      coreVariables: [
        { variable: "Client Legal Entity Name", value: "Asante Mills" },
        { variable: "Primary Client Signatory", value: "Kofi Mensah" },
        { variable: "Total Contract Value (GHS)", value: "GHS 94,400.00" },
        { variable: "Project Duration / Timeline", value: "8 weeks" },
      ],
      initialDraftComplete: "Yes",
      readyForPmReview: "Yes",
    },
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
  await addRecord(project.id, "D2.5", "locked", {
    payload: { executiveDecision: "Approved for Client Transmission" },
    submittedBy: he.id,
  })

  return { project, ca, pm, fo, he, cr, om }
}

async function open(browser: Browser, email: string, projectId: string) {
  const page = await browser.newPage()

  await signIn(page, email)

  // Buttons only answer once the page has loaded its scripts.
  await page.goto(`/projects/${projectId}/tools/D2.6`, {
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

const ready = "Baseline Locked and Ready for Transmittal (D2.7)?"

async function sign(page: Page, name: string) {
  // A 3.0 task says "saved" too, so the save status is found by its role.
  await expect(page.getByRole("status").getByText("Saved")).toBeVisible()
  await page
    .getByRole("button", { name: "Sign Contract Admin Signature" })
    .click()
  await expect(page.getByText(`Signed by ${name}`)).toBeVisible()
}

test("D2.6 shows 1.0 and starts 2.0 from the draft, with fixed rows and hints", async ({
  browser,
}) => {
  const { project, ca } = await setUp()
  const page = await open(browser, ca.email, project.id)

  await expect(page.locator("#projectClientName")).toContainText("Asante Mills")
  await expect(page.locator("#lockExecutedBy")).toHaveText(
    "Filled in when D2.6 is submitted"
  )
  await expect(
    page.getByRole("button", { name: "View Executive Approval Ref" })
  ).toBeEnabled()

  const baseline = page.getByRole("table", {
    name: "2.0 Immutable baseline record (pre-negotiation)",
  })

  // A fixed row's variable is text, not a box to type in.
  await expect(
    baseline.getByRole("cell", { name: /Total Contract Value \(GHS\)$/ })
  ).toBeVisible()
  await expect(
    baseline.getByRole("textbox", { name: "Contract Variable, row 1" })
  ).toHaveCount(0)
  await expect(
    baseline.getByLabel("Baseline Value (Approved in D2.5), row 1", {
      exact: true,
    })
  ).toHaveValue("GHS 94,400.00")
  await expect(
    baseline.getByLabel("Baseline Value (Approved in D2.5), row 3", {
      exact: true,
    })
  ).toHaveValue("8 weeks")
  await expect(
    baseline.getByLabel("Baseline Value (Approved in D2.5), row 2", {
      exact: true,
    })
  ).toHaveAttribute("placeholder", "e.g. 40%")
  await expect(
    baseline.getByLabel(
      "Absolute Limit (Walk-away point during negotiation), row 4",
      { exact: true }
    )
  ).toHaveAttribute("placeholder", /Maximum 60 Days/)

  await baseline.getByRole("button", { name: "Add row" }).click()
  await expect(baseline.getByText("2.5", { exact: true })).toBeVisible()

  const tasks = page.getByRole("table", {
    name: "3.0 Document conversion & archive",
  })

  await expect(
    tasks.getByRole("cell", { name: /Contract Admin$/ }).first()
  ).toBeVisible()
  await expect(
    tasks.getByRole("textbox", { name: "Assignee, row 1" })
  ).toHaveCount(0)
  await page.close()
})

test("D2.6 locks only with every task Done and Yes, and then can never change", async ({
  browser,
}) => {
  test.slow()

  const { project, ca } = await setUp()
  const page = await open(browser, ca.email, project.id)

  const baseline = page.getByRole("table", {
    name: "2.0 Immutable baseline record (pre-negotiation)",
  })

  for (const row of [2, 4]) {
    await baseline
      .getByLabel(`Baseline Value (Approved in D2.5), row ${row}`, {
        exact: true,
      })
      .fill(row === 2 ? "40%" : "30 Days Post-Delivery")
  }

  await choose(page, "Status, row 1", "Done")
  await choose(page, "Status, row 2", "Done")
  await choose(page, "Status, row 3", "Pending")
  await choose(page, ready, "No")
  await sign(page, ca.name)

  await page.getByRole("button", { name: "Submit", exact: true }).click()
  await expect(
    page.getByText("Mark every task Done before locking the baseline")
  ).toBeVisible()
  await expect(
    page.getByText("Answer Yes once the baseline is ready for transmittal")
  ).toBeVisible()

  await choose(page, "Status, row 3", "Done")
  await choose(page, ready, "Yes")
  // Changing an answer clears the signature, so the CA signs again.
  await sign(page, ca.name)
  await page.getByRole("button", { name: "Submit", exact: true }).click()
  await expect(page.getByText("Submitted and locked.")).toBeVisible()
  await expect(page.locator("#lockExecutedBy")).toHaveText(ca.name)
  await expect(
    page.getByRole("button", { name: "Request a change" })
  ).toHaveCount(0)

  // On the project page, D2.6's square offers no change either, while the
  // draft the CA wrote still does.
  await page.goto(`/projects/${project.id}`, { waitUntil: "networkidle" })

  const square = (toolId: string) =>
    page
      .getByRole("listitem")
      .filter({ has: page.getByText(toolId, { exact: true }) })

  await expect(
    square("D2.2").getByRole("button", { name: "Request a change" })
  ).toBeVisible()
  await expect(
    square("D2.6").getByRole("button", { name: "Request a change" })
  ).toHaveCount(0)
  await page.close()
})

test("the PM, FO, HE and CR read D2.6, and the OM cannot open it", async ({
  browser,
}) => {
  const { project, pm, fo, he, cr, om } = await setUp()

  await addRecord(project.id, "D2.6", "draft", {
    payload: { readyForTransmittal: "No" },
  })

  for (const reader of [pm, fo, he, cr]) {
    const page = await open(browser, reader.email, project.id)

    await expect(page.getByRole("combobox", { name: ready })).toBeDisabled()
    await expect(
      page.getByRole("button", { name: "Submit", exact: true })
    ).toHaveCount(0)
    await page.close()
  }

  const omPage = await browser.newPage()

  await signIn(omPage, om.email)

  const response = await omPage.goto(`/projects/${project.id}/tools/D2.6`)

  expect(response?.status()).toBe(404)
  await omPage.close()
})

test("at 375px D2.6 does not scroll sideways", async ({ page }) => {
  const { project, ca } = await setUp()

  await page.setViewportSize({ width: 375, height: 800 })
  await signIn(page, ca.email)
  await page.goto(`/projects/${project.id}/tools/D2.6`, {
    waitUntil: "networkidle",
  })

  await expect(page.getByRole("button", { name: "Submit" })).toBeVisible()
  expect(await sidewaysScroll(page)).toBe(0)
})
