import { describe, expect, it } from "vitest"

import type { JsonObject } from "@/db/schema"
import { validateRecord } from "@/server/records/validate"
import { tools } from "@/server/tools/registry"

import { registerAllTools } from "../../index"
import { qualityGateQuestions, t3d13a } from "./t3-d1-3a"

registerAllTools(tools)

const id = "T3.D1.3a"

const submit = (payload: JsonObject) =>
  validateRecord(id, payload, { forSubmit: true })

const save = (payload: JsonObject) =>
  validateRecord(id, payload, { forSubmit: false })

const gate = qualityGateQuestions.map((question) => ({
  question,
  answer: "Yes",
}))

const valid = {
  sourceAssets: [{ assetType: "Paper drawing" }],
  draftingSpecs: [{ requirement: "3D Modelling", toleranceClass: "General" }],
  qualityGate: gate,
}

describe("T3.D1.3a", () => {
  it("has the three tables, in order, for Tier 3 in place of D1.3", () => {
    expect(t3d13a.fields.map((field) => field.key)).toEqual([
      "sourceAssets",
      "draftingSpecs",
      "qualityGate",
    ])
    expect(t3d13a).toMatchObject({ tier: 3, replaces: "D1.3" })
    expect(
      t3d13a.fields.every(
        (field) => field.type === "table" && field.required !== undefined
      )
    ).toBe(true)
  })

  it("accepts a filled record", () => {
    expect(submit(valid).ok).toBe(true)
  })

  it("refuses submit without an Asset Type, a Tolerance Class or a gate answer", () => {
    expect(submit({ ...valid, sourceAssets: [{}] }).ok).toBe(false)
    expect(
      submit({ ...valid, draftingSpecs: [{ requirement: "3D Modelling" }] }).ok
    ).toBe(false)
    expect(
      submit({
        ...valid,
        qualityGate: [{ question: qualityGateQuestions[0], answer: "Yes" }],
      }).ok
    ).toBe(false)
    expect(submit({ ...valid, draftingSpecs: [] }).ok).toBe(false)
  })

  it("refuses a tolerance class that is not offered", () => {
    expect(
      save({
        ...valid,
        draftingSpecs: [{ requirement: "x", toleranceClass: "Loose" }],
      }).ok
    ).toBe(false)
  })

  it("saves a half-filled record as a draft", () => {
    expect(save({ sourceAssets: [{}] }).ok).toBe(true)
  })
})
