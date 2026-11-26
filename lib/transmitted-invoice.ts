import { addDays } from "@/lib/follow-dates"

// D3.6, the transmitted invoice record: once a milestone's invoice is
// approved (D3.5), the Finance Officer checks the client's billing email and
// the covering message and presses Send. The app emails the approved invoice
// PDF to the client, copies the PM, keeps a copy of the email, starts the
// payment clock and locks D3.6. Seven days before the due date it reminds
// the client. One D3.6 per payment milestone cycle.

export const TRANSMITTED_INVOICE = "D3.6"

// The reconciled payment log. Once a cycle's D3.8 locks, the milestone is
// paid and its reminder is not sent. D3.8 is not built yet, so until then
// the reminder always goes.
export const RECONCILED_PAYMENT = "D3.8"

export const YES = "Yes"

export const NO = "No"

export const yesNo = [YES, NO]

// The reminder goes this many days before the payment due date.
export const REMINDER_DAYS_BEFORE = 7

// The sheet's subject line, fixed, with D3.4's invoice number and the
// project's name filled in. A value not known yet keeps its [name].
export function subjectFor(invoiceNumber: string, projectName: string) {
  return `IMHO GEN Invoice ${invoiceNumber || "[Insert Inv #]"} - ${projectName || "[Project Name]"}`
}

// A YYYY-MM-DD day as the script writes it, DD/MM/YYYY as on the sheet.
export function shownDay(day: string): string {
  const [year, month, date] = day.split("-")

  return year && month && date ? `${date}/${month}/${year}` : day
}

// The payment due date: the day sent plus the payment window's days.
// Undefined when D3.1's payment window names no days.
export function dueDateOf(
  dateSent: string,
  windowDays: number | undefined
): string | undefined {
  return windowDays === undefined ? undefined : addDays(dateSent, windowDays)
}

// The day the reminder goes: seven days before the due date, or none when
// the due date is seven days from sending or less, so no reminder fits.
export function reminderDayOf(
  dateSent: string,
  dueDate: string | undefined
): string | undefined {
  if (!dueDate) {
    return undefined
  }

  const day = addDays(dueDate, -REMINDER_DAYS_BEFORE)

  return day && day > dateSent ? day : undefined
}

export type ScriptValues = {
  clientName?: string
  milestone?: string
  invoiceNumber?: string
  amount?: string
  dueDate?: string
  windowDays?: number
  bankName?: string
}

// The sheet's covering message, with what the app knows filled in. A value
// not known yet keeps the sheet's [name], so the FO sees what is missing.
export function scriptFor(values: ScriptValues): string {
  const days =
    values.windowDays === undefined ? "21" : String(values.windowDays)

  return [
    `Dear ${values.clientName || "[Client Name]"}`,
    `We are pleased to inform you that ${values.milestone || "[Insert Milestone, e.g., Phase 1 Engineering]"} has been successfully completed and approved.`,
    `Please find attached Invoice ${values.invoiceNumber || "[Insert Inv #]"} for the amount of ${values.amount || "[Insert Amount GHS]"} covering this milestone. As per our Engineering Services Agreement, payment is due within ${days} days of this notice (by ${values.dueDate ? shownDay(values.dueDate) : "[Payment Due Date]"}).`,
    `Funds can be transferred to our ${values.bankName || "Fidelity Bank"} account as detailed on the attached invoice. Please reply to this email with a copy of the payment transfer receipt once completed so we can promptly reconcile the account and authorize the engineering team to begin the next phase.`,
    "Thank you for your continued partnership.",
    "Best regards\nIMHOGEN Finance Department",
  ].join("\n\n")
}

// The page that shows the email one cycle's D3.6 sent, as it went out.
export function sentInvoiceEmailPath(projectId: string, cycle: number) {
  return `/projects/${projectId}/tools/${TRANSMITTED_INVOICE}/sent-email?cycle=${cycle}`
}
