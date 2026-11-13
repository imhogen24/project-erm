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

// D1.1 (Client Email / Web Form) is the client's own form, which the OM and PM
// read. On D1.3 (Received Request Record) the OM writes and the PM approves.
// On D1.8
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

// D1.8 has no required field. D1.11 has one, and opens once D1.10 is locked
// as capable.
async function lockThroughD110(projectId: string) {
  await lockEarlierTools(projectId)
  await addRecord(projectId, "D1.8", "locked")
  await addRecord(projectId, "D1.9", "locked")
  await addRecord(projectId, "D1.10", "locked", {
    payload: { overallCapabilityStatus: "Capable" },
  })
}

// The first confirmed constraint, a field the Lead Engineer types on D1.8.
function notes(page: Page) {
  return page.getByLabel("Confirmed Constraints / Specifications, row 1", {
    exact: true,
  })
}

function decision(page: Page) {
  return page.getByRole("combobox", { name: "Project Go / No-Go Decision" })
}

function control(page: Page) {
  return page.locator('header[aria-label="Document control"]')
}

// D1.3 opens once D1.1 and D1.2 are locked.
async function openD13(projectId: string) {
  await addRecord(projectId, "D1.1", "locked")
  await addRecord(projectId, "D1.2", "locked")
}

test("a tool row on the overview opens its page, with its name and state", async ({
  page,
}) => {
  const { project, om } = await setUp()

  await signIn(page, om.email)
  await page.goto(`/projects/${project.id}`)
  await page
    .getByRole("main")
    .getByRole("link", { name: /D1\.1.*Client Email/ })
    .click()

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
  const { project, lead } = await setUp()

  await lockEarlierTools(project.id)
  await open(page, lead.email, project.id, "D1.8")
  await notes(page).fill("Lea")
  await page.getByRole("button", { name: "Save draft" }).click()

  await expect(page.getByText("Draft saved.")).toBeVisible()

  await page.reload()

  await expect(notes(page)).toHaveValue("Lea")
  await expect(page.getByText("Draft", { exact: true })).toBeVisible()
})

test("submitting with a required field empty shows the error and stays a draft", async ({
  page,
}) => {
  const { project, lead } = await setUp()

  await lockThroughD110(project.id)
  await open(page, lead.email, project.id, "D1.11")
  await page.getByRole("button", { name: "Submit" }).click()

  await expect(page.getByText("Required")).toBeVisible()
  await expect(page.getByText("Draft", { exact: true })).toBeVisible()
  await expect(page.getByRole("button", { name: "Submit" })).toBeVisible()
})

test("submitting a complete form makes it submitted and read only", async ({
  page,
}) => {
  const { project, lead } = await setUp()

  await lockThroughD110(project.id)
  await open(page, lead.email, project.id, "D1.11")
  await decision(page).click()
  await page.getByRole("option", { name: "Go", exact: true }).click()
  await page.getByRole("button", { name: "Submit" }).click()

  await expect(page.getByText("Submitted", { exact: true })).toBeVisible()
  await expect(decision(page)).toBeDisabled()
  await expect(page.getByRole("button", { name: "Save draft" })).toHaveCount(0)
  await expect(page.getByRole("button", { name: "Submit" })).toHaveCount(0)
})

test("a person with the right role signs, and the name and time show", async ({
  page,
}) => {
  const { project, lead } = await setUp()

  await lockEarlierTools(project.id)
  await addRecord(project.id, "D1.8", "draft", {
    payload: {
      constraints: [{ category: "INPUT: Material", confirmed: "Lea" }],
    },
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
    payload: {
      constraints: [{ category: "INPUT: Material", confirmed: "Lea" }],
    },
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

  await openD13(project.id)
  await addRecord(project.id, "D1.3", "submitted", { submittedBy: om.id })
  await open(page, pm.email, project.id, "D1.3")
  await page.getByRole("button", { name: "Approve" }).click()

  await expect(page.getByText("Locked", { exact: true })).toBeVisible()
  await expect(page.getByRole("button", { name: "Approve" })).toHaveCount(0)

  await page.goto(`/projects/${project.id}/tools/D1.4`)

  await expect(page.getByRole("heading", { level: 1 })).toContainText("D1.4")
  await expect(page.getByText(/This tool opens after/)).toHaveCount(0)
})

test("the person who submitted a record has no Approve button", async ({
  page,
}) => {
  const { project } = await setUp()
  const both = await makePerson()

  await giveRoles(both.id, project.id, ["OM", "PM"])
  await openD13(project.id)
  await addRecord(project.id, "D1.3", "submitted", { submittedBy: both.id })
  await open(page, both.email, project.id, "D1.3")

  await expect(page.getByText("Submitted", { exact: true })).toBeVisible()
  await expect(page.getByRole("button", { name: "Approve" })).toHaveCount(0)
})

test("a save over someone else's newer save is refused and keeps the text", async ({
  page,
}) => {
  const { project, lead } = await setUp()

  await lockEarlierTools(project.id)
  await addRecord(project.id, "D1.8", "draft")
  await open(page, lead.email, project.id, "D1.8")

  const second = await page.context().newPage()

  await second.goto(`/projects/${project.id}/tools/D1.8`)

  const synthesizedBy = notes

  await synthesizedBy(page).fill("Lea")
  await page.getByRole("button", { name: "Save draft" }).click()
  await expect(page.getByText("Draft saved.")).toBeVisible()

  await synthesizedBy(second).fill("Leo")
  await second.getByRole("button", { name: "Save draft" }).click()

  await expect(second.getByText(STALE)).toBeVisible()
  await expect(second.getByRole("button", { name: "Reload" })).toBeVisible()
  await expect(synthesizedBy(second)).toHaveValue("Leo")

  await second.getByRole("button", { name: "Reload" }).click()

  await expect(synthesizedBy(second)).toHaveValue("Lea")
})

test("a tool that is not open yet cannot be opened, and its tile says what it waits for", async ({
  page,
}) => {
  const { project, pm } = await setUp()

  await open(page, pm.email, project.id, "D1.9")

  // Its address leads back to the project.
  await expect(page).toHaveURL(new RegExp(`/projects/${project.id}$`))
  await expect(page.getByRole("button", { name: "Save draft" })).toHaveCount(0)

  const tile = page
    .getByRole("main")
    .getByRole("listitem")
    .filter({ has: page.getByText("D1.9", { exact: true }) })

  await expect(tile).toContainText("Opens after D1.8")
  await expect(tile.getByRole("link")).toHaveCount(0)
})

test("the document control shows the people, with their roles, and the start", async ({
  page,
}) => {
  const { project, om, pm } = await setUp()

  await openD13(project.id)
  await addRecord(project.id, "D1.3", "draft")
  await open(page, om.email, project.id, "D1.3")

  // On a wide screen the sidebar names the project and its request ID.
  await expect(page.getByText(project.requestId).first()).toBeVisible()
  // The facts are drawn twice: in one row, and folded away for phones.
  await expect(control(page)).toContainText(om.name)
  await expect(control(page)).toContainText(pm.name)
  await expect(
    control(page).getByText("OM", { exact: true }).first()
  ).toBeVisible()
  await expect(
    control(page).getByText("PM", { exact: true }).first()
  ).toBeVisible()
  await expect(control(page)).toContainText("Started")
  await expect(control(page)).toContainText("Completed")
})

test("a locked record is read only, with no buttons", async ({ page }) => {
  const { project, om } = await setUp()

  await openD13(project.id)
  await addRecord(project.id, "D1.3", "locked")
  await open(page, om.email, project.id, "D1.3")

  await expect(page.getByText("Locked", { exact: true })).toBeVisible()

  for (const name of ["Save draft", "Submit", "Approve"]) {
    await expect(page.getByRole("button", { name })).toHaveCount(0)
  }
})

test("at 375px the page does not scroll sideways and its buttons work", async ({
  page,
}) => {
  const { project, lead } = await setUp()

  await lockEarlierTools(project.id)
  await page.setViewportSize({ width: 375, height: 812 })
  await open(page, lead.email, project.id, "D1.8")

  expect(await sidewaysScroll(page)).toBeLessThanOrEqual(0)

  await notes(page).fill("Lea")
  await expect(page.getByRole("button", { name: "Submit" })).toBeVisible()
  await page.getByRole("button", { name: "Save draft" }).click()

  await expect(page.getByText("Draft saved.")).toBeVisible()
  expect(await sidewaysScroll(page)).toBeLessThanOrEqual(0)
})
