import { describe, expect, it } from "vitest"

import { validateRecord } from "@/server/records/validate"
import { createToolRegistry, tools } from "@/server/tools/registry"
import { brokenWorkflowRules } from "@/server/workflow/check"
import { workflowMaps } from "@/server/workflow/workflow"

import { registerAllTools } from "../../index"
import { d11 } from "./d1-1"

registerAllTools(tools)

const SYSTEM_SETS = "Set by the system, so it cannot be chosen"

function file(status: string) {
  return {
    label: "Site plan",
    dateUploaded: "2026-11-03",
    fileLink: "https://files.example.com/site-plan.pdf",
    status,
  }
}

function attachedFiles() {
  const table = d11.fields.find((field) => field.key === "attachedFiles")

  if (table?.type !== "table") {
    throw new Error("D1.1 has no attached files table")
  }

  return table
}

describe("D1.1", () => {
  it("registers with every tool, and the workflow map still finds triageDecision", () => {
    const registry = createToolRegistry()

    expect(() => registerAllTools(registry)).not.toThrow()
    expect(brokenWorkflowRules(workflowMaps, registry.listTools())).toEqual([])
  })

  it("has the request status and the attached files table, and nothing else", () => {
    expect(d11.fields.map((field) => field.key)).toEqual([
      "requestStatus",
      "attachedFiles",
    ])
    expect(d11.fields[0]).toMatchObject({
      type: "select",
      required: true,
      options: ["Pending", "Reviewed", "Approved"],
      systemOptions: ["Approved"],
    })
  })

  it("gives the files table a label, date uploaded, link and status, and no file name or type", () => {
    const table = attachedFiles()

    expect(
      table.columns.map((column) => [column.key, column.label, column.type])
    ).toEqual([
      ["label", "Label", "text"],
      ["dateUploaded", "Date uploaded", "date"],
      ["fileLink", "File link", "fileLink"],
      ["status", "Status", "select"],
    ])
    expect(table.columns[3]).toMatchObject({
      options: ["Pending", "Reviewed", "Approved"],
      systemOptions: ["Approved"],
    })
  })

  it.each(["Pending", "Reviewed"])(
    "accepts %s as the request status",
    (status) => {
      expect(
        validateRecord("D1.1", { requestStatus: status }, { forSubmit: true })
      ).toMatchObject({ ok: true })
    }
  )

  it("refuses Approved for the request, since only the system sets it", () => {
    expect(
      validateRecord(
        "D1.1",
        { requestStatus: "Approved" },
        { forSubmit: false }
      )
    ).toEqual({
      ok: false,
      errors: [{ field: "requestStatus", message: SYSTEM_SETS }],
    })
  })

  it("refuses Approved for a file row, since only the system sets it", () => {
    expect(
      validateRecord(
        "D1.1",
        { attachedFiles: [file("Pending"), file("Approved")] },
        { forSubmit: false }
      )
    ).toEqual({
      ok: false,
      errors: [
        {
          field: "attachedFiles",
          row: 1,
          column: "status",
          message: SYSTEM_SETS,
        },
      ],
    })
  })

  it.each(["Pending", "Reviewed"])(
    "accepts %s on one file row and leaves the other rows as they were",
    (status) => {
      const payload = {
        requestStatus: "Pending",
        attachedFiles: [file("Pending"), file(status), file("Reviewed")],
      }

      const result = validateRecord("D1.1", payload, { forSubmit: true })

      expect(result).toEqual({ ok: true, payload })
      expect(result.ok && result.payload.attachedFiles).toEqual([
        file("Pending"),
        file(status),
        file("Reviewed"),
      ])
    }
  )

  it("refuses a submit with no request status, with Required under the field", () => {
    expect(
      validateRecord(
        "D1.1",
        { attachedFiles: [file("Pending")] },
        { forSubmit: true }
      )
    ).toEqual({
      ok: false,
      errors: [{ field: "requestStatus", message: "Required" }],
    })
  })
})
