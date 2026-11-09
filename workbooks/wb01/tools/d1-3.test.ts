import { describe, expect, it } from "vitest"

import type { JsonObject } from "@/db/schema"
import { validateRecord } from "@/server/records/validate"
import { tools } from "@/server/tools/registry"

import { registerAllTools } from "../../index"
import { d13 } from "./d1-3"

registerAllTools(tools)

function table(key: string) {
  const field = d13.fields.find((entry) => entry.key === key)

  if (field?.type !== "table") {
    throw new Error(`D1.3 has no ${key} table`)
  }

  return field
}

const objectives: JsonObject[] = [
  { item: "Primary Purpose / Business Goal", description: "Reverse engineer" },
  { item: "Main Deliverables Requested", description: "Drawings" },
  { item: "Specific Constraints Noted" },
]

const submit = (payload: JsonObject) =>
  validateRecord("D1.3", payload, { forSubmit: true })

const save = (payload: JsonObject) =>
  validateRecord("D1.3", payload, { forSubmit: false })

describe("D1.3", () => {
  it("has the four tables, in order, with their rows and columns", () => {
    expect(d13.fields.map((field) => field.key)).toEqual([
      "coreObjectives",
      "operands",
      "operators",
      "missingInformation",
    ])
    expect(table("coreObjectives").lockedRows).toHaveLength(3)
    expect(table("operands").prefilledRows).toEqual(["M", "E", "I", "L"])
    expect(table("operators").prefilledRows).toHaveLength(5)
    expect(table("missingInformation").prefilledRows).toBeUndefined()
    expect(table("missingInformation").columns.map((c) => c.key)).toEqual([
      "item",
      "assignee",
      "status",
    ])
    expect(d13.tier).toBe(1)
  })

  it("has no client or project metadata field", () => {
    expect(d13.fields.map((field) => field.key)).not.toContain("clientName")
  })

  it("accepts the three locked rows and a row the OM added", () => {
    expect(
      submit({
        coreObjectives: [...objectives, { item: "Extra", description: "x" }],
      }).ok
    ).toBe(true)
  })

  it("refuses a locked row that was renamed or removed", () => {
    const renamed = [
      { ...objectives[0], item: "Other" },
      ...objectives.slice(1),
    ]

    expect(save({ coreObjectives: renamed }).ok).toBe(false)
    expect(save({ coreObjectives: objectives.slice(1) }).ok).toBe(false)
  })

  it("needs the description of the first two defaults, not the third", () => {
    const result = submit({
      coreObjectives: [
        { item: "Primary Purpose / Business Goal" },
        objectives[1],
        objectives[2],
      ],
    })

    expect(result).toMatchObject({
      ok: false,
      errors: [{ field: "coreObjectives", row: 0, column: "description" }],
    })
  })

  it("saves an empty record as a draft", () => {
    expect(save({}).ok).toBe(true)
  })
})
