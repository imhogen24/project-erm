import { describe, expect, it } from "vitest"

import { roles } from "@/db/schema"

import { permissionMatrix } from "./matrix"

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

  it("has no Tier 3 rows", () => {
    expect(
      Object.keys(permissionMatrix).some((id) => id.startsWith("T3."))
    ).toBe(false)
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
