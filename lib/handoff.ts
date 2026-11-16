// D1.16, the handoff from engineering to contracting: the rows the sheet
// always holds.

export const HANDOFF = "D1.16"

// 3.0's standard directives and the record each comes from. On Tier 3 the
// financial terms come from T3.D1.15a in place of D1.15.
export const handoffDirectives = [
  { category: "Scope Exclusion", source: "D1.13" },
  { category: "Timeline Risk", source: "D1.11" },
  { category: "Financial Risk", source: "D1.15" },
]

// 4.0's checklist and who does each.
export const handoffChecklist = [
  {
    task: 'Has the central database status been updated to "Contracting Phase"?',
    assignee: "Contract Admin",
  },
  {
    task: "Have all D1.1 to D1.15 documents been moved to the permanent digital folder?",
    assignee: "Lead Engineer",
  },
  {
    task: "Is the Contract Admin fully clear on the technical deliverables to be billed?",
    assignee: "Contract Admin",
  },
]

export const checklistStatuses = ["Pending", "Done"]
