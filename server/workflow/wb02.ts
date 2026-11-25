import type { WorkbookMap } from "./map"

// Contracting opens once the handoff meeting minutes are locked, with the
// standard contract template first, then the initial draft: D2.2 on Tier 1,
// T3.D2.2a on Tier 3. Which track a tool is on comes from its definition. The
// PM's review, D2.3, waits for the draft: "D2.2" means T3.D2.2a on a Tier 3
// project. The Finance Officer's review, D2.4, waits for D2.3 locked with
// Approved. Sending the draft back is each review's own (its `sendsBackTo`).
// The tools after them are added as each is built; D2.5 waits for D2.4
// locked with Approved.
export const wb02: WorkbookMap = {
  workbook: "wb02",
  opens: { after: { all: ["D1.16"] } },
  tools: [
    { tool: "D2.1" },
    { tool: "D2.2", after: { all: ["D2.1"] } },
    { tool: "T3.D2.2a", after: { all: ["D2.1"] } },
    { tool: "D2.3", after: { all: ["D2.2"] } },
    {
      tool: "D2.4",
      after: { all: ["D2.3"] },
      when: { tool: "D2.3", field: "operationalStatus", oneOf: ["Approved"] },
    },
  ],
}
