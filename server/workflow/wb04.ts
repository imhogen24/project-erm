import type { WorkbookMap } from "./map"

// Team assignment opens once the first payment is received: D3.10 of the first
// payment milestone is locked. D4.1 runs on Tier 1 only, D4.2 opens once
// D4.1 locks, D4.3 once D4.2 locks, D4.4 once D4.3 locks, D4.5 once D4.4 locks,
// D4.6 once D4.5 locks, and D4.7 once D4.6 locks.
export const wb04: WorkbookMap = {
  workbook: "wb04",
  opens: { after: { all: ["D3.10"] } },
  tools: [
    { tool: "D4.1" },
    { tool: "D4.2", after: { all: ["D4.1"] } },
    { tool: "D4.3", after: { all: ["D4.2"] } },
    { tool: "D4.4", after: { all: ["D4.3"] } },
    { tool: "D4.5", after: { all: ["D4.4"] } },
    { tool: "D4.6", after: { all: ["D4.5"] } },
    { tool: "D4.7", after: { all: ["D4.6"] } },
  ],
}
