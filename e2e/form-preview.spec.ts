import { expect, test, type Page } from "@playwright/test"
import { z } from "zod"

import { makePerson, sidewaysScroll, signIn } from "./support/data"
import { pickDate } from "./support/pick-date"

// The preview page draws one tool with a field of every type. The page shows
// what the form sent, so a test can read it back.
async function openPreview(page: Page, query = "") {
  const person = await makePerson()

  await signIn(page, person.email)
  await page.goto(`/dev/form-preview${query}`)
}

const sentSchema = z.object({
  action: z.string(),
  values: z.record(z.string(), z.json()),
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
  await expect(page.getByRole("button", { name: "Due date" })).toBeVisible()
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

// The form saves by itself a moment after the last change, so this waits
// until the newest save holds what the test checks.
async function whenSaved(
  page: Page,
  check: (values: z.output<typeof sentSchema>["values"]) => void
) {
  await expect(async () => {
    const sent = await lastSent(page)

    expect(sent.action).toBe("save")
    check(sent.values)
  }).toPass()
}

test("there is no Save draft: Submit for approval is the only button", async ({
  page,
}) => {
  await openPreview(page)

  await expect(page.getByRole("button", { name: "Save draft" })).toHaveCount(0)
  await expect(
    page.getByRole("button", { name: "Submit for approval" })
  ).toBeVisible()
})

test("typing saves the values by itself, even with a required field empty", async ({
  page,
}) => {
  await openPreview(page)
  await page.getByLabel("Notes").fill("Half done")

  await whenSaved(page, (values) => {
    expect(values.notes).toBe("Half done")
    expect(values.projectName).toBe("")
  })
})

test("nothing saves before the person changes something", async ({ page }) => {
  await openPreview(page)

  await expect(page.getByLabel("Last sent")).toHaveText("Nothing sent yet.")
})

test("Submit cancels a save still waiting to go", async ({ page }) => {
  await openPreview(page)
  await page.getByLabel("Project name").fill("Boiler retrofit")
  await page.getByRole("button", { name: "Submit" }).click()

  await expect(page.getByLabel("Last sent")).toContainText('"submit"')

  // Longer than the wait before a save: nothing saves over the submit.
  await page.waitForTimeout(1500)

  expect((await lastSent(page)).action).toBe("submit")
})

test("Submit sends the values with the submit action", async ({ page }) => {
  await openPreview(page)
  await page.getByLabel("Project name").fill("Boiler retrofit")
  await page.getByRole("button", { name: "Submit" }).click()

  await expect(page.getByLabel("Last sent")).toContainText('"submit"')

  const sent = await lastSent(page)

  expect(sent.action).toBe("submit")
  expect(sent.values.projectName).toBe("Boiler retrofit")
})

test("every type sends the value it was given", async ({ page }) => {
  await openPreview(page)
  await page.getByLabel("Project name").fill("Boiler retrofit")
  await page.getByLabel("Notes").fill("Two lines\nof notes")
  await page.getByLabel("Quantity").fill("12")
  await pickDate(page, "Due date", "2026-12-01")
  await page.getByRole("checkbox", { name: "Client approved" }).click()
  await page.getByRole("combobox", { name: "Priority" }).click()
  await page.getByRole("option", { name: "High" }).click()

  await whenSaved(page, (values) =>
    expect(values).toMatchObject({
      projectName: "Boiler retrofit",
      notes: "Two lines\nof notes",
      quantity: 12,
      dueDate: "2026-12-01",
      approved: true,
      priority: "High",
      clientName: "Ama Owusu",
    })
  )
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
  await pickDate(page, "Due date", "2026-12-01")
  await page.getByRole("checkbox", { name: "Client approved" }).click()
  await page.getByRole("combobox", { name: "Priority" }).click()
  await page.getByRole("option", { name: "Low" }).click()
  await page.getByRole("button", { name: "Submit" }).click()

  expect((await lastSent(page)).values.priority).toBe("Low")
})

for (const width of [1280, 375]) {
  test(`locked rows keep their name and added rows can be removed at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 })
    await openPreview(page)

    const table = page.getByRole("table", { name: "Locked and added rows" })

    await expect(table.getByText("Primary purpose")).toBeVisible()
    await expect(table.getByText("Main deliverables")).toBeVisible()
    await expect(
      table.getByRole("button", { name: /^Remove row/ })
    ).toHaveCount(0)

    await table.getByRole("button", { name: "Add row" }).click()
    await table.getByLabel("Item, row 3").fill("Site access")
    await table.getByLabel("Detail, row 3").fill("Gate code needed")
    await expect(table.getByLabel("Item, row 3")).toHaveValue("Site access")
    expect(await sidewaysScroll(page)).toBeLessThanOrEqual(0)

    await table.getByRole("button", { name: "Remove row 3" }).click()
    await expect(table.getByLabel("Item, row 3")).toHaveCount(0)
    await expect(table.getByText("Primary purpose")).toBeVisible()
  })
}
