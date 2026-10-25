import type { WorkbookMap } from "./map"

// Finance opens once the executed contract is locked, and stays open for the
// life of the project. The order of its tools, and the payment milestone
// cycles of D3.3 to D3.10, are added by the WB03 slice.
export const wb03: WorkbookMap = {
  workbook: "wb03",
  opens: { after: { all: ["D2.12"] } },
  tools: [],
}
