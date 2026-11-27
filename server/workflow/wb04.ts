import type { WorkbookMap } from "./map"

// Team assignment opens once the first payment is received: D3.10 of the first
// payment milestone is locked. D4.1 runs on Tier 1 only, and D4.2 opens once
// D4.1 locks.
export const wb04: WorkbookMap = {
  workbook: "wb04",
  opens: { after: { all: ["D3.10"] } },
  tools: [{ tool: "D4.1" }, { tool: "D4.2", after: { all: ["D4.1"] } }],
}
