import { expect, type Page } from "@playwright/test"

// Opens the date picker behind `label` and picks `day` (YYYY-MM-DD) in it.
export async function pickDate(page: Page, label: string, day: string) {
  const [year, month] = day.split("-").map(Number)

  // A required field's label carries its * mark, so its picker is found by
  // the button's own name instead.
  const labelled = page.getByLabel(label, { exact: true })

  const picker =
    (await labelled.count()) > 0
      ? labelled
      : page.getByRole("button", { name: label, exact: true })

  await picker.click()

  const calendar = page.getByRole("dialog")

  await calendar.getByLabel("Choose the Year").selectOption(String(year))
  await calendar.getByLabel("Choose the Month").selectOption(String(month! - 1))
  await calendar.locator(`td[data-day="${day}"]`).getByRole("button").click()

  // The calendar closes with a short animation. Wait for it to go, so the next
  // picker is the only one open.
  await expect(calendar).toHaveCount(0)
}
