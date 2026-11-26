import { describe, expect, test } from "vitest"

import { allTools } from "@/workbooks"

import { columnWidths, kindOf, widthsOf } from "./column-widths"

function tableOf(toolId: string, key: string) {
  const field = allTools
    .find((tool) => tool.id === toolId)
    ?.fields.find((each) => each.key === key)

  if (field?.type !== "table") {
    throw new Error(`${toolId} has no table ${key}`)
  }

  return field
}

describe("column widths", () => {
  test("D2.1's clauses: SN narrow, the clause text widest", () => {
    const clauses = tableOf("D2.1", "clauses")

    expect(clauses.columns.map(kindOf)).toEqual([
      "serial",
      "text",
      "long",
      "standard",
    ])
    expect(columnWidths(clauses.columns)).toBe(
      "min(5rem,10%) minmax(min(5rem,10%),1.5fr) minmax(min(6rem,12%),2.5fr) minmax(min(8.5rem,16%),1fr)"
    )
  })

  test("a column named SN is a serial number even when the app does not number it", () => {
    const category = tableOf("D2.1", "clauses").columns[1]!

    expect(kindOf({ ...category, key: "sn", label: "SN" })).toBe("serial")
  })

  test("short answers take less room than a choice", () => {
    const percentage = allTools
      .flatMap((tool) => tool.fields)
      .flatMap((field) => (field.type === "table" ? field.columns : []))
      .find((column) => column.type === "percentage")

    expect(percentage && kindOf(percentage)).toBe("short")
    expect(widthsOf(["serial", "short", "action"])).toBe(
      "min(5rem,10%) minmax(min(4rem,8%),0.75fr) 3.5rem"
    )
  })

  test("a text column the app fills with long values is as wide as long text", () => {
    const vault = tableOf("D2.13", "vault")

    const naming = vault.columns.findIndex(
      (column) => column.type === "text" && !column.numbered
    )

    expect(columnWidths(vault.columns, vault.fixedRows).split(" ")).toContain(
      "minmax(min(6rem,12%),2.5fr)"
    )
    expect(naming).toBeGreaterThan(0)
  })
})
