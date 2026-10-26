import { expect, test, type Page } from "@playwright/test"

import {
  addRecord,
  giveRoles,
  lockEarlierTools,
  makePerson,
  makeProject,
  sidewaysScroll,
  signIn,
  tag,
} from "./support/data"

const NOT_FOUND = "This page could not be found."

const STALE = "Someone else saved this record. Reload to see their changes."

// On D1.1 (Client Email / Web Form) the OM writes and the PM approves. On D1.8
// (Needs Assessment Notes) the LE writes and signs, the PM approves and the OM
// only reads.
async function setUp() {
  const project = await makeProject(`Boiler ${tag()}`)
  const om = await makePerson()
  const pm = await makePerson()
  const lead = await makePerson()

  await giveRoles(om.id, project.id, ["OM"])
  await giveRoles(pm.id, project.id, ["PM"])
  await giveRoles(lead.id, project.id, ["LE"])

  return { project, om, pm, lead }
}

async function open(
  page: Page,
  email: string,
  projectId: string,
  toolId = "D1.1"
) {
  await signIn(page, email)
  await page.goto(`/projects/${projectId}/tools/${toolId}`)
}

function control(page: Page) {
  return page.getByRole("region", { name: "Document control" })
}

async function fillClient(page: Page, name: string, email?: string) {
  await page.getByLabel("Client name").fill(name)

  if (email) {
    await page.getByLabel("Client email").fill(email)
  }
}

test("a tool row on the overview opens its page, with its name and state", async ({
  page,
}) => {
  const { project, om } = await setUp()

  await signIn(page, om.email)
  await page.goto(`/projects/${project.id}`)
  await page.getByRole("link", { name: /D1\.1.*Client Email/ }).click()

  await expect(page).toHaveURL(`/projects/${project.id}/tools/D1.1`)
  await expect(page.getByRole("heading", { level: 1 })).toContainText("D1.1")
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Client Email / Web Form"
  )
  await expect(page.getByText("Not started", { exact: true })).toBeVisible()
})

test("a person who may not read the tool, or is not on the project, sees not found", async ({
  page,
}) => {
  const { project } = await setUp()
  const finance = await makePerson()
  const stranger = await makePerson()

  await giveRoles(finance.id, project.id, ["FO"])

  await open(page, finance.email, project.id)
  await expect(page.getByText(NOT_FOUND)).toBeVisible()

  await page.context().clearCookies()
  await open(page, stranger.email, project.id)
  await expect(page.getByText(NOT_FOUND)).toBeVisible()
})

test("Save draft keeps the values after a reload", async ({ page }) => {
  const { project, om } = await setUp()

  await open(page, om.email, project.id)
  await fillClient(page, "Acme Ltd", "ops@acme.com")
  await page.getByRole("button", { name: "Save draft" }).click()

  await expect(page.getByText("Draft saved.")).toBeVisible()

  await page.reload()

  await expect(page.getByLabel("Client name")).toHaveValue("Acme Ltd")
  await expect(page.getByLabel("Client email")).toHaveValue("ops@acme.com")
  await expect(page.getByText("Draft", { exact: true })).toBeVisible()
})

test("submitting with a required field empty shows the error and stays a draft", async ({
  page,
}) => {
  const { project, om } = await setUp()

  await open(page, om.email, project.id)
  await fillClient(page, "Acme Ltd")
  await page.getByRole("button", { name: "Submit" }).click()

  await expect(page.getByText("Required")).toBeVisible()
  await expect(page.getByText("Draft", { exact: true })).toBeVisible()
  await expect(page.getByRole("button", { name: "Submit" })).toBeVisible()
})

test("submitting a complete form makes it submitted and read only", async ({
  page,
}) => {
  const { project, om } = await setUp()

  await open(page, om.email, project.id)
  await fillClient(page, "Acme Ltd", "ops@acme.com")
  await page.getByRole("button", { name: "Submit" }).click()

  await expect(page.getByText("Submitted", { exact: true })).toBeVisible()
  await expect(page.getByLabel("Client name")).toBeDisabled()
  await expect(page.getByRole("button", { name: "Save draft" })).toHaveCount(0)
  await expect(page.getByRole("button", { name: "Submit" })).toHaveCount(0)
  await expect(page.getByText("This record is read only.")).toBeVisible()
})

test("a person with the right role signs, and the name and time show", async ({
  page,
}) => {
  const { project, lead } = await setUp()

  await lockEarlierTools(project.id)
  await addRecord(project.id, "D1.8", "draft", {
    payload: { synthesizedBy: "Lea" },
  })
  await open(page, lead.email, project.id, "D1.8")

  await expect(page.getByText("Not signed yet")).toBeVisible()

  await page
    .getByRole("button", { name: "Sign Lead Engineer Signature" })
    .click()

  await expect(page.getByText(`Signed by ${lead.name} on`)).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Sign Lead Engineer Signature" })
  ).toHaveCount(0)
})

test("a person without the signing role has no Sign button", async ({
  page,
}) => {
  const { project, om, pm } = await setUp()

  await lockEarlierTools(project.id)
  await addRecord(project.id, "D1.8", "draft", {
    payload: { synthesizedBy: "Lea" },
  })

  for (const person of [om, pm]) {
    await page.context().clearCookies()
    await open(page, person.email, project.id, "D1.8")

    await expect(page.getByText("Not signed yet")).toBeVisible()
    await expect(
      page.getByRole("button", { name: "Sign Lead Engineer Signature" })
    ).toHaveCount(0)
  }
})

test("the PM approves a submitted record, and it locks and opens the next tool", async ({
  page,
}) => {
  const { project, om, pm } = await setUp()

  await addRecord(project.id, "D1.1", "submitted", {
    payload: { clientName: "Acme", clientEmail: "ops@acme.com" },
    submittedBy: om.id,
  })
  await open(page, pm.email, project.id)
  await page.getByRole("button", { name: "Approve" }).click()

  await expect(page.getByText("Locked", { exact: true })).toBeVisible()
  await expect(page.getByRole("button", { name: "Approve" })).toHaveCount(0)

  await page.goto(`/projects/${project.id}/tools/D1.2`)

  await expect(page.getByRole("heading", { level: 1 })).toContainText("D1.2")
  await expect(page.getByText(/This tool opens after/)).toHaveCount(0)
})

test("the person who submitted a record has no Approve button", async ({
  page,
}) => {
  const { project } = await setUp()
  const both = await makePerson()

  await giveRoles(both.id, project.id, ["OM", "PM"])
  await addRecord(project.id, "D1.1", "submitted", {
    payload: { clientName: "Acme", clientEmail: "ops@acme.com" },
    submittedBy: both.id,
  })
  await open(page, both.email, project.id)

  await expect(page.getByText("Submitted", { exact: true })).toBeVisible()
  await expect(page.getByRole("button", { name: "Approve" })).toHaveCount(0)
})

test("a save over someone else's newer save is refused and keeps the text", async ({
  page,
}) => {
  const { project, om } = await setUp()

  await addRecord(project.id, "D1.1", "draft", {
    payload: { clientName: "Old name" },
  })
  await open(page, om.email, project.id)

  const second = await page.context().newPage()

  await second.goto(`/projects/${project.id}/tools/D1.1`)

  await fillClient(page, "First save")
  await page.getByRole("button", { name: "Save draft" }).click()
  await expect(page.getByText("Draft saved.")).toBeVisible()

  await second.getByLabel("Client name").fill("Second save")
  await second.getByRole("button", { name: "Save draft" }).click()

  await expect(second.getByText(STALE)).toBeVisible()
  await expect(second.getByRole("button", { name: "Reload" })).toBeVisible()
  await expect(second.getByLabel("Client name")).toHaveValue("Second save")

  await second.getByRole("button", { name: "Reload" }).click()

  await expect(second.getByLabel("Client name")).toHaveValue("First save")
})

test("a tool that is not open yet names the tool it waits for and shows no form", async ({
  page,
}) => {
  const { project, pm } = await setUp()

  await open(page, pm.email, project.id, "D1.9")

  await expect(
    page.getByText("This tool opens after D1.8 is approved.")
  ).toBeVisible()
  await expect(page.getByRole("button", { name: "Save draft" })).toHaveCount(0)
})

test("the document control block shows the request ID, the people and the start", async ({
  page,
}) => {
  const { project, om, pm } = await setUp()

  await addRecord(project.id, "D1.1", "draft", {
    payload: { clientName: "Acme" },
  })
  await open(page, om.email, project.id)

  await expect(control(page)).toContainText(project.requestId)
  await expect(control(page)).toContainText(`${om.name} (OM)`)
  await expect(control(page)).toContainText(`${pm.name} (PM)`)
  await expect(control(page)).toContainText("Started")
  await expect(control(page)).toContainText("Completed")
})

test("a locked record is read only, with no buttons", async ({ page }) => {
  const { project, om } = await setUp()

  await addRecord(project.id, "D1.1", "locked", {
    payload: { clientName: "Acme", clientEmail: "ops@acme.com" },
  })
  await open(page, om.email, project.id)

  await expect(page.getByText("This record is read only.")).toBeVisible()
  await expect(page.getByLabel("Client name")).toBeDisabled()
  await expect(page.getByLabel("Client name")).toHaveValue("Acme")

  for (const name of ["Save draft", "Submit", "Approve"]) {
    await expect(page.getByRole("button", { name })).toHaveCount(0)
  }
})

test("at 375px the page does not scroll sideways and its buttons work", async ({
  page,
}) => {
  const { project, om } = await setUp()

  await page.setViewportSize({ width: 375, height: 812 })
  await open(page, om.email, project.id)

  expect(await sidewaysScroll(page)).toBeLessThanOrEqual(0)

  await fillClient(page, "Acme Ltd", "ops@acme.com")
  await expect(page.getByRole("button", { name: "Submit" })).toBeVisible()
  await page.getByRole("button", { name: "Save draft" }).click()

  await expect(page.getByText("Draft saved.")).toBeVisible()
  expect(await sidewaysScroll(page)).toBeLessThanOrEqual(0)
})
