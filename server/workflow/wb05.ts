import type { WorkbookMap } from "./map"

// Engineering design opens once D4.8 is locked. Tier 3 projects skip it. The
// order of its tools is added by the WB05 slice.
export const wb05: WorkbookMap = {
  workbook: "wb05",
  opens: { after: { all: ["D4.8"] }, tracks: ["Tier_1"] },
  tools: [],
}
