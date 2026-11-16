import { expect, test, type Browser, type Page } from "@playwright/test"

import {
  addRecord,
  giveRoles,
  makeClient,
  makePerson,
  makeProject,
  signIn,
  tag,
} from "./support/data"

// On D1.2 the OM writes and the PM approves. D1.1 is the client's own tool.
async function setUp() {
  const project = await makeProject(`Comments ${tag()}`)
  const om = await makePerson()
  const pm = await makePerson()

  await giveRoles(om.id, project.id, ["OM"])
  await giveRoles(pm.id, project.id, ["PM"])

  return { project, om, pm }
}

async function pageAs(browser: Browser, email: string, path: string) {
  const page = await (await browser.newContext()).newPage()

  await signIn(page, email)
  await page.goto(path, { waitUntil: "networkidle" })

  return page
}

function comments(page: Page) {
  return page.getByRole("region", { name: "Comments" })
}

function bell(page: Page) {
  return page.locator('[data-testid="notification-bell"]:visible')
}

async function writeComment(page: Page, body: string) {
  await comments(page).getByLabel("Add a comment").fill(body)
  await comments(page).getByRole("button", { name: "Comment" }).click()
  await expect(comments(page).getByText(body)).toBeVisible()
}

test("the PM comments on a submitted D1.2, the OM is told and replies, and the PM is told", async ({
  browser,
}) => {
  test.slow()

  const { project, om, pm } = await setUp()
  const path = `/projects/${project.id}/tools/D1.2`

  await addRecord(project.id, "D1.1", "locked")
  await addRecord(project.id, "D1.2", "submitted", { submittedBy: om.id })

  const pmPage = await pageAs(browser, pm.email, path)

  await writeComment(pmPage, "Is the second photo the right site?")
  await expect(
    comments(pmPage).getByText("Project Manager", { exact: true })
  ).toBeVisible()

  const omPage = await pageAs(browser, om.email, "/")

  await bell(omPage).click()
  await omPage
    .getByTestId("notification-item")
    .filter({ hasText: "New comment on D1.2" })
    .click()

  await expect(omPage).toHaveURL(new RegExp(`/tools/D1.2#comment-`))
  await expect(
    comments(omPage).getByText("Is the second photo the right site?")
  ).toBeVisible()

  await comments(omPage)
    .getByRole("button", { name: /^Reply to / })
    .click()
  await comments(omPage)
    .getByRole("textbox", { name: /^Reply to / })
    .fill("Yes, the client confirmed it.")
  await comments(omPage).getByRole("button", { name: "Send reply" }).click()
  await expect(
    comments(omPage).getByText("Yes, the client confirmed it.")
  ).toBeVisible()
  await omPage.close()

  await pmPage.goto("/", { waitUntil: "networkidle" })
  await bell(pmPage).click()
  await pmPage
    .getByTestId("notification-item")
    .filter({ hasText: "New reply on D1.2" })
    .click()

  await expect(
    comments(pmPage).getByText("Yes, the client confirmed it.")
  ).toBeVisible()
  await expect(
    comments(pmPage).getByText("Onboarding Manager", { exact: true })
  ).toBeVisible()
  await pmPage.close()
})

test("comments work on a locked tool, and a resolved thread folds away but opens again", async ({
  browser,
}) => {
  const { project, pm } = await setUp()
  const path = `/projects/${project.id}/tools/D1.2`

  await addRecord(project.id, "D1.1", "locked")
  await addRecord(project.id, "D1.2", "locked")

  const page = await pageAs(browser, pm.email, path)

  await writeComment(page, "Keep this for the brief.")
  await comments(page).getByRole("button", { name: "Resolve" }).click()

  const folded = comments(page).getByRole("button", {
    name: /^Resolved by .*: Keep this for the brief\.$/,
  })

  await expect(folded).toBeVisible()
  await expect(
    comments(page).getByRole("button", { name: /^Reply to / })
  ).toHaveCount(0)

  await folded.click()
  await expect(
    comments(page).getByRole("article", { name: /^Comment by / })
  ).toBeVisible()
  await page.close()
})

test("the client, and someone not on the project, see no comments", async ({
  browser,
}) => {
  const { project, pm } = await setUp()
  const client = await makeClient()
  const outsider = await makePerson()

  await giveRoles(client.id, project.id, ["Client"])
  await addRecord(project.id, "D1.1", "locked")
  await addRecord(project.id, "D1.2", "submitted")

  const pmPage = await pageAs(
    browser,
    pm.email,
    `/projects/${project.id}/tools/D1.1`
  )

  await writeComment(pmPage, "Only for the team.")
  await pmPage.close()

  const clientPage = await pageAs(
    browser,
    client.email,
    `/projects/${project.id}/tools/D1.1`
  )

  await expect(clientPage.getByText("Only for the team.")).toHaveCount(0)
  await expect(comments(clientPage)).toHaveCount(0)
  await clientPage.close()

  const outsiderPage = await pageAs(
    browser,
    outsider.email,
    `/projects/${project.id}/tools/D1.2`
  )

  await expect(comments(outsiderPage)).toHaveCount(0)
  await outsiderPage.close()
})

test("at 375px the comments fit without sideways scroll", async ({
  browser,
}) => {
  const { project, pm } = await setUp()

  await addRecord(project.id, "D1.1", "locked")
  await addRecord(project.id, "D1.2", "submitted")

  const page = await pageAs(
    browser,
    pm.email,
    `/projects/${project.id}/tools/D1.2`
  )

  await page.setViewportSize({ width: 375, height: 812 })
  await writeComment(
    page,
    "A long comment that has to wrap on a narrow screen without pushing the page sideways at all."
  )

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth
  )

  expect(overflow).toBeLessThanOrEqual(0)
  await page.close()
})
