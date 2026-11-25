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

const CLIENT_EMAIL = "kwaku.ampofo@asantemills.test"

// A Tier 1 project with Workbook 1 and D2.1 to D2.6 locked, the client's
// email on the web request, and its CA, PM, CR and OM.
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

  return { project, ca, pm, cr, om }
}

async function open(browser: Browser, email: string, projectId: string) {
  const page = await browser.newPage()

  await signIn(page, email)

  // Buttons only answer once the page has loaded its scripts.
  await page.goto(`/projects/${projectId}/tools/D2.7`, {
    waitUntil: "networkidle",
  })

  return page
}

async function choose(page: Page, label: string, option: string) {
  await page.getByRole("combobox", { name: label, exact: true }).click()
  await page.getByRole("option", { name: option, exact: true }).click()
}

const followUp = "Auto-Follow-Up Scheduled? (3 Days post-send)"

const response = "Initial Client Response"

test("D2.7 starts from the client's email, the fixed subject and the sheet's script", async ({
  browser,
}) => {
  const { project, ca } = await setUp()
  const page = await open(browser, ca.email, project.id)

  await expect(page.locator("#sentTo")).toHaveText(CLIENT_EMAIL)
  await expect(page.locator("#subject")).toHaveText(
    `IMHO GEN Engineering Services Agreement - ${project.name}`
  )
  await expect(
    page.getByRole("button", { name: "View File Attached" })
  ).toBeEnabled()
  await expect(
    page.getByRole("textbox", {
      name: "Standard Transmittal Email Script",
      exact: true,
    })
  ).toHaveValue(/^Dear Asante Mills\n\n/)
  await expect(page.getByText("Send needs:")).toBeVisible()
  await page.close()
})

test("the CA sends D2.7, which then keeps what was sent, and submits once the client replies", async ({
  browser,
}) => {
  test.slow()

  const { project, ca } = await setUp()
  const page = await open(browser, ca.email, project.id)

  await page.getByLabel("CC / BCC").fill("legal@asantemills.test")
  await choose(page, followUp, "Yes")
  await expect(page.getByRole("status").getByText("Saved")).toBeVisible()

  await page.getByRole("button", { name: "Submit", exact: true }).click()
  await expect(
    page.getByText("Send the email to the client first")
  ).toBeVisible()

  await page.getByRole("button", { name: "Send", exact: true }).click()
  await expect(page.getByText("Sent.")).toBeVisible()
  await expect(page.locator("#sentBy")).toHaveText(ca.name)
  await expect(page.locator("#followUpDate")).not.toHaveText(
    "Filled in when the email is sent with a follow-up"
  )

  // What was sent reads as text now; the reply is still a choice.
  await expect(page.locator("#ccBcc")).toHaveText("legal@asantemills.test")
  await expect(page.getByRole("combobox", { name: followUp })).toHaveCount(0)
  await expect(
    page.getByRole("button", { name: "Send", exact: true })
  ).toHaveCount(0)

  const copy = page.locator("#sentEmailLink").getByRole("link", {
    name: "Open",
  })

  await expect(copy).toHaveAttribute(
    "href",
    `/projects/${project.id}/tools/D2.7/sent-email`
  )

  await page.getByRole("button", { name: "Submit", exact: true }).click()
  await expect(
    page.getByText("Record the client's reply before submitting")
  ).toBeVisible()

  await choose(page, response, "Requested Negotiation")
  await expect(page.getByRole("status").getByText("Saved")).toBeVisible()
  await page.getByRole("button", { name: "Submit", exact: true }).click()
  await expect(page.getByText("Submitted and locked.")).toBeVisible()

  await page.goto(`/projects/${project.id}/tools/D2.7/sent-email`)
  await expect(
    page.getByRole("heading", {
      name: `IMHO GEN Engineering Services Agreement - ${project.name}`,
    })
  ).toBeVisible()
  await expect(page.getByText(CLIENT_EMAIL)).toBeVisible()
  await expect(page.getByText("legal@asantemills.test")).toBeVisible()
  await expect(
    page.getByText(/^D2\.2 Initial Draft Contract.*\.pdf$/)
  ).toBeVisible()
  await page.close()
})

test("the PM and CR read D2.7, and the OM cannot open it", async ({
  browser,
}) => {
  const { project, pm, cr, om } = await setUp()

  await addRecord(project.id, "D2.7", "draft", {
    payload: { initialResponse: "Pending" },
  })

  for (const reader of [pm, cr]) {
    const page = await open(browser, reader.email, project.id)

    await expect(page.getByRole("combobox", { name: response })).toBeDisabled()
    await expect(
      page.getByRole("button", { name: "Send", exact: true })
    ).toHaveCount(0)
    await page.close()
  }

  const omPage = await browser.newPage()

  await signIn(omPage, om.email)

  const result = await omPage.goto(`/projects/${project.id}/tools/D2.7`)

  expect(result?.status()).toBe(404)
  await omPage.close()
})

test("at 375px D2.7 does not scroll sideways", async ({ page }) => {
  const { project, ca } = await setUp()

  await page.setViewportSize({ width: 375, height: 800 })
  await signIn(page, ca.email)
  await page.goto(`/projects/${project.id}/tools/D2.7`, {
    waitUntil: "networkidle",
  })

  await expect(page.getByRole("button", { name: "Send" })).toBeVisible()
  expect(await sidewaysScroll(page)).toBe(0)
})
