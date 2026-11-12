// D1.8's fixed rows, from the sheet (docs/dev_docs/WORKBOOK_01, D1.8).

// 2.0: what goes in, what comes out, and what operates the system.
export const needsCategories = [
  "INPUT: Material",
  "INPUT: Energy",
  "INPUT: Information",
  "INPUT: Livingthing",
  "OUTPUT: Material",
  "OUTPUT: Energy",
  "OUTPUT: Information",
  "OUTPUT: Livingthing",
  "OPERATOR: Human System",
  "OPERATOR: Tech System",
  "OPERATOR: Active Env.",
  "OPERATOR: Mgt System",
  "OPERATOR: Information System",
] as const

// 3.0: the requirement categories every design starts from. More rows may be
// added after them.
export const specCategories = [
  "Function Properties",
  "Operational Properties",
  "Manufacturing Properties",
  "Environmental Properties",
  "Distribution Properties",
]

export const priorities = ["Fixed", "Wish"]
