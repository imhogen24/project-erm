import { expect, test, type Page } from "@playwright/test"

import {
  addClientRequest,
  addRecord,
  giveRoles,
  makePerson,
  makeProject,
  sidewaysScroll,
  signIn,
  tag,
} from "./support/data"

const NOT_FOUND = "This page could not be found."

// A project whose D1.1 is approved, so D1.2 is open, with the website's saved
// copy of the request.
async function setUp(withCopy = true) {
  const project = await makeProject(`Trailer ${tag()}`)
  const om = await makePerson()
  const pm = await makePerson()

  await giveRoles(om.id, project.id, ["OM"])
  await giveRoles(pm.id, project.id, ["PM"])
  await addRecord(project.id, "D1.1", "locked", {
    payload: { requestStatus: "Approved", attachedFiles: [] },
  })

  if (withCopy) {
    await addClientRequest(project.id, {
      email: "client@example.com",
      created_at: "2026-11-03T09:14:00+00:00",
    })
  }

  return { project, om, pm }
}

async function open(page: Page, email: string, projectId: string) {
  await signIn(page, email)
  await page.goto(`/projects/${projectId}/tools/D1.2`)
}

function details(page: Page) {
  return page.getByRole("region", { name: "Request details" })
}

test("the OM sees where the request came from before D1.2 has a record", async ({
  page,
}) => {
  const { project, om } = await setUp()

  await open(page, om.email, project.id)

  const block = details(page)

  await expect(block.getByText("Notification source")).toBeVisible()
  await expect(block.getByText("Web Form", { exact: true })).toBeVisible()
  await expect(block.getByText("3 Nov 2026, 09:14 UTC")).toBeVisible()
  await expect(block.getByText("client@example.com")).toBeVisible()
  await expect(block.getByText("Not applicable (web form)")).toHaveCount(2)
})

test("the PM sees the same details", async ({ page }) => {
  const { project, pm } = await setUp()

  await open(page, pm.email, project.id)

  await expect(details(page).getByText("client@example.com")).toBeVisible()
})

test("the block has no inputs", async ({ page }) => {
  const { project, om } = await setUp()

  await open(page, om.email, project.id)

  await expect(details(page).getByRole("textbox")).toHaveCount(0)
  await expect(details(page).getByRole("combobox")).toHaveCount(0)
})

test("a project with no saved request says so and nothing fails", async ({
  page,
}) => {
  const { project, om } = await setUp(false)

  await open(page, om.email, project.id)

  await expect(
    details(page).getByText("This project has no saved request.")
  ).toBeVisible()
})

test("a client never reaches the page, and another tool shows no details", async ({
  page,
}) => {
  const { project, om } = await setUp()
  const client = await makePerson()

  await giveRoles(client.id, project.id, ["Client"])

  await open(page, client.email, project.id)
  await expect(page.getByText(NOT_FOUND)).toBeVisible()
  await expect(details(page)).toHaveCount(0)

  await page.context().clearCookies()
  await signIn(page, om.email)
  await page.goto(`/projects/${project.id}/tools/D1.1`)
  await expect(details(page)).toHaveCount(0)
})

test("at 375px nothing scrolls sideways", async ({ page }) => {
  const { project, om } = await setUp()

  await page.setViewportSize({ width: 375, height: 812 })
  await open(page, om.email, project.id)

  await expect(details(page).getByText("client@example.com")).toBeVisible()
  expect(await sidewaysScroll(page)).toBeLessThanOrEqual(0)
})
