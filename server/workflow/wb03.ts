import type { WorkbookMap } from "./map"

// Finance opens once the executed contract is locked, and stays open for the
// life of the project, with the payment terms extract, D3.1, first. Once
// D3.1 locks, the payment milestone cycles start: one per milestone of
// D3.1's schedule, less the advance, which D2.12 already billed. Each cycle
// starts with the PM's billing trigger, D3.3, and the next cycle's D3.3
// opens as soon as the Finance Officer approves the one before. Approving a
// cycle's D3.3 also opens that cycle's draft invoice, D3.4, so the invoice
// and the next trigger run side by side. Locking a cycle's D3.4 opens that
// cycle's approved invoice, D3.5, for the PM as Head of Finance. A Fail
// sends the D3.4 back (D3.5's `sendsBackTo`). Approving a cycle's D3.5
// with Yes opens that cycle's transmitted invoice record, D3.6, for the
// Finance Officer to send. Sending a cycle's D3.6 opens that cycle's daily
// bank statement log, D3.7, which the FO submits once a day, each check
// opening the next, until the money is in. D3.8 is not built yet, so
// proceeding from D3.7 opens nothing more for now.
export const wb03: WorkbookMap = {
  workbook: "wb03",
  opens: { after: { all: ["D2.12"] } },
  tools: [
    { tool: "D3.1" },
    { tool: "D3.3", after: { all: ["D3.1"] }, repeats: true },
    { tool: "D3.4", after: { all: ["D3.3"] }, repeats: true },
    { tool: "D3.5", after: { all: ["D3.4"] }, repeats: true },
    {
      tool: "D3.6",
      after: { all: ["D3.5"] },
      when: {
        tool: "D3.5",
        field: "authorized",
        oneOf: ["Yes"],
        note: "This tool opens once D3.5 approves the invoice.",
      },
      repeats: true,
    },
    { tool: "D3.7", after: { all: ["D3.6"] }, repeats: true },
  ],
  cycles: {
    count: { tool: "D3.1", field: "paymentSchedule", less: 1 },
    closedBy: "D3.3",
  },
}
