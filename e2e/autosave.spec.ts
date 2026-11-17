import { expect, test, type Page } from "@playwright/test"

import {
  addRecord,
  giveRoles,
  lockEarlierTools,
  makePerson,
  makeProject,
  signIn,
  tag,
} from "./support/data"

// D1.2 is open for the OM once D1.1 is locked. D1.3 is a standard sheet.
async function setUp() {
  const project = await makeProject(`Autosave ${tag()}`)
  const om = await makePerson()

  await giveRoles(om.id, project.id, ["OM"])
  await addRecord(project.id, "D1.1", "locked")

  return { project, om }
}

async function open(page: Page, email: string, path: string) {
  await signIn(page, email)
  await page.goto(path, { waitUntil: "networkidle" })
}

function note(page: Page) {
  return page.getByRole("textbox", {
    name: /^Reviewer notes: Is the notification/,
  })
}

// A link in the app away from the tool.
function projectLink(page: Page) {
  return page.getByRole("link", { name: "Project overview" }).first()
}

test("D1.2 saves a note by itself, and it is there after going away and back", async ({
  page,
}) => {
  const { project, om } = await setUp()
  const path = `/projects/${project.id}/tools/D1.2`

  await open(page, om.email, path)

  await expect(page.getByRole("button", { name: "Save draft" })).toHaveCount(0)

  await note(page).fill("Readable, no links.")
  // The first save also builds the page's actions on the dev server.
  await expect(page.getByText("✓ Saved")).toBeVisible({ timeout: 20_000 })

  await projectLink(page).click()
  await expect(page).toHaveURL(`/projects/${project.id}`)

  await page.goto(path, { waitUntil: "networkidle" })
  await expect(note(page)).toHaveValue("Readable, no links.")
})

test("typing and leaving at once saves first, then goes", async ({ page }) => {
  const { project, om } = await setUp()
  const path = `/projects/${project.id}/tools/D1.2`

  await open(page, om.email, path)
  await note(page).fill("Saved on the way out.")
  await projectLink(page).click()

  await expect(page).toHaveURL(`/projects/${project.id}`)
  await expect(
    page.getByText("Your latest changes are not saved yet. Leave anyway?")
  ).toHaveCount(0)

  await page.goto(path, { waitUntil: "networkidle" })
  await expect(note(page)).toHaveValue("Saved on the way out.")
})

test("offline, it says it is retrying, asks before leaving, and saves once back", async ({
  page,
  context,
}) => {
  const { project, om } = await setUp()
  const path = `/projects/${project.id}/tools/D1.2`

  await open(page, om.email, path)
  await context.setOffline(true)
  await note(page).fill("Typed with no connection.")

  await expect(page.getByText("Not saved. Retrying…")).toBeVisible()

  await projectLink(page).click()

  const question = page.getByRole("alertdialog", {
    name: "Your latest changes are not saved yet. Leave anyway?",
  })

  await expect(question).toBeVisible()
  await question.getByRole("button", { name: "Stay" }).click()
  await expect(question).toHaveCount(0)
  await expect(page).toHaveURL(path)
  await expect(note(page)).toHaveValue("Typed with no connection.")

  await context.setOffline(false)
  await expect(page.getByText("✓ Saved")).toBeVisible({ timeout: 15_000 })

  await page.reload({ waitUntil: "networkidle" })
  await expect(note(page)).toHaveValue("Typed with no connection.")
})

test("a standard sheet saves by itself too, with Submit for approval and no Save draft", async ({
  page,
}) => {
  // D1.8 is written by the LE and opens once the tools before it are locked.
  const project = await makeProject(`Autosave ${tag()}`)
  const lead = await makePerson()

  await giveRoles(lead.id, project.id, ["LE"])
  await lockEarlierTools(project.id)
  await open(page, lead.email, `/projects/${project.id}/tools/D1.8`)

  await expect(
    page.getByRole("button", { name: "Submit for approval" })
  ).toBeVisible()
  await expect(page.getByRole("button", { name: "Save draft" })).toHaveCount(0)

  const first = page.getByRole("textbox").first()

  await first.fill("A new trailer")
  await expect(page.getByText("✓ Saved")).toBeVisible()

  await page.reload({ waitUntil: "networkidle" })
  await expect(page.getByRole("textbox").first()).toHaveValue("A new trailer")
})
