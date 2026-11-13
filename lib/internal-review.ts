// D1.9's review rows, from the sheet (docs/dev_docs/WORKBOOK_01, D1.9): each
// category with the reviewer and question it starts with, which the OM may
// change.
export const reviewDirectives = [
  {
    category: "Technical Feasibility",
    reviewer: "Engineering Risk Officer",
    focus: "Evaluate the physical constraints outlined in D1.8.",
  },
  {
    category: "Resource Availability",
    reviewer: "Head of Operations",
    focus: "Check workshop/personnel capacity for requested timeline.",
  },
  {
    category: "Commercial & Scope Alignment",
    reviewer: "Project Manager",
    focus: "Verify client budget expectations align with stated deliverables.",
  },
  {
    category: "Solution Suitability & Value Engineering",
    reviewer: "Lead Engineer / Senior Mechanical Engineer",
    focus:
      "Determine whether the requested deliverables represent the most technically sound and cost-effective solution, and whether they and the timeline are realistic value for the client and IMHOGEN.",
  },
]

export const reviewStatuses = ["Required", "Passed", "Failed", "Undecided"]

export const priorityLevels = ["High", "Medium", "Low"]
