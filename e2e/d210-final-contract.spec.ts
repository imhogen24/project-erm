import {
  expect,
  test,
  type Browser,
  type Locator,
  type Page,
} from "@playwright/test"

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

const reCheck =
  "Has the new pricing structure been verified to ensure minimum overhead recovery?"

const ready = "Contract finalized and ready for signature routing (D2.11)?"

// A Tier 1 project with Workbook 1 and D2.1 to D2.7 locked, D2.7 with the
// client's reply, and, when they negotiated, D2.8 and D2.9 locked with Terms
// Agreed. Its CA, FO, PM and OM.
async function setUp(negotiated = true) {
  const project = await makeProject(`Rice Mill ${tag()}`)
  const ca = await makePerson(`Gifty ${tag()}`)
  const fo = await makePerson(`Esi ${tag()}`)
  const pm = await makePerson(`Ama ${tag()}`)
  const om = await makePerson(`Kofi ${tag()}`)

  await giveRoles(ca.id, project.id, ["CA"])
  await giveRoles(fo.id, project.id, ["FO"])
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
    payload: {
      initialResponse: negotiated ? "Requested Negotiation" : "Accepted as-is",
    },
  })

  if (negotiated) {
    await addRecord(project.id, "D2.8", "locked")
    await addRecord(project.id, "D2.9", "locked", {
      payload: {
        redlines: [
          {
            clause: "Sec 3.1 - Total Value",
            requestedChange: "Wants 10% discount",
            baselineLimit: "Min viable is GHS 90,000",
            resolution: "Agreed to 5% discount",
          },
          {
            clause: "Sec 4.1 - Timeline",
            requestedChange: "Wants 6 weeks",
            baselineLimit: "Min 7 weeks",
            resolution: "IMHOGEN held firm at 7 weeks",
          },
        ],
        meetingOutcome: "Terms Agreed - Proceed to D2.10",
      },
      submittedBy: ca.id,
    })
  }

  return { project, ca, fo, pm, om }
}

async function open(browser: Browser, email: string, projectId: string) {
  const page = await browser.newPage()

  await signIn(page, email)

  // Buttons only answer once the page has loaded its scripts.
  await page.goto(`/projects/${projectId}/tools/D2.10`, {
    waitUntil: "networkidle",
  })

  return page
}

async function choose(
  scope: Page | Locator,
  page: Page,
  label: string,
  option: string
) {
  const select = label.includes(", row ")
    ? scope.getByLabel(label, { exact: true })
    : scope.getByRole("combobox", { name: label, exact: true })

  await select.click()
  await page.getByRole("option", { name: option, exact: true }).click()
}

function amendments(page: Page) {
  return page.getByRole("table", { name: "2.0 Negotiation amendment tracker" })
}

function tasks(page: Page) {
  return page.getByRole("table", { name: "4.0 Document conversion & lock" })
}

async function finishTasks(page: Page) {
  for (const row of [1, 2]) {
    await choose(tasks(page), page, `Status, row ${row}`, "Done")
  }

  await choose(page, page, ready, "Yes")
}

async function signAndSubmit(page: Page, name: string) {
  await expect(page.getByRole("status").getByText("Saved")).toBeVisible()
  await page
    .getByRole("button", { name: "Sign Contract Admin Signature" })
    .click()
  await expect(page.getByText(`Signed by ${name}`)).toBeVisible()
  await page.getByRole("button", { name: "Submit", exact: true }).click()
}

test("D2.10 starts on D2.9's concessions, and the FO signs 3.0 before it locks", async ({
  browser,
}) => {
  test.slow()

  const { project, ca, fo } = await setUp()
  const page = await open(browser, ca.email, project.id)
  const table = amendments(page)

  await expect(
    table.getByLabel("Agreed Concession (From D2.9), row 1", { exact: true })
  ).toHaveValue("Agreed to 5% discount")
  await expect(
    table.getByLabel("Agreed Concession (From D2.9), row 2", { exact: true })
  ).toHaveValue("IMHOGEN held firm at 7 weeks")
  await table.getByRole("button", { name: "Add row" }).click()
  await expect(table.getByText("2.3", { exact: true })).toBeVisible()
  await table
    .getByRole("button", { name: /^Remove row/ })
    .last()
    .click()

  await expect(
    page.getByRole("button", { name: "View Reference Meeting Notes" })
  ).toBeEnabled()
  await expect(page.getByText(reCheck)).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Sign Finance Rep" })
  ).toHaveCount(0)
  await expect(
    tasks(page).getByRole("textbox", { name: "Assignee, row 1" })
  ).toHaveCount(0)

  for (const row of [1, 2]) {
    await table
      .getByLabel(`Contract Section Updated, row ${row}`, { exact: true })
      .fill(`Section ${row + 2}.1`)
    await table
      .getByLabel(`New Contract Text Inserted (Exact Wording), row ${row}`, {
        exact: true,
      })
      .fill("Total Contract Value is GHS 89,680.00")
  }

  await finishTasks(page)
  await signAndSubmit(page, ca.name)
  await expect(
    page.getByText("Mark every amendment Updated before finalizing")
  ).toBeVisible()

  // Editing clears the signatures, so the CA signs again after.
  for (const row of [1, 2]) {
    await choose(table, page, `Status, row ${row}`, "Updated")
  }

  await signAndSubmit(page, ca.name)

  // The FO's signature is a row of 3.0's table, and says it is missing there.
  await expect(
    page
      .getByRole("row")
      .filter({ hasText: "Finance Rep" })
      .getByText("Must be signed")
  ).toBeVisible()

  // The FO reads it, and signs 3.0.
  const foPage = await open(browser, fo.email, project.id)

  await expect(
    amendments(foPage).getByLabel("Agreed Concession (From D2.9), row 1", {
      exact: true,
    })
  ).toBeDisabled()
  await foPage.getByRole("button", { name: "Sign Finance Rep" }).click()
  await expect(foPage.getByText(`Signed by ${fo.name}`)).toBeVisible()
  await foPage.close()

  await page.reload({ waitUntil: "networkidle" })
  await page.getByRole("button", { name: "Submit", exact: true }).click()
  await expect(page.getByText("Submitted and locked.")).toBeVisible()
  await expect(page.locator("#editedBy")).toHaveText(ca.name)
  await page.close()
})

test("without negotiation D2.10 starts empty, has no 3.0, and locks without the FO", async ({
  browser,
}) => {
  test.slow()

  const { project, ca } = await setUp(false)
  const page = await open(browser, ca.email, project.id)

  await expect(
    amendments(page).getByLabel("Agreed Concession (From D2.9), row 1", {
      exact: true,
    })
  ).toHaveCount(0)
  await expect(page.getByText(reCheck)).toHaveCount(0)
  await expect(page.getByText("Finance Rep")).toHaveCount(0)
  await expect(page.locator("#meetingNotes-note")).toHaveText("Not started")

  await finishTasks(page)
  await signAndSubmit(page, ca.name)
  await expect(page.getByText("Submitted and locked.")).toBeVisible()
  await page.close()
})

test("the PM reads D2.10, and the OM cannot open it", async ({ browser }) => {
  const { project, pm, om } = await setUp()

  await addRecord(project.id, "D2.10", "draft", {
    payload: { readyForSignature: "No" },
  })

  const page = await open(browser, pm.email, project.id)

  await expect(page.getByRole("combobox", { name: ready })).toBeDisabled()
  await expect(
    page.getByRole("button", { name: "Sign Finance Rep" })
  ).toHaveCount(0)
  await page.close()

  const omPage = await browser.newPage()

  await signIn(omPage, om.email)

  const result = await omPage.goto(`/projects/${project.id}/tools/D2.10`)

  expect(result?.status()).toBe(404)
  await omPage.close()
})

test("at 375px D2.10 does not scroll sideways", async ({ page }) => {
  const { project, ca } = await setUp()

  await page.setViewportSize({ width: 375, height: 800 })
  await signIn(page, ca.email)
  await page.goto(`/projects/${project.id}/tools/D2.10`, {
    waitUntil: "networkidle",
  })

  await expect(page.getByRole("button", { name: "Submit" })).toBeVisible()
  expect(await sidewaysScroll(page)).toBe(0)
})
