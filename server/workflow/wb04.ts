import type { WorkbookMap } from "./map"

// Team assignment opens once the first payment is received: D3.10 of the first
// payment milestone is locked. The order of its tools is added by the WB04
// slice.
export const wb04: WorkbookMap = {
  workbook: "wb04",
  opens: { after: { all: ["D3.10"] } },
  tools: [],
}
