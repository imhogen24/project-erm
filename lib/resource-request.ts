import type { Role } from "@/db/schema"

// D4.2, the resource request form, the second tool of Workbook 4, on Tier 1
// only: the Lead Engineer asks for the engineers D4.1's skill list needs,
// and the Head of Engineering checks each one against their work on other
// projects, approves them or names someone else, and signs, which approves
// and locks it. D4.3's team assignment is built from it.

export const RESOURCE_REQUEST = "D4.2"

// The company roles of the engineers a request may name.
export const engineeringRoles: Role[] = ["HE", "LE", "AE", "LD"]

// Named instead of an engineer when anyone free will do.
export const ANY_AVAILABLE = "Any available"

export const FULLY_AVAILABLE = "Fully available"

// What 3.0 shows of an engineer's days on other projects, such as "15 days
// on Rice Mill; 4 days on Solar Dryer", or that they have none.
export function utilizationText(
  bookings: readonly { project: string; days: number }[]
): string {
  if (bookings.length === 0) {
    return FULLY_AVAILABLE
  }

  return bookings
    .map(
      ({ project, days }) =>
        `${days} ${days === 1 ? "day" : "days"} on ${project}`
    )
    .join("; ")
}
