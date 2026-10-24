import type { WorkbookMap } from "./map"

// Contracting opens once the handoff meeting minutes are locked. The order of
// its tools is added by the WB02 slice.
export const wb02: WorkbookMap = {
  workbook: "wb02",
  opens: { after: { all: ["D1.16"] } },
  tools: [],
}
