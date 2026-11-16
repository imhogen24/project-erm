import { expect, test, type Locator, type Page } from "@playwright/test"

import {
  addClientRequest,
  addRecord,
  giveRoles,
  lockEarlierTools,
  makeClient,
  makePerson,
  makeProject,
  signIn,
  tag,
} from "./support/data"

// RDP-153 (F001): every tool saves by itself as the person types. The foot of
// the sheet says "Saving…" then "✓ Saved". When a save fails it says so and
// tries again, and leaving the page asks first. Nothing else ever asks.

const LEAVE = "Your latest changes are not saved yet. Leave anyway?"

const STALE = "Someone else saved this record. Reload to see their changes."

type Screen = {
  name: string
  // Makes a project where this person may write the tool, and says where.
  setUp: () => Promise<{ projectId: string; email: string; toolId: string }>
  // A box to type in, and how it is read back.
  field: (page: Page) => Locator
}

function ahead(days: number) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10)
}

// The tools before D1.5 locked, and D1.4's email delivered, so D1.5 opens.
async function upToD15(projectId: string) {
  await addClientRequest(projectId, {
    contact_person: "Kwaku Ampofo",
    email: `${tag()}@example.com`,
    project_title: "Packaged boiler skid",
  })

  for (const toolId of ["D1.1", "D1.2", "D1.3", "D1.4"]) {
    await addRecord(
      projectId,
      toolId,
      "locked",
      toolId === "D1.4" ? { payload: { deliveryStatus: "Delivered" } } : {}
    )
  }
}

// D1.8, a tool drawn by the shared record form: the LE writes it.
const needs: Screen = {
  name: "D1.8 (record form)",
  async setUp() {
    const project = await makeProject(`Boiler ${tag()}`)
    const lead = await makePerson()

    await giveRoles(lead.id, project.id, ["LE"])
    await lockEarlierTools(project.id)

    return { projectId: project.id, email: lead.email, toolId: "D1.8" }
  },
  field: (page) =>
    page.getByLabel("Confirmed Constraints / Specifications, row 1", {
      exact: true,
    }),
}

// D1.2, its own screen: the OM describes the client's files.
const triage: Screen = {
  name: "D1.2 (triage screen)",
  async setUp() {
    const project = await makeProject(`Trailer ${tag()}`)
    const om = await makePerson()

    await giveRoles(om.id, project.id, ["OM"])
    await addRecord(project.id, "D1.1", "locked", {
      payload: {
        attachedFiles: [
          {
            label: "Photo 1",
            dateUploaded: "2026-11-03",
            fileLink: "https://utfs.io/f/autosave-one",
          },
        ],
      },
    })
    await addClientRequest(project.id, {
      email: "client@example.com",
      created_at: "2026-11-03T09:14:00+00:00",
    })

    return { projectId: project.id, email: om.email, toolId: "D1.2" }
  },
  field: (page) =>
    page.getByRole("textbox", { name: "Description of Photo 1" }),
}

// D1.5, its own screen: the OM proposes meeting times.
const proposal: Screen = {
  name: "D1.5 (meeting proposal)",
  async setUp() {
    const project = await makeProject(`Boiler ${tag()}`)
    const om = await makePerson()

    await giveRoles(om.id, project.id, ["OM"])
    await upToD15(project.id)

    return { projectId: project.id, email: om.email, toolId: "D1.5" }
  },
  field: (page) => page.getByRole("textbox", { name: "Note", exact: true }),
}

// D1.6, its own screen: the OM writes the agenda.
const agenda: Screen = {
  name: "D1.6 (calendar and agenda)",
  async setUp() {
    const project = await makeProject(`Boiler ${tag()}`)
    const om = await makePerson()
    const client = await makeClient()

    await giveRoles(om.id, project.id, ["OM"])
    await giveRoles(client.id, project.id, ["Client"])
    await upToD15(project.id)
    await addRecord(project.id, "D1.5", "locked", {
      payload: {
        chosenSlot: 1,
        agreedDate: ahead(7),
        agreedTime: "14:00",
        agreedTimeZone: "Africa/Accra",
        clientConfirmed: true,
        platform: "Google Meet",
        meetingLink: "https://meet.google.com/zpr-zhib-amp",
      },
    })

    return { projectId: project.id, email: om.email, toolId: "D1.6" }
  },
  field: (page) => page.getByLabel("Topic 1", { exact: true }),
}

// D1.13, the record form with the alignment meeting's buttons beside it.
const scope: Screen = {
  name: "D1.13 (scope of work)",
  async setUp() {
    const project = await makeProject(`Boiler ${tag()}`)
    const lead = await makePerson()

    await giveRoles(lead.id, project.id, ["LE"])
    await addClientRequest(project.id, {
      contact_person: "Kwaku Ampofo",
      email: `${tag()}@example.com`,
      project_title: "Packaged boiler skid",
    })
    await lockEarlierTools(project.id)

    for (const toolId of ["D1.8", "D1.9", "D1.12"]) {
      await addRecord(project.id, toolId, "locked")
    }

    await addRecord(project.id, "D1.10", "locked", {
      payload: { overallCapabilityStatus: "Capable" },
    })
    await addRecord(project.id, "D1.11", "locked", {
      payload: { goNoGoDecision: "Go" },
    })

    return { projectId: project.id, email: lead.email, toolId: "D1.13" }
  },
  field: (page) =>
    page.getByRole("textbox", { name: "Project Vision / Primary Goal" }),
}

const screens = [needs, triage, proposal, agenda, scope]

// Waits for the scripts, so typing goes to the live form and not to the text
// the server drew first.
async function open(page: Page, projectId: string, toolId: string) {
  await page.goto(`/projects/${projectId}/tools/${toolId}`, {
    waitUntil: "networkidle",
  })
}

function saved(page: Page) {
  return page.getByRole("status").filter({ hasText: "✓ Saved" })
}

function retrying(page: Page) {
  return page.getByRole("status").filter({ hasText: /Not saved\. Retrying/ })
}

// The back arrow in the sheet's top bar.
function overview(page: Page) {
  return page.getByRole("link", { name: "Project overview" })
}

function leaveDialog(page: Page) {
  return page.getByRole("alertdialog")
}

for (const screen of screens) {
  test.describe(screen.name, () => {
    test("has no Save draft, saves by itself, and keeps the text after leaving", async ({
      page,
    }) => {
      const { projectId, email, toolId } = await screen.setUp()

      await signIn(page, email)
      await open(page, projectId, toolId)

      await expect(
        page.getByRole("button", { name: "Save draft" })
      ).toHaveCount(0)

      await screen.field(page).fill("Written by itself")

      await expect(saved(page)).toBeVisible()

      await overview(page).click()
      await expect(page).toHaveURL(new RegExp(`/projects/${projectId}$`))
      await expect(leaveDialog(page)).toHaveCount(0)

      await open(page, projectId, toolId)

      await expect(screen.field(page)).toHaveValue("Written by itself")
    })

    test("typing and leaving at once still saves", async ({ page }) => {
      const { projectId, email, toolId } = await screen.setUp()

      await signIn(page, email)
      await open(page, projectId, toolId)
      await screen.field(page).fill("Left at once")
      await overview(page).click()

      await expect(page).toHaveURL(new RegExp(`/projects/${projectId}$`))
      await expect(leaveDialog(page)).toHaveCount(0)

      await open(page, projectId, toolId)

      await expect(screen.field(page)).toHaveValue("Left at once")
    })

    test("offline, it says it is retrying, asks before leaving, and saves once back", async ({
      page,
      context,
    }) => {
      const { projectId, email, toolId } = await screen.setUp()

      await signIn(page, email)
      await open(page, projectId, toolId)

      await context.setOffline(true)
      await screen.field(page).fill("Typed offline")

      await expect(retrying(page)).toBeVisible()

      // Stay keeps the page and what was typed.
      await overview(page).click()
      await expect(leaveDialog(page)).toContainText(LEAVE)
      await expect(
        leaveDialog(page).getByRole("button", { name: "Leave" })
      ).toBeVisible()
      await leaveDialog(page).getByRole("button", { name: "Stay" }).click()

      await expect(leaveDialog(page)).toHaveCount(0)
      await expect(page).toHaveURL(new RegExp(`/tools/${toolId}$`))
      await expect(screen.field(page)).toHaveValue("Typed offline")

      // Back online, the retry saves it, and leaving no longer asks.
      await context.setOffline(false)

      await expect(saved(page)).toBeVisible({ timeout: 15_000 })

      await overview(page).click()
      await expect(page).toHaveURL(new RegExp(`/projects/${projectId}$`))
      await expect(leaveDialog(page)).toHaveCount(0)

      await open(page, projectId, toolId)

      await expect(screen.field(page)).toHaveValue("Typed offline")
    })
  })
}

test("Leave goes anyway when a save has failed", async ({ page, context }) => {
  const { projectId, email, toolId } = await needs.setUp()

  await signIn(page, email)
  await open(page, projectId, toolId)

  await context.setOffline(true)
  await needs.field(page).fill("Typed offline")
  await expect(retrying(page)).toBeVisible()

  await overview(page).click()
  await expect(leaveDialog(page)).toContainText(LEAVE)

  // Back online only so the next page can load; the dialog is still open.
  await context.setOffline(false)
  await leaveDialog(page).getByRole("button", { name: "Leave" }).click()

  await expect(page).toHaveURL(new RegExp(`/projects/${projectId}$`))
})

test("closing the tab while a save has failed asks first", async ({
  page,
  context,
}) => {
  const { projectId, email, toolId } = await needs.setUp()

  await signIn(page, email)
  await open(page, projectId, toolId)

  await context.setOffline(true)
  await needs.field(page).click()
  await page.keyboard.type("Typed offline")
  await expect(retrying(page)).toBeVisible()

  const asked = page.waitForEvent("dialog")

  await page.close({ runBeforeUnload: true })

  const dialog = await asked

  expect(dialog.type()).toBe("beforeunload")
  await dialog.dismiss()
})

test("closing the tab once everything is saved asks nothing", async ({
  page,
}) => {
  const { projectId, email, toolId } = await needs.setUp()

  await signIn(page, email)
  await open(page, projectId, toolId)
  await needs.field(page).click()
  await page.keyboard.type("Saved first")
  await expect(saved(page)).toBeVisible()

  let asked = false

  page.on("dialog", async (dialog) => {
    asked = true
    await dialog.dismiss()
  })

  await page.close({ runBeforeUnload: true })

  expect(asked).toBe(false)
})

test("someone else's newer save keeps the text and asks to reload", async ({
  page,
}) => {
  const { projectId, email, toolId } = await needs.setUp()

  await addRecord(projectId, toolId, "draft")
  await signIn(page, email)
  await open(page, projectId, toolId)

  const second = await page.context().newPage()

  await open(second, projectId, toolId)

  await needs.field(page).fill("Lea")
  await expect(saved(page)).toBeVisible()

  await needs.field(second).fill("Leo")

  await expect(second.getByText(STALE)).toBeVisible()
  await expect(needs.field(second)).toHaveValue("Leo")

  await second.getByRole("button", { name: "Reload" }).click()

  await expect(needs.field(second)).toHaveValue("Lea")
})

test("a half-filled draft saves without the required fields", async ({
  page,
}) => {
  // D1.13's vision is required, but saving never checks.
  const { projectId, email, toolId } = await scope.setUp()

  await signIn(page, email)
  await open(page, projectId, toolId)
  await page
    .getByRole("textbox", { name: "Project Vision / Primary Goal" })
    .fill("Only the vision")

  await expect(saved(page)).toBeVisible()
  await expect(page.getByText("Required")).toHaveCount(0)
  await expect(
    page.getByRole("button", { name: "Submit for approval" })
  ).toBeVisible()
})
