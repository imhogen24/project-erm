import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import { roles } from "@/db/schema"

import { accessRow, permissionMatrix } from "./matrix"

// The rows of the matrix in PERMISSIONS.md, keyed by tool ID. Its columns are
// the 19 roles in the order of the role list, and "-" or an empty cell is no
// access.
function documentedRows() {
  const document = readFileSync(
    join(process.cwd(), "docs/dev_docs/CRITICAL_DATA_STRUCTURE/PERMISSIONS.md"),
    "utf8"
  )

  const rows: Record<string, Record<string, string>> = {}

  for (const line of document.split(/\r?\n/)) {
    const cells = line.split("|").map((cell) => cell.trim())

    // "| ID | Name | 19 roles |" splits into an empty first and last cell.
    if (cells.length !== roles.length + 4 || !/^D?T3\./.test(cells[1]!)) {
      continue
    }

    const row: Record<string, string> = {}

    roles.forEach((role, index) => {
      const access = cells[index + 3]!

      if (access !== "-" && access !== "") {
        row[role] = access
      }
    })

    rows[cells[1]!] = row
  }

  return rows
}

const tier3Tools = [
  "T3.D1.8a",
  "T3.D2.2a",
  "T3.D4.8a",
  "DT3.D6.5.0a",
  "DT3.D6.5.1a",
  "T3.D6.10a",
]

describe("permission matrix", () => {
  it("has a row for every tool in phases 1 to 5", () => {
    const toolIds = Object.keys(permissionMatrix)

    for (const prefix of ["D1.", "D2.", "D3.", "D4.", "P5."]) {
      expect(toolIds.some((id) => id.startsWith(prefix))).toBe(true)
    }

    expect(toolIds).toContain("D1.8")
    expect(toolIds).toContain("D2")
  })

  it("only uses the 19 known roles and the three access levels", () => {
    for (const row of Object.values(permissionMatrix)) {
      for (const [role, access] of Object.entries(row)) {
        expect(roles.some((known) => known === role)).toBe(true)
        expect(["RW", "RO", "RA"]).toContain(access)
      }
    }
  })

  it("finds every Tier 3 row in PERMISSIONS.md", () => {
    expect(Object.keys(documentedRows()).sort()).toEqual([...tier3Tools].sort())
  })

  it.each(tier3Tools)("gives %s exactly the access in PERMISSIONS.md", (id) => {
    expect(accessRow(id)).toEqual(documentedRows()[id])
  })

  it("gives T3.D1.3a the access of D1.3, which it replaces", () => {
    expect(accessRow("T3.D1.3a")).toEqual(permissionMatrix["D1.3"])
  })

  it("gives T3.D1.15a the access of D1.15, which it replaces", () => {
    expect(accessRow("T3.D1.15a")).toEqual(permissionMatrix["D1.15"])
  })

  it("gives T3.D1.8a exactly the access agreed for Tier 3 drafting", () => {
    expect(accessRow("T3.D1.8a")).toEqual({
      OM: "RO",
      PM: "RO",
      LE: "RA",
      AE: "RW",
      LD: "RO",
      HE: "RO",
      QA: "RO",
      CR: "RO",
    })
  })

  it("gives D1.8 exactly the access agreed for the needs assessment", () => {
    expect(permissionMatrix["D1.8"]).toEqual({
      Client: "RO",
      OM: "RO",
      PM: "RA",
      LE: "RW",
      CR: "RO",
    })
  })

  it("gives D2.4 exactly the access agreed for the finance review", () => {
    expect(permissionMatrix["D2.4"]).toEqual({
      PM: "RO",
      FO: "RA",
      CA: "RO",
      CR: "RO",
    })
  })

  it("lets the Project Manager approve the executed contract, D2.12", () => {
    expect(permissionMatrix["D2.12"]).toEqual({
      Client: "RO",
      PM: "RA",
      FO: "RO",
      CA: "RW",
      HE: "RO",
      CR: "RO",
    })
  })
})
