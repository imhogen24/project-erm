import { expect, test, type Page } from "@playwright/test"
import { z } from "zod"

import { makePerson, sidewaysScroll, signIn } from "./support/data"

// The preview page draws one tool with a field of every type. The page shows
// what the form sent, so a test can read it back.
async function openPreview(page: Page, query = "") {
  const person = await makePerson()

  await signIn(page, person.email)
  await page.goto(`/dev/form-preview${query}`)
}

const sentSchema = z.object({
  action: z.string(),
  values: z.record(
    z.string(),
    z.union([z.string(), z.number(), z.boolean(), z.null()])
  ),
})

async function lastSent(page: Page) {
  return sentSchema.parse(
    JSON.parse(await page.getByLabel("Last sent").innerText())
  )
}

test("each field type draws the matching input", async ({ page }) => {
  await openPreview(page)

  await expect(page.getByLabel("Project name")).toHaveAttribute("type", "text")
  await expect(page.getByLabel("Notes")).toHaveJSProperty("tagName", "TEXTAREA")
  await expect(page.getByLabel("Quantity")).toHaveAttribute("type", "number")
  await expect(page.getByLabel("Due date")).toHaveAttribute("type", "date")
  await expect(
    page.getByRole("checkbox", { name: "Client approved" })
  ).toBeVisible()
  await expect(page.getByRole("combobox", { name: "Priority" })).toBeVisible()
})

test("a select shows the options the definition lists", async ({ page }) => {
  await openPreview(page)
  await page.getByRole("combobox", { name: "Priority" }).click()

  await expect(page.getByRole("option")).toHaveText(["Low", "Medium", "High"])
})

test("a required field is marked and an optional one is not", async ({
  page,
}) => {
  await openPreview(page)

  await expect(page.getByLabel("Project name")).toHaveAttribute(
    "aria-required",
    "true"
  )
  await expect(
    page.getByText("Project name", { exact: false }).first()
  ).toContainText("*")
  await expect(page.getByLabel("Notes")).not.toHaveAttribute(
    "aria-required",
    "true"
  )
})

test("an inherited field shows its value and cannot be edited", async ({
  page,
}) => {
  await openPreview(page)

  const inherited = page.getByLabel("Client name")

  await expect(inherited).toHaveValue("Ama Owusu")
  await expect(inherited).toHaveAttribute("readonly", "")
  await expect(inherited).not.toBeEditable()
})

test("each error appears under its own field", async ({ page }) => {
  await openPreview(page, "?errors=1")

  const nameInput = page.getByLabel("Project name")
  const quantityInput = page.getByLabel("Quantity")
  const nameError = page.getByText("Enter a project name.")
  const quantityError = page.getByText("Quantity must be a whole number.")

  await expect(nameError).toBeVisible()
  await expect(quantityError).toBeVisible()

  // Each message belongs to its input, and sits below it and above the next.
  await expect(nameInput).toHaveAccessibleDescription("Enter a project name.")
  await expect(quantityInput).toHaveAccessibleDescription(
    "Quantity must be a whole number."
  )

  const nameBox = (await nameInput.boundingBox())!
  const errorBox = (await nameError.boundingBox())!
  const notesBox = (await page.getByLabel("Notes").boundingBox())!

  expect(errorBox.y).toBeGreaterThan(nameBox.y)
  expect(errorBox.y).toBeLessThan(notesBox.y)
})

test("a field with no error shows no message", async ({ page }) => {
  await openPreview(page, "?errors=1")

  await expect(page.getByLabel("Notes")).not.toHaveAttribute(
    "aria-invalid",
    "true"
  )
  await expect(page.getByLabel("Due date")).not.toHaveAttribute(
    "aria-invalid",
    "true"
  )
})

test("Save draft sends the values even with a required field empty", async ({
  page,
}) => {
  await openPreview(page)
  await page.getByRole("button", { name: "Save draft" }).click()

  const sent = await lastSent(page)

  expect(sent.action).toBe("save")
  expect(sent.values.projectName).toBe("")
})

test("Submit sends the values with the submit action", async ({ page }) => {
  await openPreview(page)
  await page.getByLabel("Project name").fill("Boiler retrofit")
  await page.getByRole("button", { name: "Submit" }).click()

  const sent = await lastSent(page)

  expect(sent.action).toBe("submit")
  expect(sent.values.projectName).toBe("Boiler retrofit")
})

test("every type sends the value it was given", async ({ page }) => {
  await openPreview(page)
  await page.getByLabel("Project name").fill("Boiler retrofit")
  await page.getByLabel("Notes").fill("Two lines\nof notes")
  await page.getByLabel("Quantity").fill("12")
  await page.getByLabel("Due date").fill("2026-12-01")
  await page.getByRole("checkbox", { name: "Client approved" }).click()
  await page.getByRole("combobox", { name: "Priority" }).click()
  await page.getByRole("option", { name: "High" }).click()
  await page.getByRole("button", { name: "Save draft" }).click()

  expect((await lastSent(page)).values).toMatchObject({
    projectName: "Boiler retrofit",
    notes: "Two lines\nof notes",
    quantity: 12,
    dueDate: "2026-12-01",
    approved: true,
    priority: "High",
    clientName: "Ama Owusu",
  })
})

test("clicking a label focuses its input", async ({ page }) => {
  await openPreview(page)

  await page.getByText("Project name").first().click()
  await expect(page.getByLabel("Project name")).toBeFocused()

  await page.getByText("Notes").first().click()
  await expect(page.getByLabel("Notes")).toBeFocused()
})

test("at 375px there is no sideways scroll and every input works", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await openPreview(page, "?errors=1")

  expect(await sidewaysScroll(page)).toBeLessThanOrEqual(0)

  await page.getByLabel("Project name").fill("Boiler retrofit")
  await page.getByLabel("Notes").fill("A note")
  await page.getByLabel("Quantity").fill("3")
  await page.getByLabel("Due date").fill("2026-12-01")
  await page.getByRole("checkbox", { name: "Client approved" }).click()
  await page.getByRole("combobox", { name: "Priority" }).click()
  await page.getByRole("option", { name: "Low" }).click()
  await page.getByRole("button", { name: "Submit" }).click()

  expect((await lastSent(page)).values.priority).toBe("Low")
})
