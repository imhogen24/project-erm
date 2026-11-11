import { describe, expect, it } from "vitest"

import { validateRecord } from "@/server/records/validate"
import { createToolRegistry, tools } from "@/server/tools/registry"
import { brokenWorkflowRules } from "@/server/workflow/check"
import { workflowMaps } from "@/server/workflow/workflow"

import { registerAllTools } from "../../index"
import { d11 } from "./d1-1"

registerAllTools(tools)

const siteplan = {
  label: "Site plan",
  dateUploaded: "2026-11-03",
  fileLink: "https://files.example.com/site-plan.pdf",
}

function attachedFiles() {
  const table = d11.fields.find((field) => field.key === "attachedFiles")

  if (table?.type !== "table") {
    throw new Error("D1.1 has no attached files table")
  }

  return table
}

// D1.1 is the client's web form. Its answers live in the saved request; the
// record holds only the files the client attached.
describe("D1.1", () => {
  it("registers with every tool, and the workflow map still finds triageDecision", () => {
    const registry = createToolRegistry()

    expect(() => registerAllTools(registry)).not.toThrow()
    expect(brokenWorkflowRules(workflowMaps, registry.listTools())).toEqual([])
  })

  it("has the attached files table and nothing else", () => {
    expect(d11.fields.map((field) => field.key)).toEqual(["attachedFiles"])
  })

  it("gives the files table a label, date uploaded and link, and no status", () => {
    expect(
      attachedFiles().columns.map((column) => [
        column.key,
        column.label,
        column.type,
      ])
    ).toEqual([
      ["label", "Label", "text"],
      ["dateUploaded", "Date uploaded", "date"],
      ["fileLink", "File link", "fileLink"],
    ])
  })

  it("shows the files table but never lets the form edit it", () => {
    expect(attachedFiles().readOnly).toBe(true)
  })

  it("accepts the files as the intake writes them", () => {
    expect(
      validateRecord("D1.1", { attachedFiles: [siteplan] }, { forSubmit: true })
    ).toMatchObject({ ok: true })
  })

  it("accepts a request with no files, since attaching them is optional", () => {
    expect(
      validateRecord("D1.1", { attachedFiles: [] }, { forSubmit: true })
    ).toMatchObject({ ok: true })
  })

  it("refuses a status on a file row, which D1.1 no longer has", () => {
    expect(
      validateRecord(
        "D1.1",
        { attachedFiles: [{ ...siteplan, status: "Pending" }] },
        { forSubmit: true }
      )
    ).toMatchObject({ ok: false })
  })
})
