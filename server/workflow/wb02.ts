import type { WorkbookMap } from "./map"

// Contracting opens once the handoff meeting minutes are locked, with the
// standard contract template first, then the initial draft: D2.2 on Tier 1,
// T3.D2.2a on Tier 3. Which track a tool is on comes from its definition. The
// PM's review, D2.3, waits for the draft: "D2.2" means T3.D2.2a on a Tier 3
// project. The Finance Officer's review, D2.4, waits for D2.3 locked with
// Approved, and the Head of R&D / Ops's review, D2.5, for D2.4 locked with
// Approved. Sending the draft back is each review's own (its `sendsBackTo`).
// D2.5 locked with Rejected closes the project, and with Approved for Client
// Transmission opens D2.6, the baseline. The tools after it are added as each
// is built.
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
    {
      tool: "D2.5",
      after: { all: ["D2.4"] },
      when: { tool: "D2.4", field: "commercialStatus", oneOf: ["Approved"] },
    },
    {
      tool: "D2.6",
      after: { all: ["D2.5"] },
      when: {
        tool: "D2.5",
        field: "executiveDecision",
        oneOf: ["Approved for Client Transmission"],
      },
    },
  ],
  stops: [
    {
      tool: "D2.5",
      field: "executiveDecision",
      oneOf: ["Rejected"],
      status: "closed",
    },
  ],
}
