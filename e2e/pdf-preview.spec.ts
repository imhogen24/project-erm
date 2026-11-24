import { expect, test, type Page } from "@playwright/test"

import {
  addRecord,
  giveRoles,
  makePerson,
  makeProject,
  sidewaysScroll,
  signIn,
  tag,
} from "./support/data"

// The dev form preview has three appendices. Appendix A shows the project's
// D1.15, read for whoever is signed in; B is not started and C has no access.
// Under the permission matrix the PM reads D1.15 and the HE does not.
async function setUp() {
  const project = await makeProject(`Rice Mill ${tag()}`)
  const pm = await makePerson(`Ama ${tag()}`)
  const he = await makePerson(`Kofi ${tag()}`)

  await giveRoles(pm.id, project.id, ["PM"])
  await giveRoles(he.id, project.id, ["HE"])
  await addRecord(project.id, "D1.15", "locked", {
    payload: { projectTitle: "Rice mill dryer" },
  })

  return { project, pm, he }
}

const appendixA = "Appendix A: D1.15 Project Brief & Draft Budget"

async function openPreview(page: Page, email: string, projectId: string) {
  await signIn(page, email)
  await page.goto(`/dev/form-preview?project=${projectId}`)
}

test("View opens the tool's PDF in a panel, with Download and Open", async ({
  page,
}) => {
  const { project, pm } = await setUp()
  const href = `/api/projects/${project.id}/tools/D1.15/pdf`

  await openPreview(page, pm.email, project.id)
  await page.getByRole("button", { name: `View ${appendixA}` }).click()

  const panel = page.getByRole("dialog", { name: appendixA })

  await expect(panel).toBeVisible()
  await expect(panel.locator("iframe")).toHaveAttribute("src", href)
  await expect(panel.getByRole("link", { name: "Download" })).toHaveAttribute(
    "href",
    `${href}?download=1`
  )
  await expect(panel.getByRole("link", { name: "Open" })).toHaveAttribute(
    "target",
    "_blank"
  )

  const shown = await page.request.get(href)

  expect(shown.status()).toBe(200)
  expect(shown.headers()["content-type"]).toBe("application/pdf")
  expect(shown.headers()["content-disposition"]).toMatch(/^inline;/)

  const saved = await page.request.get(`${href}?download=1`)

  expect(saved.headers()["content-disposition"]).toMatch(/^attachment;/)
})

test("a preview with nothing to show says why, with View disabled", async ({
  page,
}) => {
  const { project, pm } = await setUp()

  await openPreview(page, pm.email, project.id)

  await expect(
    page.getByRole("button", {
      name: "View Appendix B: D1.13 Draft Scope of Work",
    })
  ).toBeDisabled()
  await expect(page.getByText("Not started", { exact: true })).toBeVisible()
  await expect(page.getByText("No access", { exact: true })).toBeVisible()
})

test("someone who cannot read the tool gets no PDF, even by its address", async ({
  page,
}) => {
  const { project, he } = await setUp()

  await openPreview(page, he.email, project.id)

  await expect(
    page.getByRole("button", { name: `View ${appendixA}` })
  ).toBeDisabled()

  const response = await page.request.get(
    `/api/projects/${project.id}/tools/D1.15/pdf`
  )

  expect(response.status()).toBe(404)
  expect(response.headers()["content-type"]).not.toBe("application/pdf")
})

test("on a phone the panel fills the screen and nothing scrolls sideways", async ({
  page,
}) => {
  const { project, pm } = await setUp()

  await page.setViewportSize({ width: 375, height: 812 })
  await openPreview(page, pm.email, project.id)
  await page.getByRole("button", { name: `View ${appendixA}` }).click()

  const panel = page.getByRole("dialog", { name: appendixA })

  await expect(panel).toBeVisible()
  expect((await panel.boundingBox())?.width).toBe(375)
  await expect(panel.getByRole("link", { name: "Open" })).toBeVisible()
  expect(await sidewaysScroll(page)).toBe(0)
})
