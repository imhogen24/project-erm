import { describe, expect, it } from "vitest"

import { SENT } from "@/server/acknowledgement/acknowledgement"
import { validateRecord } from "@/server/records/validate"
import { tools } from "@/server/tools/registry"

import { registerAllTools } from "../../index"
import { d14 } from "./d1-4"

registerAllTools(tools)

const save = (payload: Parameters<typeof validateRecord>[1]) =>
  validateRecord("D1.4", payload, { forSubmit: false })

describe("D1.4", () => {
  it("has the sheet's fields, with the system ones filled by the system, and saves by itself", () => {
    expect(d14.autosave).toBe(true)
    expect(
      d14.fields.map((field) => [
        field.key,
        field.type,
        field.systemFilled ?? false,
      ])
    ).toEqual([
      ["sentTo", "email", true],
      ["ccBcc", "text", false],
      ["subject", "text", false],
      ["sentBy", "text", true],
      ["dateSent", "date", true],
      ["timeSent", "time", true],
      ["deliveryStatus", "select", true],
      ["body", "longText", false],
    ])
  })

  it("starts the delivery status at the option Send sets, and keeps the workflow's options", () => {
    const status = d14.fields.find((field) => field.key === "deliveryStatus")

    expect(status?.type === "select" && status.options).toEqual([
      SENT,
      "Delivered",
      "Bounced",
    ])
  })

  it.each([
    ["sentTo", "client@example.com"],
    ["sentBy", "noreply@admin.imhogen.com"],
    ["dateSent", "2026-11-09"],
    ["timeSent", "10:00"],
    ["deliveryStatus", "Delivered"],
  ])("refuses a value typed into %s, which the system fills", (key, value) => {
    expect(save({ [key]: value }).ok).toBe(false)
  })

  it("saves a half-written draft, and needs a subject and text to be complete", () => {
    expect(save({ body: "Dear Kwaku," }).ok).toBe(true)
    expect(
      validateRecord("D1.4", { ccBcc: "a@b.com" }, { forSubmit: true }).ok
    ).toBe(false)
  })
})
