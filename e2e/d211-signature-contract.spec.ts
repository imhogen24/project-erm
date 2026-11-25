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

const CLIENT_EMAIL = "kwaku.ampofo@asantemills.test"

const FILE_NAME = "IMHO_FinalContract_AsanteMills.pdf"

// A Tier 1 project with Workbook 1 and D2.1 to D2.10 locked, the client
// contact on the web request, and its CA, HE, PM, OM and client.
async function setUp() {
  const project = await makeProject(`Rice Mill ${tag()}`)
  const ca = await makePerson(`Gifty ${tag()}`)
  const he = await makePerson(`Kwesi ${tag()}`)
  const pm = await makePerson(`Ama ${tag()}`)
  const om = await makePerson(`Kofi ${tag()}`)
  const client = await makePerson(`Kwaku ${tag()}`)

  await giveRoles(ca.id, project.id, ["CA"])
  await giveRoles(he.id, project.id, ["HE"])
  await giveRoles(pm.id, project.id, ["PM"])
  await giveRoles(om.id, project.id, ["OM"])
  await giveRoles(client.id, project.id, ["Client"])
  await addClientRequest(project.id, {
    organization_name: "Asante Mills",
    contact_person: "Kwaku Ampofo",
    email: CLIENT_EMAIL,
  })
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

  for (const toolId of ["D2.1", "D2.2", "D2.6", "D2.8", "D2.10"]) {
    await addRecord(project.id, toolId, "locked", { submittedBy: ca.id })
  }

  await addRecord(project.id, "D2.3", "locked", {
    payload: { operationalStatus: "Approved" },
  })
  await addRecord(project.id, "D2.4", "locked", {
    payload: { commercialStatus: "Approved" },
  })
  await addRecord(project.id, "D2.5", "locked", {
    payload: { executiveDecision: "Approved for Client Transmission" },
  })
  await addRecord(project.id, "D2.7", "locked", {
    payload: { initialResponse: "Requested Negotiation" },
  })
  await addRecord(project.id, "D2.9", "locked", {
    payload: { meetingOutcome: "Terms Agreed - Proceed to D2.10" },
  })

  return { project, ca, he, pm, om, client }
}

// D2.11 as the CA's Send leaves it: the contract sent today. Sending itself
// reads the PDF from UploadThing, which the unit tests stand in for.
async function sent(
  projectId: string,
  ca: string,
  routingMethod = "Digital Signature"
) {
  const file = await addUpload(ca, `key-${tag()}`, FILE_NAME, projectId)
  const now = new Date()

  return addRecord(projectId, "D2.11", "draft", {
    payload: {
      routingMethod,
      sentTo: `Kwaku Ampofo ${CLIENT_EMAIL}`,
      imhogenSignatory: "Head of Engineering",
      autoReminder: "Yes",
      finalContract: `file:${file.id}`,
      script: "Dear Asante Mills",
      dateDispatched: now.toISOString().slice(0, 10),
      dispatchedAt: now.toISOString(),
      dispatchConfirmed: now.toISOString(),
      ...(routingMethod === "Digital Signature" && {
        signatureLink: `/projects/${projectId}/tools/D2.11`,
      }),
    },
  })
}

async function open(browser: Browser, email: string, projectId: string) {
  const page = await browser.newPage()

  await signIn(page, email)

  // Buttons only answer once the page has loaded its scripts.
  await page.goto(`/projects/${projectId}/tools/D2.11`, {
    waitUntil: "networkidle",
  })

  return page
}

const signClient = "Sign Client Signature"

const signImhogen = "Sign IMHOGEN Signature (Head of Engineering)"

test("D2.11 starts on the client contact, the HE and the script, and Send waits for the PDF", async ({
  browser,
}) => {
  const { project, ca, he } = await setUp()
  const page = await open(browser, ca.email, project.id)

  await expect(page.getByLabel("Sent To (Client Signatory)")).toHaveValue(
    `Kwaku Ampofo ${CLIENT_EMAIL}`
  )
  await expect(page.getByLabel("IMHOGEN Signatory")).toHaveValue(
    `${he.name}, Head of Engineering`
  )
  await expect(
    page.getByRole("textbox", {
      name: "Standard Signature Request Script",
      exact: true,
    })
  ).toHaveValue(/^Dear Asante Mills\n\n[\s\S]*sign the document digitally/)
  await expect(page.getByText("Send needs:")).toBeVisible()
  await expect(
    page.getByText(/upload the final contract as a PDF/)
  ).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Send", exact: true })
  ).toBeDisabled()
  await expect(page.getByRole("button", { name: signClient })).toHaveCount(0)
  await page.close()
})

test("the client signs first, then the HE, whose signature locks D2.11", async ({
  browser,
}) => {
  test.slow()

  const { project, ca, he, client } = await setUp()

  await sent(project.id, ca.id)

  // Not the HE's turn yet.
  const early = await open(browser, he.email, project.id)

  await expect(early.getByRole("button", { name: signImhogen })).toHaveCount(0)
  await early.close()

  const clientPage = await open(browser, client.email, project.id)

  const tracker = clientPage.getByRole("table", {
    name: "3.0 Signature status tracker",
  })

  await expect(tracker.getByText("Kwaku Ampofo")).toBeVisible()
  await expect(
    clientPage.getByRole("link", { name: /^Open/ }).first()
  ).toBeVisible()
  await expect(clientPage.getByLabel("Action Taken")).toBeDisabled()
  await clientPage.getByRole("button", { name: signClient }).click()
  await expect(clientPage.getByText(`Signed by ${client.name}`)).toBeVisible()
  await clientPage.reload({ waitUntil: "networkidle" })
  await expect(
    clientPage
      .getByRole("table", { name: "3.0 Signature status tracker" })
      .getByText("Signed", { exact: true })
  ).toHaveCount(1)
  await clientPage.close()

  const hePage = await open(browser, he.email, project.id)

  await hePage.getByRole("button", { name: signImhogen }).click()
  await expect(hePage.getByText(`Signed by ${he.name}`)).toBeVisible()
  await hePage.reload({ waitUntil: "networkidle" })
  await expect(hePage.getByLabel("Document control")).toContainText("Locked")
  await hePage.close()
})

test("with Physical Courier there is nothing to sign in the app, and Submit asks for both signed dates", async ({
  browser,
}) => {
  const { project, ca, client } = await setUp()

  await sent(project.id, ca.id, "Physical Courier")

  const clientPage = await open(browser, client.email, project.id)

  await expect(
    clientPage.getByRole("button", { name: signClient })
  ).toHaveCount(0)
  await clientPage.close()

  const page = await open(browser, ca.email, project.id)

  await page.getByRole("button", { name: "Submit", exact: true }).click()
  // Both Date Signed cells are asked for before the rows are.
  await expect(
    page
      .getByRole("table", { name: "3.0 Signature status tracker" })
      .getByText("Required")
  ).toHaveCount(2)
  await page.close()
})

test("the PM reads D2.11, and the OM cannot open it", async ({ browser }) => {
  const { project, ca, pm, om } = await setUp()

  await sent(project.id, ca.id)

  const page = await open(browser, pm.email, project.id)

  await expect(page.getByLabel("Action Taken")).toBeDisabled()
  await expect(page.getByRole("button", { name: signClient })).toHaveCount(0)
  await page.close()

  const omPage = await browser.newPage()

  await signIn(omPage, om.email)

  const result = await omPage.goto(`/projects/${project.id}/tools/D2.11`)

  expect(result?.status()).toBe(404)
  await omPage.close()
})

test("at 375px D2.11 does not scroll sideways", async ({ page }) => {
  const { project, ca } = await setUp()

  await page.setViewportSize({ width: 375, height: 800 })
  await signIn(page, ca.email)
  await page.goto(`/projects/${project.id}/tools/D2.11`, {
    waitUntil: "networkidle",
  })

  await expect(page.getByRole("button", { name: "Send" })).toBeVisible()
  expect(await sidewaysScroll(page)).toBe(0)
})
