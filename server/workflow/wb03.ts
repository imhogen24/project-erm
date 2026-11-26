import type { WorkbookMap } from "./map"

// Finance opens once the executed contract is locked, and stays open for the
// life of the project, with the payment terms extract, D3.1, first. The
// payment milestone cycles of D3.3 to D3.10 are added by the WB03 slice.
export const wb03: WorkbookMap = {
  workbook: "wb03",
  opens: { after: { all: ["D2.12"] } },
  tools: [{ tool: "D3.1" }],
}
