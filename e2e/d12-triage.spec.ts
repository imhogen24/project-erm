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

const ONE = "https://utfs.io/f/triage-one"

const TWO = "https://utfs.io/f/triage-two"

const CHECKS = [
  "Is the notification readable and free of malicious links?",
  "Does the request broadly align with IMHOGEN's services?",
  "Is the contact information apparently valid and legible?",
]

// A project whose D1.1 is approved, so D1.2 is open, with two files and the
// website's saved copy of the request. The OM writes D1.2 and the PM approves.
async function setUp(track: "Tier_1" | "Tier_3" = "Tier_1") {
  const project = await makeProject(`Trailer ${tag()}`, track)
  const om = await makePerson()
  const pm = await makePerson()

  await giveRoles(om.id, project.id, ["OM"])
  await giveRoles(pm.id, project.id, ["PM"])

  const filesRecordId = await addRecord(project.id, "D1.1", "locked", {
    payload: {
      requestStatus: "Approved",
      attachedFiles: [
        {
          label: "Photo 1",
          dateUploaded: "2026-11-03",
          fileLink: ONE,
          status: "Approved",
        },
        {
          label: "Photo 2",
          dateUploaded: "2026-11-03",
          fileLink: TWO,
          status: "Approved",
        },
      ],
    },
  })

  await addClientRequest(project.id, {
    email: "client@example.com",
    created_at: "2026-11-03T09:14:00+00:00",
  })

  return { project, om, pm, filesRecordId }
}

async function open(page: Page, email: string, projectId: string) {
  await signIn(page, email)
  await page.goto(`/projects/${projectId}/tools/D1.2`)
}

function checkRow(page: Page, index: number) {
  return page
    .getByRole("table", { name: "Triage checks" })
    .getByRole("row")
    .filter({ hasText: CHECKS[index]! })
}

// The Pass or Fail button of one check.
function result(page: Page, index: number, option: "Pass" | "Fail") {
  return page
    .getByRole("radiogroup", { name: `Result: ${CHECKS[index]}` })
    .getByRole("radio", { name: option, exact: true })
}

function notes(page: Page, index: number) {
  return page.getByRole("textbox", { name: `Reviewer notes: ${CHECKS[index]}` })
}

function description(page: Page, label: string) {
  return page.getByRole("textbox", { name: `Description of ${label}` })
}

function proceed(page: Page, label = "Proceed to D1.3") {
  return page.getByRole("radio", { name: label, exact: true })
}

function reject(page: Page) {
  return page.getByRole("radio", { name: "Reject as Spam", exact: true })
}

function save(page: Page) {
  return page.getByRole("button", { name: "Save draft" })
}

function submit(page: Page) {
  return page.getByRole("button", { name: "Submit for approval" })
}

async function answerAll(page: Page, option: "Pass" | "Fail" = "Pass") {
  for (const index of [0, 1, 2]) {
    await result(page, index, option).click()
    await notes(page, index).fill(`Note ${index + 1}`)
  }
}

// What the OM saved, as the screen stores it.
function saved(
  decision: string,
  statuses = ["Pass", "Pass", "Pass"],
  files = ["", ""]
) {
  return {
    digitalRecords: files.map((fileName) => ({ fileName })),
    triageChecklist: CHECKS.map((check, index) => ({
      check,
      status: statuses[index]!,
      reviewerNotes: `Note ${index + 1}`,
    })),
    triageDecision: decision,
  }
}

test("the files show from D1.1 with Open file and their status, before anything is saved", async ({
  page,
}) => {
  const { project, om } = await setUp()

  await open(page, om.email, project.id)

  await expect(page.getByText("Photo 1", { exact: true })).toBeVisible()
  await expect(page.getByText("Photo 2", { exact: true })).toBeVisible()
  await expect(page.getByRole("link", { name: /^Open file/ })).toHaveCount(2)
  await expect(page.getByText("Approved", { exact: true })).toHaveCount(2)
})

test("a screen with no record yet has empty checks and no decision", async ({
  page,
}) => {
  const { project, om } = await setUp()

  await open(page, om.email, project.id)

  for (const index of [0, 1, 2]) {
    await expect(result(page, index, "Pass")).toHaveAttribute(
      "aria-checked",
      "false"
    )
    await expect(result(page, index, "Fail")).toHaveAttribute(
      "aria-checked",
      "false"
    )
    await expect(notes(page, index)).toHaveValue("")
  }

  await expect(proceed(page)).toHaveAttribute("aria-checked", "false")
  await expect(reject(page)).toHaveAttribute("aria-checked", "false")
})

test("the OM describes one file, and it is kept after a reload", async ({
  page,
}) => {
  const { project, om } = await setUp()

  await open(page, om.email, project.id)
  await description(page, "Photo 2").fill("Front of the trailer")
  await save(page).click()

  await expect(page.getByText("Draft saved.")).toBeVisible()

  await page.reload()

  await expect(description(page, "Photo 2")).toHaveValue("Front of the trailer")
  await expect(description(page, "Photo 1")).toHaveValue("")
})

test("Open file goes through the ERM and opens the file in a new tab", async ({
  page,
  context,
}) => {
  const { project, om, filesRecordId } = await setUp()

  await context.route("https://utfs.io/**", (route) =>
    route.fulfill({ status: 200, contentType: "text/plain", body: "the file" })
  )

  await open(page, om.email, project.id)

  const button = page.getByRole("link", { name: /^Open file/ }).first()

  await expect(button).toHaveAttribute("target", "_blank")
  await expect(button).toHaveAttribute(
    "href",
    `/api/files/${filesRecordId}?ref=${encodeURIComponent(ONE)}`
  )

  const [popup] = await Promise.all([
    context.waitForEvent("page"),
    button.click(),
  ])

  await popup.waitForURL(ONE)
})

test("there are exactly the three fixed checks, with no add or remove", async ({
  page,
}) => {
  const { project, om } = await setUp()

  await open(page, om.email, project.id)

  const rows = page
    .getByRole("table", { name: "Triage checks" })
    .getByRole("row")

  // The header row and the three checks.
  await expect(rows).toHaveCount(4)

  for (const index of [0, 1, 2]) {
    await expect(checkRow(page, index)).toBeVisible()
  }

  await expect(page.getByRole("button", { name: /^(Add|Remove)/ })).toHaveCount(
    0
  )
})

test("the OM answers each check and the answers are kept after a reload", async ({
  page,
}) => {
  const { project, om } = await setUp()

  await open(page, om.email, project.id)
  await answerAll(page)
  await save(page).click()

  await expect(page.getByText("Draft saved.")).toBeVisible()

  await page.reload()

  for (const index of [0, 1, 2]) {
    await expect(result(page, index, "Pass")).toHaveAttribute(
      "aria-checked",
      "true"
    )
    await expect(notes(page, index)).toHaveValue(`Note ${index + 1}`)
  }
})

test("submitting with a note left empty says Required under that check", async ({
  page,
}) => {
  const { project, om } = await setUp()

  await open(page, om.email, project.id)
  await answerAll(page)
  await notes(page, 1).fill("")
  await reject(page).click()
  await submit(page).click()

  await expect(checkRow(page, 1).getByText("Required")).toBeVisible()
  await expect(checkRow(page, 0).getByText("Required")).toHaveCount(0)
  await expect(page.getByText("Draft", { exact: true })).toBeVisible()
})

test("Proceed is off while a check is Fail, and on again once it is resolved", async ({
  page,
}) => {
  const { project, om } = await setUp()

  await open(page, om.email, project.id)
  await answerAll(page)
  await expect(proceed(page)).toBeEnabled()

  await result(page, 1, "Fail").click()

  await expect(proceed(page)).toBeDisabled()
  await expect(
    page.getByText("Resolve the failed checks to proceed")
  ).toBeVisible()

  await result(page, 1, "Pass").click()

  await expect(proceed(page)).toBeEnabled()
  await expect(
    page.getByText("Resolve the failed checks to proceed")
  ).toHaveCount(0)
})

test("Reject as Spam stays on while a check is Fail", async ({ page }) => {
  const { project, om } = await setUp()

  await open(page, om.email, project.id)
  await result(page, 0, "Fail").click()

  await expect(reject(page)).toBeEnabled()

  await reject(page).click()

  await expect(reject(page)).toHaveAttribute("aria-checked", "true")
})

test("pressing Proceed only chooses it and sends nothing", async ({ page }) => {
  const { project, om } = await setUp()

  await open(page, om.email, project.id)
  await proceed(page).click()

  await expect(proceed(page)).toHaveAttribute("aria-checked", "true")
  await expect(page.getByText("Submitted", { exact: true })).toHaveCount(0)

  await page.reload()

  await expect(proceed(page)).toHaveAttribute("aria-checked", "false")
})

test("submitting saves what was typed, and the OM then sees it read only", async ({
  page,
}) => {
  const { project, om } = await setUp()

  await open(page, om.email, project.id)
  await description(page, "Photo 1").fill("Side view")
  await answerAll(page)
  await proceed(page).click()
  await submit(page).click()

  await expect(page.getByText("Submitted", { exact: true })).toBeVisible()
  await expect(submit(page)).toHaveCount(0)
  await expect(save(page)).toHaveCount(0)

  await page.reload()

  await expect(description(page, "Photo 1")).toHaveValue("Side view")
  await expect(description(page, "Photo 1")).toBeDisabled()
  await expect(result(page, 0, "Pass")).toBeDisabled()
  await expect(notes(page, 0)).toBeDisabled()
  await expect(proceed(page)).toBeDisabled()
  await expect(proceed(page)).toHaveAttribute("aria-checked", "true")
})

test("the PM sees a submitted D1.2 read only, approves it, and D1.3 opens", async ({
  page,
}) => {
  const { project, om, pm } = await setUp()

  await addRecord(project.id, "D1.2", "submitted", {
    payload: saved("Proceed to D1.3", ["Pass", "Pass", "Pass"], ["Side", ""]),
    submittedBy: om.id,
  })
  await open(page, pm.email, project.id)

  await expect(notes(page, 0)).toBeDisabled()
  await expect(save(page)).toHaveCount(0)
  await expect(page.getByRole("button", { name: "Approve" })).toBeVisible()

  await page.getByRole("button", { name: "Approve" }).click()

  await expect(page.getByText("Locked", { exact: true })).toBeVisible()

  await page.goto(`/projects/${project.id}/tools/D1.3`)

  await expect(page.getByText(/This tool opens after/)).toHaveCount(0)
})

test("a Tier 3 project says Proceed to D1.3a", async ({ page }) => {
  const { project, om } = await setUp("Tier_3")

  await open(page, om.email, project.id)

  await expect(proceed(page, "Proceed to D1.3a")).toBeVisible()
  await expect(proceed(page)).toHaveCount(0)
})

test("the header sits in the sheet with the document control facts", async ({
  page,
}) => {
  const { project, om } = await setUp()

  await open(page, om.email, project.id)

  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "D1.2 Initial Inquiry Notification"
  )
  await expect(
    page.getByRole("link", { name: "Project overview" })
  ).toBeVisible()

  for (const fact of ["Project", "Request ID", "Prepared by", "Checked by"]) {
    await expect(page.getByText(fact, { exact: true })).toBeVisible()
  }

  // The web form is in the panel, not on the page.
  await expect(page.getByText("Organisation")).toHaveCount(0)
})

test("View client request opens the web form, in tables, over half the screen", async ({
  page,
}) => {
  const { project, om } = await setUp()

  await page.setViewportSize({ width: 1440, height: 900 })
  await open(page, om.email, project.id)
  await page.getByRole("button", { name: "View client request" }).click()

  const panel = page.getByRole("dialog", { name: "Client request" })

  await expect(panel).toBeVisible()
  await expect(panel.getByRole("heading", { name: "Contact" })).toBeVisible()
  await expect(panel.getByRole("heading", { name: "Project" })).toBeVisible()
  await expect(panel.getByRole("heading", { name: "Systems" })).toBeVisible()
  await expect(panel.getByText("client@example.com")).toBeVisible()

  const box = await panel.boundingBox()

  expect(box!.width).toBeGreaterThan(1440 * 0.45)
  expect(box!.width).toBeLessThan(1440 * 0.55)
})

test("a client, or a person outside the project, never reaches the screen", async ({
  page,
}) => {
  const { project } = await setUp()
  const client = await makePerson()
  const stranger = await makePerson()

  await giveRoles(client.id, project.id, ["Client"])

  await open(page, client.email, project.id)
  await expect(page.getByText(NOT_FOUND)).toBeVisible()
  await expect(proceed(page)).toHaveCount(0)

  await page.context().clearCookies()
  await open(page, stranger.email, project.id)
  await expect(page.getByText(NOT_FOUND)).toBeVisible()
})

test("at 375px nothing scrolls sideways and the buttons work", async ({
  page,
}) => {
  const { project, om } = await setUp()

  await page.setViewportSize({ width: 375, height: 812 })
  await open(page, om.email, project.id)

  expect(await sidewaysScroll(page)).toBeLessThanOrEqual(0)

  await result(page, 0, "Pass").click()
  await notes(page, 0).fill("Fine")
  await proceed(page).click()
  await save(page).click()

  await expect(page.getByText("Draft saved.")).toBeVisible()
  expect(await sidewaysScroll(page)).toBeLessThanOrEqual(0)
})
