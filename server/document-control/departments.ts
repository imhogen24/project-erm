import type { Role } from "@/db/schema"

// The department of each role, from
// docs/dev_docs/CRITICAL_DATA_STRUCTURE/AGENT_ROLES.md.
export const departments: Record<Role, string> = {
  Client: "External",
  PM: "Operations",
  OM: "Operations",
  LE: "Engineering",
  AE: "Engineering",
  LD: "Engineering",
  FO: "Finance",
  CA: "Operations",
  HE: "Engineering",
  PO: "Operations",
  IO: "Operations",
  WS: "Operations",
  T: "Operations",
  QA: "Operations",
  LFE: "Operations",
  LO: "Operations",
  CR: "Operations",
  "IT/Admin": "IT",
  MKT: "Business Dev",
}
