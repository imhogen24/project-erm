import { expect, test, type Page } from "@playwright/test"

import {
  expireInvite,
  giveRoles,
  makeAdmin,
  makeInvite,
  makePerson,
  makeProject,
  qualificationsFor,
  sidewaysScroll,
  signIn,
  tag,
  useUpInvite,
} from "./support/data"

const EXPIRED = "This invite has expired. Ask your administrator for a new one."

const USED = "This invite has already been used."

const MISMATCH = "The passwords do not match."

async function setUp() {
  const project = await makeProject(`Boiler ${tag()}`)
  const admin = await makeAdmin()

  return { project, admin }
}

test("an IT/Admin sees the invite form", async ({ page }) => {
  const { admin } = await setUp()

  await signIn(page, admin.email)
  await page.goto("/admin/invites")

  await expect(page).toHaveURL(/\/admin\/invites$/)
  await expect(page.getByLabel("Email")).toBeVisible()
  await expect(page.getByLabel("Name")).toBeVisible()
  await expect(page.getByLabel("Project", { exact: true })).toBeVisible()
  await expect(
    page.getByRole("checkbox", { name: "PM", exact: true })
  ).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Create invite" })
  ).toBeVisible()
})

test("a person who is not an IT/Admin is sent to /", async ({ page }) => {
  const project = await makeProject()
  const pm = await makePerson()

  await giveRoles(pm.id, project.id, ["PM"])
  await signIn(page, pm.email)
  await page.goto("/admin/invites")

  await expect(page).toHaveURL(/\/$/)
})

test("a signed-out visitor is sent to /sign-in from the invite form", async ({
  page,
}) => {
  await page.goto("/admin/invites")

  await expect(page).toHaveURL(/\/sign-in$/)
})

test("submitting the form shows the invite link, and Copy copies it", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"])

  const { project, admin } = await setUp()

  await signIn(page, admin.email)
  await page.goto("/admin/invites")
  await page.getByLabel("Email").fill(`${tag()}@example.com`)
  await page.getByLabel("Name").fill("Kofi Boateng")
  await page.getByLabel("Project", { exact: true }).click()
  await page.getByRole("option", { name: project.name }).click()
  await page.getByRole("checkbox", { name: "PM", exact: true }).click()
  await page.getByRole("checkbox", { name: "LE", exact: true }).click()
  await page.getByRole("button", { name: "Create invite" }).click()

  const link = page.getByRole("textbox", { name: "Invite link" })

  await expect(link).toHaveValue(/\/invite\/[A-Za-z0-9_-]{20,}$/)

  await page.getByRole("button", { name: "Copy" }).click()

  const copied = await page.evaluate(() => navigator.clipboard.readText())

  expect(copied).toBe(await link.inputValue())
})

test("the form asks for at least one role before sending anything", async ({
  page,
}) => {
  const { project, admin } = await setUp()
  const sent: string[] = []

  page.on("request", (request) => {
    if (request.headers()["next-action"]) {
      sent.push(request.url())
    }
  })

  await signIn(page, admin.email)
  await page.goto("/admin/invites")
  await page.getByLabel("Email").fill(`${tag()}@example.com`)
  await page.getByLabel("Name").fill("Kofi Boateng")
  await page.getByLabel("Project", { exact: true }).click()
  await page.getByRole("option", { name: project.name }).click()
  await page.getByRole("button", { name: "Create invite" }).click()

  await expect(page.getByText("Choose at least one role.")).toBeVisible()
  expect(sent).toEqual([])
})

test("inviting someone who already has an account adds the roles instead", async ({
  page,
}) => {
  const { project, admin } = await setUp()
  const existing = await makePerson()

  await signIn(page, admin.email)
  await page.goto("/admin/invites")
  await page.getByLabel("Email").fill(existing.email)
  await page.getByLabel("Name").fill(existing.name)
  await page.getByLabel("Project", { exact: true }).click()
  await page.getByRole("option", { name: project.name }).click()
  await page.getByRole("checkbox", { name: "OM", exact: true }).click()
  await page.getByRole("button", { name: "Create invite" }).click()

  await expect(page.getByText(/already has an account/)).toBeVisible()
  await expect(page.getByRole("textbox", { name: "Invite link" })).toHaveCount(
    0
  )
})

test("accepting an invite signs the person in and lands on /", async ({
  page,
}) => {
  const { project, admin } = await setUp()
  const invite = await makeInvite(admin.id, project.id)

  await page.goto(`/invite/${invite.token}`)

  await expect(page.getByLabel("Name")).toHaveValue(invite.name)
  await expect(page.getByLabel("Name")).toHaveAttribute("readonly", "")
  await expect(page.getByLabel("Email")).toHaveValue(invite.email)
  await expect(page.getByLabel("Email")).toHaveAttribute("readonly", "")

  await page.getByLabel("Password", { exact: true }).fill("a-good-password")
  await page.getByLabel("Confirm password").fill("a-good-password")
  await page.getByRole("button", { name: "Create account" }).click()

  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByText(project.name).first()).toBeVisible()
})

test("an expired invite shows the expired message and no form", async ({
  page,
}) => {
  const { project, admin } = await setUp()
  const invite = await makeInvite(admin.id, project.id)

  await expireInvite(invite.email)
  await page.goto(`/invite/${invite.token}`)

  await expect(page.getByText(EXPIRED)).toBeVisible()
  await expect(page.getByLabel("Password", { exact: true })).toHaveCount(0)
})

test("a used invite shows the used message and no form", async ({ page }) => {
  const { project, admin } = await setUp()
  const invite = await makeInvite(admin.id, project.id)

  await useUpInvite(invite.token)
  await page.goto(`/invite/${invite.token}`)

  await expect(page.getByText(USED)).toBeVisible()
  await expect(page.getByLabel("Password", { exact: true })).toHaveCount(0)
})

test("an invite link that does not exist shows the not found page", async ({
  page,
}) => {
  await page.goto("/invite/not-a-real-token")

  await expect(page.getByText("This page could not be found.")).toBeVisible()
})

test("two different passwords show the mismatch message and send nothing", async ({
  page,
}) => {
  const { project, admin } = await setUp()
  const invite = await makeInvite(admin.id, project.id)
  const sent: string[] = []

  page.on("request", (request) => {
    if (request.headers()["next-action"]) {
      sent.push(request.url())
    }
  })

  await page.goto(`/invite/${invite.token}`)
  await page.getByLabel("Password", { exact: true }).fill("a-good-password")
  await page.getByLabel("Confirm password").fill("a-different-one")
  await page.getByRole("button", { name: "Create account" }).click()

  await expect(page.getByText(MISMATCH)).toBeVisible()
  expect(sent).toEqual([])
})

test("a password under 8 characters is refused with a message", async ({
  page,
}) => {
  const { project, admin } = await setUp()
  const invite = await makeInvite(admin.id, project.id)

  await page.goto(`/invite/${invite.token}`)
  await page.getByLabel("Password", { exact: true }).fill("short")
  await page.getByLabel("Confirm password").fill("short")
  await page.getByRole("button", { name: "Create account" }).click()

  await expect(
    page.getByText("A password needs at least 8 characters.")
  ).toBeVisible()
  await expect(page).toHaveURL(/\/invite\//)
})

test("at 375px both pages do not scroll sideways and can be used", async ({
  page,
}) => {
  const { project, admin } = await setUp()
  const invite = await makeInvite(admin.id, project.id)

  await page.setViewportSize({ width: 375, height: 812 })

  await page.goto(`/invite/${invite.token}`)

  expect(await sidewaysScroll(page)).toBeLessThanOrEqual(0)
  await expect(
    page.getByRole("button", { name: "Create account" })
  ).toBeVisible()

  await signIn(page, admin.email)
  await page.goto("/admin/invites")

  expect(await sidewaysScroll(page)).toBeLessThanOrEqual(0)
  await expect(
    page.getByRole("button", { name: "Create invite" })
  ).toBeVisible()
})

test("on a phone an IT/Admin reaches the invite page from the top bar", async ({
  page,
}) => {
  const { admin } = await setUp()

  await page.setViewportSize({ width: 375, height: 812 })
  await signIn(page, admin.email)
  await page.getByRole("link", { name: "Invite people" }).click()

  await expect(page).toHaveURL(/\/admin\/invites$/)
})

test("on a phone a person who is not an IT/Admin has no invite link", async ({
  page,
}) => {
  const project = await makeProject()
  const pm = await makePerson()

  await giveRoles(pm.id, project.id, ["PM"])
  await page.setViewportSize({ width: 375, height: 812 })
  await signIn(page, pm.email)

  await expect(page.getByRole("link", { name: "Invite people" })).toHaveCount(0)
})

const QUALIFICATION_NOTE =
  "These roles say what the person can be assigned. They give no access until an IT/Admin assigns the person to a project. IT/Admin is the exception: it applies to every project."

const CLIENT_NOTE = "Client is only given on one project."

async function openInvites(page: Page) {
  const { project, admin } = await setUp()

  await signIn(page, admin.email)
  await page.goto("/admin/invites")

  return { project, admin }
}

test("the access choice starts on One project, with the project field", async ({
  page,
}) => {
  await openInvites(page)

  await expect(page.getByRole("radio", { name: "One project" })).toBeChecked()
  await expect(
    page.getByRole("radio", { name: "All projects" })
  ).not.toBeChecked()
  await expect(page.getByLabel("Project", { exact: true })).toBeVisible()
  await expect(page.getByText(QUALIFICATION_NOTE)).toHaveCount(0)
  await expect(page.getByRole("checkbox", { name: "Client" })).toBeEnabled()
})

test("All projects hides the project field, shows the note and disables Client", async ({
  page,
}) => {
  await openInvites(page)
  await page.getByRole("radio", { name: "All projects" }).click()

  await expect(page.getByLabel("Project", { exact: true })).toHaveCount(0)
  await expect(page.getByText(QUALIFICATION_NOTE)).toBeVisible()
  await expect(page.getByRole("checkbox", { name: "Client" })).toBeDisabled()
  await expect(page.getByText(CLIENT_NOTE)).toBeVisible()
})

test("choosing All projects unticks Client", async ({ page }) => {
  await openInvites(page)
  await page.getByRole("checkbox", { name: "Client" }).click()
  await expect(page.getByRole("checkbox", { name: "Client" })).toBeChecked()
  await page.getByRole("radio", { name: "All projects" }).click()

  await expect(page.getByRole("checkbox", { name: "Client" })).not.toBeChecked()
  await expect(page.getByRole("checkbox", { name: "Client" })).toBeDisabled()
})

test("an invite for All projects makes the person qualified, with no access", async ({
  page,
}) => {
  const { project } = await openInvites(page)
  const email = `${tag()}@example.com`

  await page.getByLabel("Email").fill(email)
  await page.getByLabel("Name").fill("Esi Mensah")
  await page.getByRole("radio", { name: "All projects" }).click()
  await page.getByRole("checkbox", { name: "OM", exact: true }).click()
  await page.getByRole("button", { name: "Create invite" }).click()

  const link = page.getByRole("textbox", { name: "Invite link" })

  await expect(link).toHaveValue(/\/invite\/[A-Za-z0-9_-]{20,}$/)

  const url = await link.inputValue()

  await page.context().clearCookies()
  await page.goto(url)
  await page.getByLabel("Password", { exact: true }).fill("a-good-password")
  await page.getByLabel("Confirm password").fill("a-good-password")
  await page.getByRole("button", { name: "Create account" }).click()

  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByText(project.name)).toHaveCount(0)
  expect(await qualificationsFor(email)).toEqual(["OM"])
})

test("going back to One project shows an empty project field and enables Client", async ({
  page,
}) => {
  await openInvites(page)
  await page.getByRole("radio", { name: "All projects" }).click()
  await page.getByRole("radio", { name: "One project" }).click()

  await expect(page.getByLabel("Project", { exact: true })).toBeVisible()
  await expect(page.getByLabel("Project", { exact: true })).toContainText(
    "Choose a project"
  )
  await expect(page.getByText(QUALIFICATION_NOTE)).toHaveCount(0)
  await expect(page.getByRole("checkbox", { name: "Client" })).toBeEnabled()
})

test("at 375px All projects does not scroll sideways and every control works", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await openInvites(page)
  await page.getByRole("radio", { name: "All projects" }).click()

  expect(await sidewaysScroll(page)).toBeLessThanOrEqual(0)
  await expect(page.getByText(QUALIFICATION_NOTE)).toBeVisible()
  await expect(page.getByLabel("Email")).toBeVisible()
  await expect(page.getByLabel("Name")).toBeVisible()

  await page.getByRole("checkbox", { name: "OM", exact: true }).click()
  await expect(
    page.getByRole("checkbox", { name: "OM", exact: true })
  ).toBeChecked()
  await expect(
    page.getByRole("button", { name: "Create invite" })
  ).toBeVisible()
})
