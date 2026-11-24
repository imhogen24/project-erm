import type { WorkbookMap } from "./map"

// Contracting opens once the handoff meeting minutes are locked, with the
// standard contract template first, then the initial draft: D2.2 on Tier 1,
// T3.D2.2a on Tier 3. Which track a tool is on comes from its definition. The
// tools after them are added as each is built.
export const wb02: WorkbookMap = {
  workbook: "wb02",
  opens: { after: { all: ["D1.16"] } },
  tools: [
    { tool: "D2.1" },
    { tool: "D2.2", after: { all: ["D2.1"] } },
    { tool: "T3.D2.2a", after: { all: ["D2.1"] } },
  ],
}
