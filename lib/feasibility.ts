// D1.12's fixed rows and choices, from the sheet (docs/dev_docs/WORKBOOK_01,
// D1.12).

export const feasibilityObjective =
  "Determine whether IMHOGEN can technically and commercially execute the requested project, identify capability and delivery gaps, and establish a realistic scope, resource requirement and timeline before commitment."

export const capabilityDomains = [
  "Engineering & Design",
  "Manufacturing & Tools",
  "Supply Chain & Materials",
  "Resource Bandwidth",
]

export const domainStatuses = ["Capable", "Partial", "Not Capable"]

export const impactLevels = ["High", "Medium", "Low"]

// D1.11 rates risks H, M or L; D1.12 names them.
export function impactOf(level: string | undefined): string | undefined {
  switch (level) {
    case "H":
      return "High"
    case "M":
      return "Medium"
    case "L":
      return "Low"
    default:
      return undefined
  }
}
