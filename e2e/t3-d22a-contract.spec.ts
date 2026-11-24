import { expect, test, type Browser } from "@playwright/test"

import {
  addClientRequest,
  addRecord,
  giveRoles,
  makeClient,
  makePerson,
  makeProject,
  sidewaysScroll,
  signIn,
  tag,
} from "./support/data"

// A Tier 3 project with D1.16 and D2.1 locked, so T3.D2.2a is open, with its
// OM, FO, PM and client.
async function setUp() {
  const project = await makeProject(`Gear Housing ${tag()}`, "Tier_3")
  const om = await makePerson(`Efua ${tag()}`)
  const fo = await makePerson(`Akosua ${tag()}`)
  const pm = await makePerson(`Ama ${tag()}`)
  const client = await makeClient(`Yaw ${tag()}`)

  await giveRoles(om.id, project.id, ["OM"])
  await giveRoles(fo.id, project.id, ["FO"])
  await giveRoles(pm.id, project.id, ["PM"])
  await giveRoles(client.id, project.id, ["Client"])
  await addClientRequest(project.id, {
    organization_name: "Kumasi Gears",
    contact_person: "Yaw Boateng",
  })

  for (const toolId of ["D1.16", "D2.1"]) {
    await addRecord(project.id, toolId, "locked")
  }

  return { project, om, fo, pm, client }
}

async function open(browser: Browser, email: string, projectId: string) {
  const page = await browser.newPage()

  await signIn(page, email)

  // Buttons only answer once the page has loaded its scripts.
  await page.goto(`/projects/${projectId}/tools/T3.D2.2a`, {
    waitUntil: "networkidle",
  })

  return page
}

test("the OM picks the IP option, then the FO, PM and client sign in turn", async ({
  browser,
}) => {
  test.slow()

  const { project, om, fo, pm, client } = await setUp()
  const omPage = await open(browser, om.email, project.id)

  await expect(omPage.locator("#pmName")).toHaveText(pm.name)
  await expect(omPage.locator("#foName")).toHaveText(fo.name)
  await expect(omPage.locator("#clientName")).toHaveText("Yaw Boateng")
  await expect(
    omPage.getByText(
      "The Client acknowledges that IMHOGEN is modeling based on PROVIDED DATA."
    )
  ).toBeVisible()

  const election = omPage.getByRole("table", {
    name: "1.0 Intellectual property (IP) election",
  })

  // A fixed choice of two rows: nothing to add, and no Sign for the OM.
  await expect(election.getByRole("button", { name: "Add row" })).toHaveCount(0)
  await expect(
    omPage.getByRole("button", { name: /^Sign .* Signature$/ })
  ).toHaveCount(0)

  await omPage.getByRole("button", { name: "Submit for approval" }).click()
  await expect(omPage.getByText("Pick one option")).toBeVisible()

  await election.getByRole("radio", { name: "Full IP Transfer" }).click()
  await expect(
    election.getByRole("radio", { name: "Full IP Transfer" })
  ).toBeChecked()
  await expect(omPage.getByText("Saved")).toBeVisible()
  await omPage.getByRole("button", { name: "Submit for approval" }).click()
  await expect(omPage.getByText("Required for the option picked")).toBeVisible()

  await election.getByLabel("Fee (GHS), row 2", { exact: true }).fill("25000")
  await expect(omPage.getByText("Saved")).toBeVisible()
  await omPage.getByRole("button", { name: "Submit for approval" }).click()
  await expect(omPage.getByText("Submitted.")).toBeVisible()
  await omPage.close()

  // The PM's turn comes after the FO's.
  const early = await open(browser, pm.email, project.id)

  await expect(
    early.getByRole("button", { name: "Sign Project Manager Signature" })
  ).toHaveCount(0)
  await early.close()

  const foPage = await open(browser, fo.email, project.id)

  await foPage
    .getByRole("button", { name: "Sign Finance Officer Signature" })
    .click()
  await expect(foPage.getByText(`Signed by ${fo.name}`)).toBeVisible()
  await foPage.close()

  // The PM approves by signing: there is no Approve button.
  const pmPage = await open(browser, pm.email, project.id)

  await expect(pmPage.getByRole("button", { name: "Approve" })).toHaveCount(0)
  await expect(pmPage.getByRole("button", { name: "Send back" })).toBeVisible()
  await pmPage
    .getByRole("button", { name: "Sign Project Manager Signature" })
    .click()
  await expect(pmPage.getByText(`Signed by ${pm.name}`)).toBeVisible()
  await pmPage.close()

  // The client sees their turn on their dashboard, and signing locks it.
  const clientPage = await browser.newPage()

  await signIn(clientPage, client.email)
  await clientPage.goto("/", { waitUntil: "networkidle" })
  await expect(
    clientPage.getByText("T3.D2.2a is waiting for your signature").first()
  ).toBeVisible()
  await clientPage.goto(`/projects/${project.id}/tools/T3.D2.2a`, {
    waitUntil: "networkidle",
  })
  await clientPage
    .getByRole("button", { name: "Sign Client Signatory Signature" })
    .click()
  await expect(clientPage.getByText(`Signed by ${client.name}`)).toBeVisible()
  await expect(clientPage.locator("#clientName")).toHaveText(client.name)
  await expect(clientPage.getByText("Locked").first()).toBeVisible()
  await clientPage.close()
})

test("at 375px T3.D2.2a does not scroll sideways", async ({ page }) => {
  const { project, om } = await setUp()

  await page.setViewportSize({ width: 375, height: 800 })
  await signIn(page, om.email)
  await page.goto(`/projects/${project.id}/tools/T3.D2.2a`, {
    waitUntil: "networkidle",
  })

  await expect(
    page.getByRole("button", { name: "Submit for approval" })
  ).toBeVisible()
  expect(await sidewaysScroll(page)).toBe(0)
})
