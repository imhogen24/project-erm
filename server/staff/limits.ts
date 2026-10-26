import type { ProjectStatus, Role } from "@/db/schema"

type WorkloadLimit = { group: string; roles: readonly Role[]; limit: number }

// The most projects a person may be on in each group, from the call with the
// project owner on 24 Oct 2026. The roles in one group count together, so LE
// on two projects and AE on one is three engineering projects. Each group is
// counted on its own, not in a total. A role in no group has no limit.
export const workloadLimits: readonly WorkloadLimit[] = [
  { group: "PM", roles: ["PM"], limit: 3 },
  { group: "Engineer", roles: ["LE", "AE"], limit: 3 },
  { group: "OM", roles: ["OM"], limit: 6 },
  { group: "Finance", roles: ["FO"], limit: 6 },
]

// A project takes up a slot while it is still running. A rejected, closed or
// completed project frees it.
export const countedStatuses: readonly ProjectStatus[] = ["active", "on_hold"]

// The roles a project has exactly one of.
export const oneHolderRoles: readonly Role[] = ["PM", "OM"]

export function limitFor(role: Role): WorkloadLimit | undefined {
  return workloadLimits.find((entry) => entry.roles.includes(role))
}
