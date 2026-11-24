// D2.1, the standard contract template every project's contract starts from.

export const STANDARD_CONTRACT = "D2.1"

// 1.0's starting values that are the same on every project.
export const contractDefaults = {
  jurisdiction: "Ghana",
  currency: "GHS",
}

export const clauseStatuses = ["Active", "Archived"]

// 2.0's standard clauses, copied exactly from the sheet
// (docs/dev_docs/WORKBOOK_02/02_contract_tracking.json, "2.1 Master Contract
// Database"). The text in [square brackets] is filled in from the project
// when shown or exported: see `fills` in the D2.1 definition.
export const standardClauses = [
  {
    category: "Parties & Definitions",
    text: 'This Engineering Services Agreement ("Agreement") is entered into by and between IMHOGEN LTD ("Service Provider") and [Client Name] ("Client").',
  },
  {
    category: "Scope of Services",
    text: "IMHOGEN agrees to provide the engineering",
  },
  {
    category: "Payment Terms",
    text: "Client agrees to pay the total sum of [Total GHS] as follows: [X]% upon execution",
  },
  {
    category: "Intellectual Property (IP)",
    text: "Unless otherwise negotiated",
  },
  {
    category: "Limitation of Liability",
    text: "IMHOGEN's total liability under this Agreement",
  },
  {
    category: "Termination",
    text: "Either party may terminate this agreement with 14 days written notice. Client remains legally liable for all engineering hours logged and materials purchased up to the date of termination.",
  },
  {
    category: "Force Majeure",
    text: "Neither party shall be liable for delays caused by circumstances beyond their reasonable control",
  },
  {
    category: "Governing Law & Dispute",
    text: "This Agreement shall be governed by the laws of the Republic of Ghana. Disputes shall be resolved through binding arbitration in Kumasi",
  },
]
