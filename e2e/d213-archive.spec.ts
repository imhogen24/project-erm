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

// A Tier 1 project with Workbook 1 and D2.1 to D2.12 locked, negotiated or
// accepted as it was, D2.12 holding its two uploads, and its CA, PM, OM and
// client.
async function setUp(accepted = false) {
  const project = await makeProject(`Rice Mill ${tag()}`)
  const ca = await makePerson(`Gifty ${tag()}`)
  const pm = await makePerson(`Ama ${tag()}`)
  const om = await makePerson(`Kofi ${tag()}`)
  const client = await makePerson(`Kwaku ${tag()}`)

  await giveRoles(ca.id, project.id, ["CA"])
  await giveRoles(pm.id, project.id, ["PM"])
  await giveRoles(om.id, project.id, ["OM"])
  await giveRoles(client.id, project.id, ["Client"])
  await addClientRequest(project.id, { organization_name: "Asante Mills" })
  await lockEarlierTools(project.id)

  for (const toolId of [
    "D1.8",
    "D1.9",
    "D1.10",
    "D1.11",
    "D1.12",
    "D1.13",
    "D1.14",
    "D1.15",
    "D1.16",
  ]) {
    await addRecord(project.id, toolId, "locked")
  }

  for (const toolId of ["D2.1", "D2.2", "D2.3", "D2.4", "D2.5", "D2.6"]) {
    await addRecord(project.id, toolId, "locked", { submittedBy: ca.id })
  }

  await addRecord(project.id, "D2.7", "locked", {
    payload: {
      initialResponse: accepted ? "Accepted as-is" : "Requested Negotiation",
    },
  })

  if (!accepted) {
    await addRecord(project.id, "D2.8", "locked")
    await addRecord(project.id, "D2.9", "locked", {
      payload: { meetingOutcome: "Terms Agreed - Proceed to D2.10" },
    })
  }

  await addRecord(project.id, "D2.10", "locked")
  await addRecord(project.id, "D2.11", "locked")

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

  await addRecord(project.id, "D2.12", "locked", {
    payload: {
      platform: "IMHOGEN App (Digital Signature)",
      executedPdf: `file:${executed.id}`,
      auditCertificate: `file:${log.id}`,
    },
  })

  return { project, ca, pm, om, client }
}

async function open(browser: Browser, email: string, path: string) {
  const page = await browser.newPage()

  await signIn(page, email)

  // Buttons only answer once the page has loaded its scripts.
  await page.goto(path, { waitUntil: "networkidle" })

  return page
}

const documents = [
  "D1.15",
  "D2.6 Internally Approved Draft",
  "D2.9 Negotiation Meeting Notes",
  "D2.12 Executed PDF",
  "D2.12 Digital Audit Certificate",
]

test("D2.13 lists the five documents to open, named after the client, and links to the archive", async ({
  browser,
}) => {
  test.slow()

  const { project, ca } = await setUp()

  const page = await open(
    browser,
    ca.email,
    `/projects/${project.id}/tools/D2.13`
  )

  await expect(
    page.locator("#vaultLink").getByRole("link", { name: "Open" })
  ).toHaveAttribute("href", `/projects/${project.id}/archive`)

  const vault = page.getByRole("table", {
    name: "2.0 Permanent vault checklist",
  })

  for (const name of documents) {
    await expect(vault.getByText(name).first()).toBeVisible()
  }

  await expect(vault.getByText("IMHO_Brief_AsanteMills.pdf")).toBeVisible()
  await expect(vault.getByText("IMHO_AuditCert_AsanteMills.pdf")).toBeVisible()
  await expect(
    vault.getByRole("button", {
      name: /^View Required Document for Archival for /,
    })
  ).toHaveCount(5)
  await expect(vault.getByText("2.5", { exact: true })).toBeVisible()

  // 3.0's answer is asked for first.
  await page.getByRole("button", { name: "Submit", exact: true }).click()
  await expect(
    page.getByRole("alert").filter({ hasText: "Required" })
  ).toHaveCount(1)
  await page.close()
})

test("without negotiation, row 2.3 reads Not needed", async ({ browser }) => {
  const { project, ca } = await setUp(true)

  const page = await open(
    browser,
    ca.email,
    `/projects/${project.id}/tools/D2.13`
  )

  const vault = page.getByRole("table", {
    name: "2.0 Permanent vault checklist",
  })

  await expect(vault.getByText("Not needed")).toHaveCount(2)
  await page.close()
})

test("the archive lists each document with its standard name and a download", async ({
  browser,
}) => {
  const { project, ca, pm } = await setUp()

  for (const person of [ca, pm]) {
    const page = await open(
      browser,
      person.email,
      `/projects/${project.id}/archive`
    )

    await expect(
      page.getByRole("heading", { name: "Contract archive" })
    ).toBeVisible()
    await expect(
      page
        .getByText("IMHO_ExecutedContract_AsanteMills.pdf", { exact: true })
        .first()
    ).toBeVisible()
    await expect(
      page.getByRole("link", {
        name: "Download IMHO_ExecutedContract_AsanteMills.pdf",
      })
    ).toHaveAttribute("href", `/api/projects/${project.id}/archive/3`)
    await page.close()
  }
})

test("the client and the OM can open neither D2.13 nor the archive", async ({
  browser,
}) => {
  const { project, om, client } = await setUp()

  for (const person of [om, client]) {
    const page = await browser.newPage()

    await signIn(page, person.email)

    for (const path of [
      `/projects/${project.id}/tools/D2.13`,
      `/projects/${project.id}/archive`,
    ]) {
      const result = await page.goto(path)

      expect(result?.status()).toBe(404)
    }

    await page.close()
  }
})

test("at 375px D2.13 and the archive do not scroll sideways", async ({
  page,
}) => {
  const { project, ca } = await setUp()

  await page.setViewportSize({ width: 375, height: 800 })
  await signIn(page, ca.email)

  for (const path of [
    `/projects/${project.id}/tools/D2.13`,
    `/projects/${project.id}/archive`,
  ]) {
    await page.goto(path, { waitUntil: "networkidle" })
    await expect(page.getByRole("heading").first()).toBeVisible()
    expect(await sidewaysScroll(page)).toBe(0)
  }
})
