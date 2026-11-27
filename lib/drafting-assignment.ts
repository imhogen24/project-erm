// T3.D4.8a, the drafting assignment and baseline, Workbook 4's only tool on
// Tier 3, in place of D4.1 to D4.8, opened with the workbook: the Assigned
// Engineer takes the drafting job in one record, with their hours and dates,
// their access to the client's data, CAD folder and software, and the
// drafting standards from T3.D1.3a, and the PM signs it, which approves and
// locks it. Each engineer named in 1.0 then joins the project, as on D4.3.

export const DRAFTING_ASSIGNMENT = "T3.D4.8a"

// 2.0's three resources, each with the two statuses it can hold, the first
// the one submitting needs.
export const digitalAssets = [
  { resource: "Client Source Data", statuses: ["Ready", "Missing"] },
  { resource: "Project CAD Folder", statuses: ["Created", "Pending"] },
  { resource: "Software License", statuses: ["Verified", "Pending"] },
] as const

// 3.0's three parameters, each with the T3.D1.3a drafting specification
// column its requirement starts on, and the sheet's reference standard.
export const technicalBaseline = [
  {
    parameter: "Drafting Standard",
    from: "standard",
    reference: "Must match T3.D1.3a",
  },
  {
    parameter: "Tolerance Class",
    from: "toleranceClass",
    reference: "Linear & Angular",
  },
  {
    parameter: "Deliverable Format",
    from: "fileFormat",
    reference: "As per T3.D2.2a",
  },
] as const
