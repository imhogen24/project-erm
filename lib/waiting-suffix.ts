// " (3)" after the Assign staff and Team links, and nothing at zero.
export function waitingSuffix(waiting: number): string {
  return waiting > 0 ? ` (${waiting})` : ""
}
