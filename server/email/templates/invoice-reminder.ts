import { escapeHtml, placeholder, type RenderedEmail } from "./html"

export type InvoiceReminderData = {
  // The subject of the invoice email it follows up.
  subject: string
  clientName: string
  invoiceNumber: string
  // Such as "GHS 79,810.00".
  amount: string
  // DD/MM/YYYY.
  dueDate: string
}

// D3.6's reminder to the client seven days before the invoice is due. The
// wording is not written yet.
export function invoiceReminder(data: InvoiceReminderData): RenderedEmail {
  const lines = [
    `Dear ${data.clientName}`,
    `${placeholder}: a reminder that Invoice ${data.invoiceNumber} for ${data.amount} is due for payment by ${data.dueDate}. Please reply with a copy of the payment transfer receipt once it is paid.`,
    "Best regards\nIMHOGEN Finance Department",
  ]

  return {
    subject: `Reminder: ${data.subject}`,
    text: lines.join("\n\n"),
    html: `<!doctype html><html><body>${lines.map((line) => `<p>${escapeHtml(line).replaceAll("\n", "<br>")}</p>`).join("")}</body></html>`,
  }
}
