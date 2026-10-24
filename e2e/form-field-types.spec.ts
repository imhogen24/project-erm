import { expect, test, type Page } from "@playwright/test"
import { z } from "zod"

import { makePerson, sidewaysScroll, signIn } from "./support/data"
import { pickDate } from "./support/pick-date"

// The preview page draws a tool with the field types added in RDP-93:
//   Guidance (instruction), Operands (table with four fixed rows: Category,
//   Description, Target date, Amount), Extra items (table: Item, Cost, with a
//   subtotal on Cost), Readiness checks (checklist of four items), Budget
//   (currency), Contingency (percentage), Contact email, Meeting time,
//   Brief link, PM signature, and Standards (a read-only list).
// A table input is named "<column>, row <n>".
async function openPreview(page: Page, query = "") {
  const person = await makePerson()

  await signIn(page, person.email)
  await page.goto(`/dev/form-preview${query}`)
}

const sent = z.object({
  action: z.string(),
  values: z.record(z.string(), z.json()),
})

async function lastSent(page: Page) {
  return sent.parse(JSON.parse(await page.getByLabel("Last sent").innerText()))
}

const rows = z.array(z.record(z.string(), z.union([z.string(), z.number()])))

const checks = z.record(z.string(), z.boolean())

async function saveDraft(page: Page) {
  await page.getByRole("button", { name: "Save draft" }).click()
}

test("a table adds a row, and the saved values hold it", async ({ page }) => {
  await openPreview(page)

  const extra = page.getByRole("table", { name: "Extra items" })

  await extra.getByRole("button", { name: "Add row" }).click()
  await page.getByLabel("Item, row 1", { exact: true }).fill("Pump")
  await page.getByLabel("Cost, row 1", { exact: true }).fill("250")
  await saveDraft(page)

  expect(rows.parse((await lastSent(page)).values.extraItems)).toEqual([
    { item: "Pump", cost: 250 },
  ])
})

test("a row that was added can be removed again", async ({ page }) => {
  await openPreview(page)

  const extra = page.getByRole("table", { name: "Extra items" })

  await extra.getByRole("button", { name: "Add row" }).click()
  await extra.getByRole("button", { name: "Add row" }).click()
  await page.getByLabel("Item, row 1", { exact: true }).fill("Pump")
  await page.getByLabel("Item, row 2", { exact: true }).fill("Valve")
  await extra.getByRole("button", { name: "Remove row 1" }).click()
  await saveDraft(page)

  expect(rows.parse((await lastSent(page)).values.extraItems)).toEqual([
    { item: "Valve" },
  ])
})

test("fixed rows keep their label locked and cannot be removed or added to", async ({
  page,
}) => {
  await openPreview(page)

  const operands = page.getByRole("table", { name: "Operands" })

  for (const label of ["Material", "Energy", "Information", "Living thing"]) {
    await expect(operands.getByRole("cell", { name: label })).toBeVisible()
  }

  await expect(
    operands.getByRole("textbox", { name: "Category, row 1" })
  ).toHaveCount(0)
  await expect(operands.getByRole("button", { name: /remove/i })).toHaveCount(0)
  await expect(operands.getByRole("button", { name: "Add row" })).toHaveCount(0)

  await page.getByLabel("Description, row 2", { exact: true }).fill("Heat")
  await saveDraft(page)

  const saved = rows.parse((await lastSent(page)).values.operands)

  expect(saved.map((row) => row.category)).toEqual([
    "Material",
    "Energy",
    "Information",
    "Living thing",
  ])
  expect(saved[1]!.description).toBe("Heat")
})

test("a cell error shows on the exact cell the server named", async ({
  page,
}) => {
  await openPreview(page, "?errors=1")

  const badDate = page.getByLabel("Target date, row 2", { exact: true })
  const message = page.getByText("Must be a date (YYYY-MM-DD)")

  await expect(message).toBeVisible()
  await expect(badDate).toHaveAttribute("aria-invalid", "true")
  await expect(badDate).toHaveAccessibleDescription(
    "Must be a date (YYYY-MM-DD)"
  )
  await expect(
    page.getByLabel("Target date, row 1", { exact: true })
  ).not.toHaveAttribute("aria-invalid", "true")

  const inputBox = (await badDate.boundingBox())!
  const messageBox = (await message.boundingBox())!

  expect(messageBox.y).toBeGreaterThan(inputBox.y)
})

test("a checklist sends every item, ticked as yes and unticked as no", async ({
  page,
}) => {
  await openPreview(page)

  await page.getByRole("checkbox", { name: "Client brief received" }).click()
  await page.getByRole("checkbox", { name: "Site constraints noted" }).click()
  await saveDraft(page)

  expect(checks.parse((await lastSent(page)).values.readiness)).toEqual({
    "Client brief received": true,
    "Site constraints noted": true,
    "Budget range confirmed": false,
    "Safety plan reviewed": false,
  })
})

test("instructions, lists and signatures are text, never inputs", async ({
  page,
}) => {
  await openPreview(page)

  await expect(
    page.getByText(
      "Fill one row per operand. Rows marked with a lock are fixed."
    )
  ).toBeVisible()
  await expect(page.getByText("ISO 128")).toBeVisible()
  await expect(page.getByText("ISO 2768")).toBeVisible()
  await expect(page.getByText("Not signed yet")).toBeVisible()
  await expect(page.getByRole("textbox", { name: "PM signature" })).toHaveCount(
    0
  )
  await expect(page.getByRole("textbox", { name: "Guidance" })).toHaveCount(0)

  await saveDraft(page)

  const values = (await lastSent(page)).values

  expect(values).not.toHaveProperty("guidance")
  expect(values).not.toHaveProperty("standards")
  expect(values).not.toHaveProperty("pmSignature")
})

test("a subtotal adds up the currency column", async ({ page }) => {
  await openPreview(page)

  const extra = page.getByRole("table", { name: "Extra items" })

  for (const [index, cost] of ["100", "250.50", "49.50"].entries()) {
    await extra.getByRole("button", { name: "Add row" }).click()
    await page.getByLabel(`Cost, row ${index + 1}`, { exact: true }).fill(cost)
  }

  await expect(extra.getByRole("row", { name: /Subtotal/ })).toContainText(
    "400.00"
  )

  await page.getByLabel("Cost, row 3", { exact: true }).fill("")

  await expect(extra.getByRole("row", { name: /Subtotal/ })).toContainText(
    "350.50"
  )
})

test("currency, percentage, email, time and link inputs send their values", async ({
  page,
}) => {
  await openPreview(page)

  await expect(
    page.getByLabel("Contact email", { exact: true })
  ).toHaveAttribute("type", "email")
  await expect(
    page.getByLabel("Meeting time", { exact: true })
  ).toHaveAttribute("type", "time")
  await expect(page.getByLabel("Brief link", { exact: true })).toHaveAttribute(
    "type",
    "url"
  )

  await page.getByLabel("Budget", { exact: true }).fill("1500.5")
  await page.getByLabel("Contingency", { exact: true }).fill("7.5")
  await page
    .getByLabel("Contact email", { exact: true })
    .fill("ama@example.com")
  await page.getByLabel("Meeting time", { exact: true }).fill("09:30")
  await page
    .getByLabel("Brief link", { exact: true })
    .fill("https://example.com/brief")
  await saveDraft(page)

  expect((await lastSent(page)).values).toMatchObject({
    budget: 1500.5,
    contingency: 7.5,
    contactEmail: "ama@example.com",
    meetingTime: "09:30",
    briefLink: "https://example.com/brief",
  })
})

test("at 375px a table stacks into cards and nothing scrolls sideways", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await openPreview(page, "?errors=1")

  expect(await sidewaysScroll(page)).toBeLessThanOrEqual(0)

  const description = page.getByLabel("Description, row 1", { exact: true })
  const date = page.getByLabel("Target date, row 1", { exact: true })

  await expect(description).toBeVisible()
  await expect(date).toBeVisible()

  // Stacked: the next input of a row sits below the first, not beside it.
  const first = (await description.boundingBox())!
  const second = (await date.boundingBox())!

  expect(second.y).toBeGreaterThan(first.y + first.height - 1)

  const extra = page.getByRole("table", { name: "Extra items" })

  await extra.getByRole("button", { name: "Add row" }).click()
  await page.getByLabel("Item, row 1", { exact: true }).fill("Pump")

  expect(await sidewaysScroll(page)).toBeLessThanOrEqual(0)
})

test("a date is picked from a calendar, shown, and sent as YYYY-MM-DD", async ({
  page,
}) => {
  await openPreview(page)
  await pickDate(page, "Due date", "2026-12-01")

  await expect(page.getByRole("button", { name: "Due date" })).toContainText(
    "1 Dec 2026"
  )

  await pickDate(page, "Target date, row 1", "2027-03-15")
  await saveDraft(page)

  const values = (await lastSent(page)).values

  expect(values.dueDate).toBe("2026-12-01")
  expect(rows.parse(values.operands)[0]!.targetDate).toBe("2027-03-15")
})

test("a picked date can be cleared by picking it again", async ({ page }) => {
  await openPreview(page)
  await pickDate(page, "Due date", "2026-12-01")
  await pickDate(page, "Due date", "2026-12-01")
  await saveDraft(page)

  await expect(page.getByRole("button", { name: "Due date" })).toContainText(
    "Pick a date"
  )
  expect((await lastSent(page)).values.dueDate).toBe("")
})

test("a signed signature shows who signed and when, still as text", async ({
  page,
}) => {
  await openPreview(page)

  await expect(
    page.getByText("Signed by Ama Owusu on 23 Oct 2026")
  ).toBeVisible()
  await expect(page.getByText("Not signed yet")).toHaveCount(1)
  await expect(page.getByRole("textbox", { name: "QA signature" })).toHaveCount(
    0
  )
})

test("an error on a whole row, with no column, shows under the table", async ({
  page,
}) => {
  await openPreview(page, "?errors=1")

  await expect(page.getByText("Must be a row of cells")).toBeVisible()
  await expect(page.getByRole("table", { name: "Extra items" })).toBeVisible()
})
