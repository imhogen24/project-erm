import { expect, test, type Page } from "@playwright/test"

import {
  giveRoles,
  makeAdmin,
  makePerson,
  makeProject,
  makeQualified,
  sidewaysScroll,
  signIn,
  tag,
  withNoOneElseQualified,
} from "./support/data"

// The assign pages show every person qualified for a role, so these tests share
// one list and run one after another.
test.describe.configure({ mode: "serial" })

async function signInAsAdmin(page: Page) {
  const admin = await makeAdmin()

  await signIn(page, admin.email)

  return admin
}

// A person already on `count` other active projects as `role`.
async function onProjects(personId: string, role: "PM" | "OM", count: number) {
  for (let each = 0; each < count; each += 1) {
    const project = await makeProject()

    await giveRoles(personId, project.id, [role])
  }
}

function section(page: Page, name: string) {
  return page.getByRole("region", { name, exact: true })
}

test("the list shows only projects that still need a PM or an OM", async ({
  page,
}) => {
  const bare = await makeProject(`Bare ${tag()}`)
  const crewed = await makeProject(`Crewed ${tag()}`)

  await giveRoles((await makePerson()).id, crewed.id, ["PM"])
  await giveRoles((await makePerson()).id, crewed.id, ["OM"])
  await signInAsAdmin(page)
  await page.goto("/admin/team")

  const row = page.getByRole("listitem").filter({ hasText: bare.name })

  await expect(row).toBeVisible()
  await expect(row).toContainText("Tier 1")
  await expect(row).toContainText("Missing: PM, OM, Finance")
  await expect(row.getByRole("link", { name: "Assign" })).toBeVisible()
  await expect(page.getByText(crewed.name)).toHaveCount(0)
})

test("a person who is not an IT/Admin is sent to / from both pages", async ({
  page,
}) => {
  const project = await makeProject()
  const pm = await makePerson()

  await giveRoles(pm.id, project.id, ["PM"])
  await signIn(page, pm.email)

  await page.goto("/admin/team")
  await expect(page).toHaveURL(/\/$/)

  await page.goto(`/admin/team/${project.id}`)
  await expect(page).toHaveURL(/\/$/)
})

test("choosing a free PM and pressing Assign puts them on the project", async ({
  page,
}) => {
  const project = await makeProject(`Boiler ${tag()}`)
  const pm = await makeQualified(`Ama ${tag()}`, ["PM"])

  await signInAsAdmin(page)
  await page.goto(`/admin/team/${project.id}`)

  const pmSection = section(page, "Project manager")

  await pmSection.getByRole("combobox").click()
  await page.getByRole("option", { name: new RegExp(pm.name) }).click()
  await pmSection.getByRole("button", { name: "Assign" }).click()

  await expect(pmSection.getByText(pm.name)).toBeVisible()
  await expect(
    pmSection.getByRole("button", { name: `Remove ${pm.name}` })
  ).toBeVisible()
  await expect(pmSection.getByRole("combobox")).toHaveCount(0)
})

test("each choice shows how many projects the person is on", async ({
  page,
}) => {
  const project = await makeProject()
  const pm = await makeQualified(`Kofi ${tag()}`, ["PM"])
  const om = await makeQualified(`Esi ${tag()}`, ["OM"])

  await onProjects(pm.id, "PM", 1)
  await onProjects(om.id, "OM", 2)
  await signInAsAdmin(page)
  await page.goto(`/admin/team/${project.id}`)

  await section(page, "Project manager").getByRole("combobox").click()
  await expect(
    page.getByRole("option", {
      name: new RegExp(`${pm.name}.*1 of 3 projects`),
    })
  ).toBeVisible()
  await page.keyboard.press("Escape")

  await section(page, "Onboarding manager").getByRole("combobox").click()
  await expect(
    page.getByRole("option", {
      name: new RegExp(`${om.name}.*2 of 6 projects`),
    })
  ).toBeVisible()
})

test("a person at their limit is shown but cannot be chosen", async ({
  page,
}) => {
  const project = await makeProject()
  const full = await makeQualified(`Full ${tag()}`, ["PM"])

  await onProjects(full.id, "PM", 3)
  await signInAsAdmin(page)
  await page.goto(`/admin/team/${project.id}`)
  await section(page, "Project manager").getByRole("combobox").click()

  const option = page.getByRole("option", { name: new RegExp(full.name) })

  await expect(option).toContainText("3 of 3 projects (full)")
  await expect(option).toHaveAttribute("aria-disabled", "true")
})

test("when every qualified PM is at the limit, it says nobody is free", async ({
  page,
}) => {
  const project = await makeProject()

  await withNoOneElseQualified("PM", async () => {
    const full = await makeQualified(`Full ${tag()}`, ["PM"])

    await makeQualified(`Free ${tag()}`, ["OM"])

    await onProjects(full.id, "PM", 3)
    await signInAsAdmin(page)
    await page.goto(`/admin/team/${project.id}`)

    await expect(
      section(page, "Project manager").getByText(
        "Nobody is free for this role."
      )
    ).toBeVisible()
    await expect(
      section(page, "Onboarding manager").getByText(
        "Nobody is free for this role."
      )
    ).toHaveCount(0)
  })
})

test("removing the OM takes them off and lists the project as missing an OM", async ({
  page,
}) => {
  const project = await makeProject(`Kiln ${tag()}`)
  const om = await makePerson(`Esi ${tag()}`)

  await giveRoles((await makePerson()).id, project.id, ["PM"])
  await giveRoles(om.id, project.id, ["OM"])
  await signInAsAdmin(page)

  await page.goto("/admin/team")
  await expect(page.getByText(project.name)).toHaveCount(0)

  await page.goto(`/admin/team/${project.id}`)

  const omSection = section(page, "Onboarding manager")

  await omSection.getByRole("button", { name: `Remove ${om.name}` }).click()

  await expect(omSection.getByText(om.name)).toHaveCount(0)
  await expect(omSection.getByRole("combobox")).toBeVisible()

  await page.goto("/admin/team")

  await expect(
    page.getByRole("listitem").filter({ hasText: project.name })
  ).toContainText(/Missing:.*OM/)
})

test("a refusal from the server shows next to the PM choice", async ({
  page,
}) => {
  const project = await makeProject()
  const first = await makePerson()
  const second = await makeQualified(`Late ${tag()}`, ["PM"])

  await signInAsAdmin(page)
  await page.goto(`/admin/team/${project.id}`)

  // Someone else becomes the PM while this page is still open.
  await giveRoles(first.id, project.id, ["PM"])

  const pmSection = section(page, "Project manager")

  await pmSection.getByRole("combobox").click()
  await page.getByRole("option", { name: new RegExp(second.name) }).click()
  await pmSection.getByRole("button", { name: "Assign" }).click()

  await expect(
    pmSection.getByText("This project already has a PM")
  ).toBeVisible()
})

test("engineers and the finance checker can be added several at a time", async ({
  page,
}) => {
  const project = await makeProject()
  const lead = await makeQualified(`Lea ${tag()}`, ["LE"])
  const assigned = await makeQualified(`Abu ${tag()}`, ["AE"])
  const officer = await makeQualified(`Fay ${tag()}`, ["FO"])

  await signInAsAdmin(page)
  await page.goto(`/admin/team/${project.id}`)

  const engineers = section(page, "Engineers")

  for (const person of [lead, assigned]) {
    await engineers.getByRole("combobox").click()
    await page.getByRole("option", { name: new RegExp(person.name) }).click()
    await engineers.getByRole("button", { name: "Add engineer" }).click()
    await expect(engineers.getByText(person.name)).toBeVisible()
  }

  const finance = section(page, "Finance checker")

  await finance.getByRole("combobox").click()
  await page.getByRole("option", { name: new RegExp(officer.name) }).click()
  await finance.getByRole("button", { name: "Assign" }).click()

  await expect(finance.getByText(officer.name)).toBeVisible()
})

test("at 375px both pages do not scroll sideways and can be used", async ({
  page,
}) => {
  const project = await makeProject(`Narrow ${tag()}`)

  await page.setViewportSize({ width: 375, height: 812 })
  await signInAsAdmin(page)
  await page.goto("/admin/team")

  expect(await sidewaysScroll(page)).toBeLessThanOrEqual(0)

  const row = page.getByRole("listitem").filter({ hasText: project.name })

  await expect(row.getByRole("link", { name: "Assign" })).toBeVisible()
  await row.getByRole("link", { name: "Assign" }).click()

  await expect(page).toHaveURL(new RegExp(`/admin/team/${project.id}$`))
  expect(await sidewaysScroll(page)).toBeLessThanOrEqual(0)

  for (const name of [
    "Project manager",
    "Onboarding manager",
    "Engineers",
    "Finance checker",
  ]) {
    await expect(section(page, name).getByRole("combobox")).toBeVisible()
  }
})

test("the sidebar links to the team page for an IT/Admin only", async ({
  page,
}) => {
  const project = await makeProject()
  const pm = await makePerson()

  await giveRoles(pm.id, project.id, ["PM"])
  await signIn(page, pm.email)

  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto("/")
  await expect(page.getByRole("link", { name: "Assign staff" })).toHaveCount(0)

  await page.context().clearCookies()
  await signInAsAdmin(page)
  await page.goto("/")

  await page.getByRole("link", { name: "Assign staff" }).first().click()
  await expect(page).toHaveURL(/\/admin\/team$/)
})
