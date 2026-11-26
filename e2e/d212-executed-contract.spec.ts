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

// A Tier 1 project with Workbook 1 and D2.1 to D2.11 locked, D2.11 signed
// in the app or on paper, and its CA, PM and OM.
async function setUp(onPaper = false) {
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
    payload: { budget: [{ value: 60000 }, { value: 34400 }] },
  })
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
    submittedBy: ca.id,
  })

  for (const toolId of ["D2.3", "D2.4", "D2.5", "D2.6", "D2.8", "D2.10"]) {
    await addRecord(project.id, toolId, "locked", { submittedBy: ca.id })
  }

  await addRecord(project.id, "D2.7", "locked", {
    payload: { initialResponse: "Requested Negotiation" },
  })
  await addRecord(project.id, "D2.9", "locked", {
    payload: { meetingOutcome: "Terms Agreed - Proceed to D2.10" },
  })

  const sent = {
    sentTo: "Kwaku Ampofo kwaku@asantemills.test",
    imhogenSignatory: "Kwesi Appiah, Head of Engineering",
    dateDispatched: "2026-12-04",
    dispatchConfirmed: "2026-12-04T09:00:00.000Z",
  }

  if (onPaper) {
    await addRecord(project.id, "D2.11", "locked", {
      payload: {
        ...sent,
        routingMethod: "Physical Courier",
        signatories: [
          { dateSigned: "2026-12-07", status: "Signed" },
          { dateSigned: "2026-12-08", status: "Signed" },
        ],
      },
    })
  } else {
    await addRecord(project.id, "D2.11", "locked", {
      payload: {
        ...sent,
        routingMethod: "Digital Signature",
        clientSignature: {
          signedBy: "role:Client",
          signedAt: "2026-12-05T10:00:00.000Z",
        },
        heSignature: {
          signedBy: "role:HE",
          signedAt: "2026-12-06T09:00:00.000Z",
        },
      },
    })
  }

  return { project, ca, pm, om }
}

async function open(browser: Browser, email: string, projectId: string) {
  const page = await browser.newPage()

  await signIn(page, email)

  // Buttons only answer once the page has loaded its scripts.
  await page.goto(`/projects/${projectId}/tools/D2.12`, {
    waitUntil: "networkidle",
  })

  return page
}

test("D2.12 shows who signed, the value and the advance, and starts on the files the app made", async ({
  browser,
}) => {
  test.slow()

  const { project, ca } = await setUp()

  // The draft as the app starts it from a contract signed in the app: with
  // the signed contract and the signing log it made. Making them reads the
  // PDF from UploadThing, which the unit tests stand in for.
  const executed = await addUpload(
    ca.id,
    `key-${tag()}`,
    "Executed.pdf",
    project.id
  )

  const log = await addUpload(
    ca.id,
    `key-${tag()}`,
    "Signing log.pdf",
    project.id
  )

  await addRecord(project.id, "D2.12", "draft", {
    payload: {
      platform: "IMHOGEN App (Digital Signature)",
      executedPdf: `file:${executed.id}`,
      auditCertificate: `file:${log.id}`,
    },
  })

  const page = await open(browser, ca.email, project.id)

  await expect(page.locator("#dateExecuted")).toHaveText("2026-12-06")
  await expect(page.locator("#clientSignatory")).toHaveText("Kwaku Ampofo")
  await expect(page.locator("#imhogenSignatory")).toHaveText(
    "Kwesi Appiah, Head of Engineering"
  )
  await expect(page.locator("#totalContractValue")).toHaveText("GHS 94,400.00")
  await expect(page.locator("#advanceDue")).toHaveText("GHS 37,760.00")
  await expect(
    page.getByRole("combobox", { name: "Document Platform Used" })
  ).toHaveText("IMHOGEN App (Digital Signature)")
  await expect(page.getByText("Uploaded file")).toHaveCount(2)

  const tasks = page.getByRole("table", {
    name: "3.0 Initial financial trigger",
  })

  await expect(tasks.getByText("Finance Officer")).toBeVisible()
  await expect(
    tasks.getByRole("textbox", { name: "Assignee, row 1" })
  ).toHaveCount(0)
  await expect(page.getByLabel("Invoice Number Issued")).toHaveAttribute(
    "placeholder",
    "e.g. IMHO-INV26-ADV-010"
  )

  await page.getByRole("button", { name: "Submit for approval" }).click()
  // The invoice number, its date and 4.0 are asked for first.
  await expect(
    page.getByRole("alert").filter({ hasText: "Required" })
  ).toHaveCount(3)
  await page.close()
})

test("signed on paper, D2.12 starts on Physical Scan with no files", async ({
  browser,
}) => {
  const { project, ca } = await setUp(true)
  const page = await open(browser, ca.email, project.id)

  await expect(page.locator("#dateExecuted")).toHaveText("2026-12-08")
  await expect(
    page.getByRole("combobox", { name: "Document Platform Used" })
  ).toHaveText("Physical Scan")
  await expect(page.getByText("Uploaded file")).toHaveCount(0)
  await expect(page.getByRole("button", { name: "Upload" })).toHaveCount(2)
  await page.close()
})

test("the PM reads D2.12, and the OM cannot open it", async ({ browser }) => {
  const { project, pm, om } = await setUp()

  await addRecord(project.id, "D2.12", "draft", {
    payload: { invoiceNumber: "IMHO-INV26-ADV-010" },
  })

  const page = await open(browser, pm.email, project.id)

  await expect(page.getByLabel("Invoice Number Issued")).toBeDisabled()
  await page.close()

  const omPage = await browser.newPage()

  await signIn(omPage, om.email)

  const result = await omPage.goto(`/projects/${project.id}/tools/D2.12`)

  expect(result?.status()).toBe(404)
  await omPage.close()
})

test("at 375px D2.12 does not scroll sideways", async ({ page }) => {
  const { project, ca } = await setUp()

  await page.setViewportSize({ width: 375, height: 800 })
  await signIn(page, ca.email)
  await page.goto(`/projects/${project.id}/tools/D2.12`, {
    waitUntil: "networkidle",
  })

  await expect(
    page.getByRole("button", { name: "Submit for approval" })
  ).toBeVisible()
  expect(await sidewaysScroll(page)).toBe(0)
})
