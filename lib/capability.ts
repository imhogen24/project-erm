// D1.10's fixed rows and choices, from the sheet (docs/dev_docs/WORKBOOK_01,
// D1.10).

export const capabilityObjective =
  "Determine whether IMHOGEN has the technical, human-resource, equipment and commercial capacity to execute the requested scope to the required quality, and identify resource or scheduling constraints requiring adjustment before commitment."

export const technicalCriteria = [
  "Engineering Design & CAD Capability",
  "Engineering Computing / CAD Workstation Capacity",
  "Human Resource Capacity for Full Project Scope",
  "Physical Measurement / Reverse Engineering & Manufacturing Validation",
]

export const commercialCriteria = [
  "Requested Scope vs Available Delivery Capacity",
  "Requested Timeline vs Required Engineering Effort",
  "Client Budget vs Scope",
  "Value of Requested Solution",
  "Resource Expansion Feasibility",
]

export const criterionStatuses = ["Yes", "No", "Partial", "Undetermined"]

// The workflow reads these: Not Capable rejects the project, and the others
// open D1.11 (server/workflow/wb01.ts).
export const capabilityStatuses = [
  "Capable",
  "Partially Capable",
  "Not Capable",
]
