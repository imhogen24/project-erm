import { describe, expect, it } from "vitest"

import {
  fieldFills,
  fillFields,
  fillText,
  placeholdersIn,
} from "./placeholders"

describe("placeholders", () => {
  it("finds each bracketed name", () => {
    expect(placeholdersIn("Pay [Total GHS]: [X]% upon execution")).toEqual([
      "Total GHS",
      "X",
    ])
  })

  it("fills the names it has a value for and keeps the rest", () => {
    expect(
      fillText("[Client Name] pays [Total GHS], [X]% now", {
        "Client Name": "Asante Mills",
        X: " ",
      })
    ).toBe("Asante Mills pays [Total GHS], [X]% now")
    expect(fillText("[constructor] [toString]", {})).toBe(
      "[constructor] [toString]"
    )
  })

  it("reads the names filled from the record's own fields", () => {
    const fills = { "Client Name": "system", X: { field: "share" } } as const

    const values = new Map<string, number | boolean>([
      ["share", 40],
      ["done", true],
    ])

    expect(fillFields(fills)).toEqual(["share"])
    expect(fieldFills(fills, (field) => values.get(field))).toEqual({
      X: "40",
    })
    expect(
      fieldFills({ X: { field: "done" } }, (field) => values.get(field))
    ).toEqual({})
  })
})
