import { roles, type Role } from "@/db/schema"
import { tools } from "@/server/tools/registry"

export type Access = "RW" | "RO" | "RA"

export type Action = "read" | "write" | "approve"

// For each tool, the access each role has. A role that is missing has none.
export const permissionMatrix = {
  // D1.1 is the client's own web form: only the client writes it, and it locks
  // as soon as it is submitted, so it has no approver. The OM prepares D1.2 to
  // D1.7 and the PM approves them, since reviewing is not approving.
  "D1.1": { Client: "RW", OM: "RO", PM: "RO", CR: "RO", "IT/Admin": "RO" },
  "D1.2": { OM: "RW", PM: "RO", CA: "RO", CR: "RO", "IT/Admin": "RO" },
  "D1.3": { OM: "RW", PM: "RA", CA: "RO", CR: "RO", "IT/Admin": "RO" },
  "D1.4": {
    Client: "RO",
    OM: "RW",
    PM: "RO",
    CA: "RO",
    CR: "RO",
    "IT/Admin": "RO",
  },
  "D1.5": {
    Client: "RO",
    OM: "RW",
    PM: "RO",
    LE: "RO",
    CA: "RO",
    CR: "RO",
    "IT/Admin": "RO",
  },
  "D1.6": {
    Client: "RO",
    OM: "RW",
    PM: "RO",
    LE: "RO",
    CA: "RO",
    CR: "RO",
    "IT/Admin": "RO",
  },
  "D1.7": { Client: "RO", OM: "RW", PM: "RA", LE: "RO", "IT/Admin": "RO" },
  "D1.8": { Client: "RO", OM: "RO", PM: "RA", LE: "RW", "IT/Admin": "RO" },
  "D1.9": { OM: "RW", PM: "RO", LE: "RO", HE: "RA", "IT/Admin": "RO" },
  "D1.10": { OM: "RO", PM: "RA", LE: "RW", HE: "RO", "IT/Admin": "RO" },
  "D1.11": { OM: "RO", PM: "RA", LE: "RW", HE: "RO", "IT/Admin": "RO" },
  "D1.12": {
    Client: "RO",
    OM: "RO",
    PM: "RA",
    LE: "RW",
    HE: "RO",
    QA: "RO",
    CR: "RO",
    "IT/Admin": "RO",
  },
  "D1.13": {
    Client: "RO",
    OM: "RO",
    PM: "RA",
    LE: "RW",
    FO: "RO",
    CR: "RO",
    "IT/Admin": "RO",
  },
  "D1.14": {
    OM: "RO",
    PM: "RA",
    LE: "RW",
    FO: "RO",
    CR: "RO",
    "IT/Admin": "RO",
  },
  "D1.15": {
    Client: "RO",
    OM: "RO",
    PM: "RA",
    LE: "RW",
    FO: "RO",
    CA: "RO",
    CR: "RO",
    "IT/Admin": "RO",
  },
  "D1.16": {
    OM: "RO",
    PM: "RA",
    LE: "RW",
    CA: "RO",
    HE: "RO",
    "IT/Admin": "RO",
  },
  "D2.1": { PM: "RO", CA: "RW", HE: "RO", "IT/Admin": "RO" },
  // The FO reads the draft and the PM's review, which D2.4 shows them. The HE
  // reads the draft and both reviews, which D2.5 checks are in.
  "D2.2": { PM: "RO", FO: "RO", CA: "RW", HE: "RO", CR: "RO" },
  "D2.3": { PM: "RA", FO: "RO", CA: "RO", HE: "RO", CR: "RO" },
  "D2.4": { PM: "RO", FO: "RA", CA: "RO", HE: "RO", CR: "RO" },
  "D2.5": { PM: "RO", FO: "RO", CA: "RO", HE: "RA", CR: "RO" },
  "D2.6": { PM: "RO", FO: "RO", CA: "RW", HE: "RO", CR: "RO" },
  "D2.7": { Client: "RO", PM: "RO", CA: "RW", CR: "RO" },
  "D2.8": { Client: "RO", PM: "RO", CA: "RW", LO: "RO", CR: "RO" },
  "D2.9": { Client: "RO", PM: "RO", CA: "RW", HE: "RO", CR: "RO" },
  "D2.10": { Client: "RO", PM: "RO", FO: "RO", CA: "RW", HE: "RO", CR: "RO" },
  "D2.11": { Client: "RW", PM: "RO", CA: "RW", HE: "RW", CR: "RO" },
  "D2.12": { Client: "RO", PM: "RA", FO: "RO", CA: "RW", HE: "RO", CR: "RO" },
  "D2.13": { PM: "RO", CA: "RW", CR: "RO" },
  "D2.14": { PM: "RA", FO: "RO", CA: "RW", CR: "RO" },
  D2: { PM: "RO", FO: "RO", CA: "RW", CR: "RO" },
  "D3.1": { Client: "RO", PM: "RA", FO: "RW", CA: "RO", CR: "RO" },
  "D3.2": { PM: "RO", FO: "RW", CR: "RO" },
  "D3.3": { PM: "RW", FO: "RA", HE: "RO", CR: "RO" },
  "D3.4": { PM: "RO", FO: "RW", CR: "RO" },
  "D3.5": { PM: "RA", FO: "RW", HE: "RO", CR: "RO" },
  "D3.6": { Client: "RO", PM: "RO", FO: "RW", CR: "RO" },
  "D3.7": { PM: "RO", FO: "RW", CR: "RO" },
  "D3.8": { PM: "RA", FO: "RW", HE: "RO", CR: "RO" },
  "D3.9": { Client: "RO", PM: "RO", FO: "RW", CR: "RO" },
  "D3.10": { PM: "RA", FO: "RW", HE: "RO", CR: "RO" },
  "D3.11": { Client: "RO", PM: "RO", FO: "RW", HE: "RO", LO: "RO", CR: "RO" },
  D4: { OM: "RO", PM: "RA", HE: "RW", CR: "RO" },
  "D4.1": { OM: "RO", PM: "RA", LE: "RW", AE: "RO", HE: "RO", CR: "RO" },
  "D4.2": { OM: "RO", PM: "RA", LE: "RW", AE: "RO", HE: "RO", CR: "RO" },
  "D4.3": { PM: "RA", LE: "RW", AE: "RO", LD: "RO", HE: "RO", CR: "RO" },
  "D4.4": { PM: "RA", LE: "RO", AE: "RO", LD: "RO", HE: "RW", CR: "RO" },
  "D4.5": { PM: "RA", LE: "RW", AE: "RO", LD: "RO", HE: "RO", CR: "RO" },
  "D4.6": {
    Client: "RO",
    PM: "RW",
    LE: "RO",
    AE: "RO",
    LD: "RO",
    LO: "RO",
    CR: "RO",
  },
  "D4.7": {
    Client: "RO",
    PM: "RO",
    LE: "RW",
    AE: "RO",
    LD: "RO",
    LO: "RO",
    CR: "RO",
  },
  "D4.8": { PM: "RA", LE: "RO", HE: "RW", CR: "RO" },
  "P1.0": {
    Client: "RO",
    PM: "RO",
    LE: "RW",
    AE: "RO",
    HE: "RA",
    QA: "RO",
    CR: "RO",
  },
  "P2.0": { PM: "RO", LE: "RW", HE: "RA", CR: "RO" },
  "Pr2.1": { PM: "RO", CR: "RO" },
  "P3.1": { Client: "RO", PM: "RO", LE: "RW", AE: "RO", HE: "RA", CR: "RO" },
  "P3.1a": { LE: "RW", AE: "RO", HE: "RA", CR: "RO" },
  "P3.1b": { LE: "RW", AE: "RO", LD: "RO", HE: "RA", CR: "RO" },
  "P3.2": { LE: "RW", AE: "RO", HE: "RA", CR: "RO" },
  "P3.2b": { LE: "RW", AE: "RO", HE: "RA", CR: "RO" },
  "P3.3": { LE: "RW", AE: "RO", LD: "RO", HE: "RA", CR: "RO" },
  "P4.1A": { LE: "RO", AE: "RW", HE: "RO", CR: "RO" },
  "P4.1B": { LE: "RO", AE: "RW", HE: "RO", CR: "RO" },
  "P4.1C": { LE: "RO", AE: "RW", HE: "RO", CR: "RO" },
  "P4.1D": { LE: "RO", AE: "RW", HE: "RA", CR: "RO" },
  "P4.2A": { LE: "RO", AE: "RW", HE: "RA", CR: "RO" },
  "P4.2B": { LE: "RO", AE: "RW", LD: "RO", HE: "RO", CR: "RO" },
  "P4.2C": { LE: "RO", AE: "RW", LD: "RO", HE: "RA", CR: "RO" },
  "P4.2D": {
    Client: "RO",
    PM: "RO",
    LE: "RW",
    AE: "RO",
    LD: "RO",
    HE: "RA",
    QA: "RO",
    CR: "RO",
  },
  "P5.1A": { PM: "RO", LE: "RW", AE: "RO", HE: "RA", QA: "RO", CR: "RO" },
  "P5.1B": { PM: "RO", LE: "RW", AE: "RO", HE: "RA", QA: "RO", CR: "RO" },
  "P5.2": { LE: "RO", AE: "RW", LD: "RO", HE: "RO", CR: "RO" },
  "P5.3": { LE: "RO", AE: "RW", LD: "RO", HE: "RO", CR: "RO" },
  "P5.3.1": { LE: "RO", AE: "RW", LD: "RO", HE: "RO", CR: "RO" },
  "P5.4": { LE: "RO", AE: "RW", LD: "RO", HE: "RO", CR: "RO" },
  "P5.4.1": { PM: "RO", LE: "RO", AE: "RW", LD: "RO", HE: "RA", CR: "RO" },
  P6: { PM: "RO", LE: "RO", AE: "RW", LD: "RO", HE: "RA", QA: "RO", CR: "RO" },
  // Tier 3 tools, which a Tier 3 project uses in place of or next to the
  // Tier 1 ones.
  "T3.D1.8a": {
    OM: "RO",
    PM: "RO",
    LE: "RA",
    AE: "RW",
    LD: "RO",
    HE: "RO",
    QA: "RO",
    "IT/Admin": "RO",
  },
  "T3.D2.2a": {
    Client: "RO",
    OM: "RW",
    PM: "RA",
    LE: "RO",
    AE: "RO",
    FO: "RO",
    CA: "RO",
    HE: "RO",
    CR: "RO",
  },
  "T3.D4.8a": {
    OM: "RO",
    PM: "RA",
    LE: "RO",
    AE: "RW",
    LD: "RO",
    HE: "RO",
    CR: "RO",
  },
  "DT3.D6.5.0a": {
    PM: "RO",
    LE: "RA",
    AE: "RW",
    LD: "RO",
    HE: "RO",
    QA: "RO",
    CR: "RO",
  },
  "DT3.D6.5.1a": {
    PM: "RO",
    LE: "RA",
    AE: "RW",
    LD: "RO",
    HE: "RO",
    QA: "RO",
    CR: "RO",
  },
  "T3.D6.10a": {
    Client: "RO",
    PM: "RO",
    LE: "RA",
    AE: "RW",
    LD: "RO",
    HE: "RA",
    CR: "RO",
  },
  // PERMISSIONS.md has no rows for these two. Each has the access of the
  // Tier 1 tool it replaces, D1.3 and D1.15.
  "T3.D1.3a": { OM: "RW", PM: "RA", CA: "RO", CR: "RO", "IT/Admin": "RO" },
  "T3.D1.15a": {
    Client: "RO",
    OM: "RO",
    PM: "RA",
    LE: "RW",
    FO: "RO",
    CA: "RO",
    CR: "RO",
    "IT/Admin": "RO",
  },
} satisfies Record<string, Partial<Record<Role, Access>>>

type Row = Partial<Record<Role, Access>>

export function accessRow(
  toolId: string,
  table: Record<string, Row> = permissionMatrix
): Row | undefined {
  return Object.hasOwn(table, toolId) ? table[toolId] : undefined
}

// Who approves (locks) a tool is decided with the tool, not read from RA:
// a tool may name a role that only reads it. The PM approves D1.2 and sends
// D1.4 (its approval), as agreed on the 24 Oct 2026 onboarding call. D1.5 and
// D1.6 have no approver: the OM's own step locks each. See
// docs/WB01_PERMISSIONS/_.md. The PM, as Head of Finance, approves D3.11
// by signing it, though the matrix has them only read it. The HE fills in
// D4.2's conflict check and approves it by signing, and approves D4.3 by
// signing, though the matrix has them only read both.
export const extraApprovers = new Map<string, readonly Role[]>([
  ["D1.2", ["PM"]],
  ["D1.4", ["PM"]],
  ["D3.11", ["PM"]],
  ["D4.2", ["HE"]],
  ["D4.3", ["HE"]],
  ["D4.7", ["PM"]],
])

// Who writes a tool is decided with the tool too. A review that the matrix
// gives no writer is filled in by the role that reviews it: the PM writes,
// signs and submits D2.3 (RA), the FO D2.4 and the HE D2.5, which locks it,
// since nobody else approves it. The PM, as Head of Finance, writes D3.5
// (RA), and its `writers` leaves the FO only reading it. The PM prepares and
// signs D4.5 (RA), and its `writers` leaves the LE only reading it.
export const extraWriters = new Map<string, readonly Role[]>([
  ["D2.3", ["PM"]],
  ["D2.4", ["FO"]],
  ["D2.5", ["HE"]],
  ["D3.5", ["PM"]],
  ["D4.5", ["PM"]],
])

// The roles that fill a tool in: those the matrix gives RW, and those named
// in `extraWriters`, in the order of the role list.
export function writingRoles(toolId: string): Role[] {
  const row = accessRow(toolId) ?? {}
  const extra = extraWriters.get(toolId) ?? []
  const only = tools.getTool(toolId)?.writers

  return roles.filter(
    (role) =>
      (row[role] === "RW" ||
        (row[role] !== undefined && extra.includes(role))) &&
      (!only || only.includes(role))
  )
}

// Roles that may ask for a change to a locked record although they only read
// it. The OM may ask for a change to the client's D1.1; the client makes it.
export const extraChangeRequesters = new Map<string, readonly Role[]>([
  ["D1.1", ["OM"]],
])
