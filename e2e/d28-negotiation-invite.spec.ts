import { expect, test, type Browser, type Page } from "@playwright/test"

import {
  addClientRequest,
  addRecord,
  giveRoles,
  lockEarlierTools,
  makePerson,
  makeProject,
  sidewaysScroll,
  signIn,
  tag,
} from "./support/data"

const CLIENT_EMAIL = "kwaku.ampofo@asantemills.test"

const LIMIT = "Advance Payment %: Absolute minimum 35% to cover initial BOM"

const CONCERN = "[Insert 1-2 words on their concern,e.g.,the delivery timeline]"

// A Tier 1 project with Workbook 1 and D2.1 to D2.7 locked, the last with
// the client's reply, the client's email on the web request, and its CA, PM,
// LO, CR, OM and client.
async function setUp(reply = "Requested Negotiation") {
  const project = await makeProject(`Rice Mill ${tag()}`)
  const ca = await makePerson(`Gifty ${tag()}`)
  const pm = await makePerson(`Ama ${tag()}`)
  const lo = await makePerson(`Kojo ${tag()}`)
  const cr = await makePerson(`Yaw ${tag()}`)
  const om = await makePerson(`Kofi ${tag()}`)
  const client = await makePerson(`Kwaku ${tag()}`)

  await giveRoles(ca.id, project.id, ["CA"])
  await giveRoles(pm.id, project.id, ["PM"])
  await giveRoles(lo.id, project.id, ["LO"])
  await giveRoles(cr.id, project.id, ["CR"])
  await giveRoles(om.id, project.id, ["OM"])
  await giveRoles(client.id, project.id, ["Client"])
  await addClientRequest(project.id, {
    organization_name: "Asante Mills",
    email: CLIENT_EMAIL,
  })
  await lockEarlierTools(project.id)

  for (const toolId of ["D1.8", "D1.9", "D1.12", "D1.13", "D1.16"]) {
    await addRecord(project.id, toolId, "locked")
  }

  await addRecord(project.id, "D1.10", "locked", {
    payload: { overallCapabilityStatus: "Capable" },
  })
  await addRecord(project.id, "D1.11", "locked", {
    payload: { goNoGoDecision: "Go" },
  })
  await addRecord(project.id, "D1.14", "locked", {
    payload: { minimumOverheadMet: true },
  })
  await addRecord(project.id, "D1.15", "locked", {
    payload: { budget: [{ value: 60000 }, { value: 34400 }] },
  })
  await addRecord(project.id, "D2.1", "locked")
  await addRecord(project.id, "D2.2", "locked", { submittedBy: ca.id })
  await addRecord(project.id, "D2.3", "locked", {
    payload: { operationalStatus: "Approved" },
    submittedBy: pm.id,
  })
  await addRecord(project.id, "D2.4", "locked", {
    payload: { commercialStatus: "Approved" },
  })
  await addRecord(project.id, "D2.5", "locked", {
    payload: { executiveDecision: "Approved for Client Transmission" },
  })
  await addRecord(project.id, "D2.6", "locked", {
    payload: {
      baseline: [
        {
          variable: "Advance Payment %",
          baselineValue: "40%",
          absoluteLimit: "Absolute minimum 35% to cover initial BOM",
        },
      ],
    },
    submittedBy: ca.id,
  })
  await addRecord(project.id, "D2.7", "locked", {
    payload: { initialResponse: reply },
    submittedBy: ca.id,
  })

  return { project, ca, pm, lo, cr, om, client }
}

// A D2.8 the CA has planned, with the script still holding the concern.
async function planned(projectId: string, projectName: string) {
  await addRecord(projectId, "D2.8", "draft", {
    payload: {
      proposedDate: "2027-06-01",
      meetingTime: "10:00",
      platform: "Google Meet",
      meetingLink: "https://meet.google.com/abc-defg-hij",
      hardLimits: LIMIT,
      clientConcerns: "Wants the timeline cut to 6 weeks.",
      script: `Dear Asante Mills\n\nThank you for reviewing the Draft Engineering Services Agreement for ${projectName}. We appreciate your feedback regarding ${CONCERN}.\n\nPlease let us know if [Proposed Date & Time] works for your team.\n\nBest regards`,
      clientConfirmed: "No",
      preMeetHeld: "No",
      readyForMeeting: "No",
    },
  })
}

async function open(browser: Browser, email: string, projectId: string) {
  const page = await browser.newPage()

  await signIn(page, email)

  // Buttons only answer once the page has loaded its scripts.
  await page.goto(`/projects/${projectId}/tools/D2.8`, {
    waitUntil: "networkidle",
  })

  return page
}

async function choose(page: Page, label: string, option: string) {
  await page.getByRole("combobox", { name: label, exact: true }).click()
  await page.getByRole("option", { name: option, exact: true }).click()
}

const sendInvite = "Send calendar invite"

const script = "Standard Meeting Invite Script"

test("D2.8 starts from the request ID, the sheet's script, D2.6 and its limits", async ({
  browser,
}) => {
  const { project, ca } = await setUp()
  const page = await open(browser, ca.email, project.id)

  await expect(page.locator("#requestId")).toHaveText(/^T1-/)
  await expect(page.getByRole("textbox", { name: script })).toHaveValue(
    new RegExp(
      `^Dear Asante Mills\\n\\nThank you for reviewing the Draft Engineering Services Agreement for ${project.name}\\.`
    )
  )
  await expect(
    page.getByRole("button", { name: "View Reference Document" })
  ).toBeEnabled()
  await expect(
    page.getByRole("textbox", { name: "IMHOGEN Hard Limits" })
  ).toHaveValue(LIMIT)
  await expect(page.locator("#inviteSent")).toHaveText("No")
  await expect(page.getByRole("button", { name: sendInvite })).toBeDisabled()
  await expect(page.getByText(`${sendInvite} needs:`)).toContainText(
    "add the proposed date"
  )
  await page.close()
})

test("the CA sends the invite once the concern is filled in, then submits with every answer Yes", async ({
  browser,
}) => {
  test.slow()

  const { project, ca } = await setUp()

  await planned(project.id, project.name)

  const page = await open(browser, ca.email, project.id)
  const box = page.getByRole("textbox", { name: script })

  await expect(page.getByText(`${sendInvite} needs:`)).toContainText(
    `replace ${CONCERN} in the script`
  )

  await box.fill(
    (await box.inputValue()).replace(CONCERN, "the delivery timeline")
  )
  await expect(page.getByRole("status").getByText("Saved")).toBeVisible()
  await page.reload({ waitUntil: "networkidle" })

  await page.getByRole("button", { name: sendInvite }).click()
  await expect(page.getByText("Invite sent.")).toBeVisible()
  await expect(page.locator("#inviteSent")).toHaveText("Yes")

  // The script went with the date and time, and reads as text now.
  await expect(page.locator("#script")).toContainText(
    /if Tue,? 1 Jun 2027, 10:00 GMT works/
  )

  await page.getByRole("button", { name: "Submit", exact: true }).click()
  await expect(
    page.getByText("Answer Yes once the client has confirmed the meeting")
  ).toBeVisible()

  await choose(page, "Client Confirmed / RSVP?", "Yes")
  await choose(page, "Internal pre-meet held with negotiators?", "Yes")
  await choose(page, "Ready for Meeting (D2.9)?", "Yes")
  await expect(page.getByRole("status").getByText("Saved")).toBeVisible()
  await page.getByRole("button", { name: "Submit", exact: true }).click()
  await expect(page.getByText("Submitted and locked.")).toBeVisible()
  await page.close()
})

test("the client reads D2.8 without 2.0", async ({ browser }) => {
  const { project, client } = await setUp()

  await planned(project.id, project.name)

  const page = await open(browser, client.email, project.id)

  await expect(page.getByLabel("Platform / Location")).toHaveValue(
    "Google Meet"
  )
  await expect(
    page.getByText("2.0 Pre-meeting strategy alignment")
  ).toHaveCount(0)
  await expect(page.getByText("IMHOGEN Hard Limits")).toHaveCount(0)
  await expect(page.getByText("Absolute minimum 35%")).toHaveCount(0)
  await expect(page.getByText("Wants the timeline cut")).toHaveCount(0)
  await expect(page.getByRole("button", { name: sendInvite })).toHaveCount(0)
  await page.close()
})

test("the PM, LO and CR read D2.8, and the OM cannot open it", async ({
  browser,
}) => {
  const { project, pm, lo, cr, om } = await setUp()

  await planned(project.id, project.name)

  for (const reader of [pm, lo, cr]) {
    const page = await open(browser, reader.email, project.id)

    await expect(
      page.getByRole("textbox", { name: "IMHOGEN Hard Limits" })
    ).toHaveValue(LIMIT)
    await expect(
      page.getByRole("combobox", { name: "Client Confirmed / RSVP?" })
    ).toBeDisabled()
    await expect(page.getByRole("button", { name: sendInvite })).toHaveCount(0)
    await page.close()
  }

  const omPage = await browser.newPage()

  await signIn(omPage, om.email)

  const result = await omPage.goto(`/projects/${project.id}/tools/D2.8`)

  expect(result?.status()).toBe(404)
  await omPage.close()
})

test("D2.8 does not open when the client accepted the draft as it is", async ({
  page,
}) => {
  const { project, ca } = await setUp("Accepted as-is")

  await signIn(page, ca.email)
  await page.goto(`/projects/${project.id}/tools/D2.8`)

  // A tool that has not opened leads back to the project.
  await expect(page).toHaveURL(new RegExp(`/projects/${project.id}$`))
})

test("at 375px D2.8 does not scroll sideways", async ({ page }) => {
  const { project, ca } = await setUp()

  await page.setViewportSize({ width: 375, height: 800 })
  await signIn(page, ca.email)
  await page.goto(`/projects/${project.id}/tools/D2.8`, {
    waitUntil: "networkidle",
  })

  await expect(page.getByRole("button", { name: sendInvite })).toBeVisible()
  expect(await sidewaysScroll(page)).toBe(0)
})
