import type { WorkbookMap } from "./map"

// Onboarding, from docs/dev_docs/WORKBOOK_01. A Tier 3 project uses T3.D1.3a,
// T3.D1.8a and T3.D1.15a in place of D1.3, D1.8 and D1.15, and skips D1.5 to
// D1.7, since the client sends assets instead of meeting. Which track a tool
// is on comes from its definition.
export const wb01: WorkbookMap = {
  workbook: "wb01",
  tools: [
    { tool: "D1.1" },
    { tool: "D1.2", after: { all: ["D1.1"] } },
    {
      tool: "D1.3",
      after: { all: ["D1.2"] },
      when: {
        tool: "D1.2",
        field: "triageDecision",
        oneOf: ["Proceed to D1.3"],
      },
    },
    {
      tool: "T3.D1.3a",
      after: { all: ["D1.2"] },
      when: {
        tool: "D1.2",
        field: "triageDecision",
        oneOf: ["Proceed to D1.3"],
      },
    },
    { tool: "D1.4", after: { all: ["D1.3"] } },
    { tool: "D1.5", after: { all: ["D1.4"] } },
    { tool: "D1.6", after: { all: ["D1.5"] } },
    { tool: "D1.7", after: { all: ["D1.6"] } },
    { tool: "D1.8", after: { all: ["D1.7"] } },
    { tool: "T3.D1.8a", after: { all: ["D1.4"] } },
    { tool: "D1.9", after: { all: ["D1.8"] } },
    { tool: "D1.10", after: { all: ["D1.9"] } },
    {
      tool: "D1.11",
      after: { all: ["D1.10"] },
      when: {
        tool: "D1.10",
        field: "overallCapabilityStatus",
        oneOf: ["Capable", "Partially Capable"],
      },
    },
    {
      tool: "D1.12",
      after: { all: ["D1.11"] },
      when: {
        tool: "D1.11",
        field: "goNoGoDecision",
        oneOf: ["Go", "Conditional Go"],
      },
    },
    { tool: "D1.13", after: { all: ["D1.12"] } },
    { tool: "D1.14", after: { all: ["D1.13"] } },
    // When the minimum overhead is not met, Finance reviews D1.14 and it is
    // reopened through a change request. The project is not stopped.
    {
      tool: "D1.15",
      after: { all: ["D1.14"] },
      when: { tool: "D1.14", field: "minimumOverheadMet", oneOf: [true] },
    },
    {
      tool: "T3.D1.15a",
      after: { all: ["D1.14"] },
      when: { tool: "D1.14", field: "minimumOverheadMet", oneOf: [true] },
    },
    { tool: "D1.16", after: { all: ["D1.15"] } },
  ],
  stops: [
    {
      tool: "D1.2",
      field: "triageDecision",
      oneOf: ["Reject as Spam"],
      status: "rejected",
    },
    {
      tool: "D1.10",
      field: "overallCapabilityStatus",
      oneOf: ["Not Capable"],
      status: "rejected",
    },
    {
      tool: "D1.11",
      field: "goNoGoDecision",
      oneOf: ["No-Go"],
      status: "closed",
    },
  ],
}
