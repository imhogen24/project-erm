import { describe, expect, it } from "vitest"
import { z } from "zod"

import type { JsonObject } from "@/db/schema"
import schemaJson from "@/docs/dev_docs/WORKBOOK_01/01_project_onboarding_schema.json"
import { validateRecord } from "@/server/records/validate"
import { createToolRegistry, tools } from "@/server/tools/registry"
import { brokenWorkflowRules } from "@/server/workflow/check"
import { workflowMaps } from "@/server/workflow/workflow"

import { registerAllTools } from "../../index"
import { d12 } from "./d1-2"

registerAllTools(tools)

const checks = [
  "Is the notification readable and free of malicious links?",
  "Does the request broadly align with IMHOGEN's services?",
  "Is the contact information apparently valid and legible?",
]

const PROCEED = "Proceed to D1.3"

const SPAM = "Reject as Spam"

// Read live from the saved website request, never typed by the OM.
const metadata = [
  "notificationSource",
  "dateReceived",
  "timeReceived",
  "senderEmail",
  "recipientEmail",
  "subjectLine",
]

// One answered row per check, in order. A status left out of `statuses` is
// Pass.
function checklist(statuses: string[] = []) {
  return checks.map((check, index) => ({
    check,
    status: statuses[index] ?? "Pass",
    reviewerNotes: "Checked against the request",
  }))
}

function triage(decision: string, statuses: string[] = []) {
  return { triageChecklist: checklist(statuses), triageDecision: decision }
}

function submit(payload: JsonObject) {
  return validateRecord("D1.2", payload, { forSubmit: true })
}

function save(payload: JsonObject) {
  return validateRecord("D1.2", payload, { forSubmit: false })
}

function table(key: string) {
  const field = d12.fields.find((entry) => entry.key === key)

  if (field?.type !== "table") {
    throw new Error(`D1.2 has no ${key} table`)
  }

  return field
}

describe("D1.2", () => {
  it("registers with every tool, and the workflow map still finds triageDecision and its two options", () => {
    const registry = createToolRegistry()

    expect(() => registerAllTools(registry)).not.toThrow()
    expect(brokenWorkflowRules(workflowMaps, registry.listTools())).toEqual([])
    expect(
      d12.fields.find((field) => field.key === "triageDecision")
    ).toMatchObject({
      type: "select",
      required: true,
      options: [PROCEED, SPAM],
    })
  })

  it("has the metadata, the files table, the checklist and the decision, in that order", () => {
    expect(d12.fields.map((field) => field.key)).toEqual([
      ...metadata,
      "digitalRecords",
      "triageChecklist",
      "triageDecision",
    ])
  })

  it("has exactly the three fixed checks, in order, each with a status and a reviewer note", () => {
    const checklistTable = table("triageChecklist")

    expect(checklistTable.prefilledRows).toEqual(checks)
    expect(
      checklistTable.columns.map((column) => [
        column.key,
        column.label,
        column.type,
      ])
    ).toEqual([
      ["check", "Check", "text"],
      ["status", "Status (Pass / Fail)", "select"],
      ["reviewerNotes", "Reviewer Notes", "longText"],
    ])
    expect(checklistTable.columns[1]).toMatchObject({
      options: ["Pass", "Fail"],
      required: true,
    })
    expect(checklistTable.columns[2]).toMatchObject({ required: true })
  })

  it("stores only the OM's file name or description for each D1.1 file", () => {
    expect(
      table("digitalRecords").columns.map((column) => [
        column.key,
        column.label,
        column.type,
      ])
    ).toEqual([["fileName", "File Name / Description", "text"]])
  })

  describe("the fixed checks", () => {
    it("refuses a save that adds a check", () => {
      const added = [
        ...checklist(),
        { check: "Is it urgent?", status: "Pass", reviewerNotes: "Yes" },
      ]

      expect(save({ triageChecklist: added })).toEqual({
        ok: false,
        errors: [
          {
            field: "triageChecklist",
            message: `Must keep its 3 fixed rows: ${checks.join(", ")}`,
          },
        ],
      })
    })

    it("refuses a save that removes a check", () => {
      expect(save({ triageChecklist: checklist().slice(0, 2) })).toEqual({
        ok: false,
        errors: [
          {
            field: "triageChecklist",
            message: `Must keep its 3 fixed rows: ${checks.join(", ")}`,
          },
        ],
      })
    })

    it("refuses a save that renames a check", () => {
      const renamed = checklist().map((row, index) =>
        index === 1 ? { ...row, check: "Is it in scope?" } : row
      )

      expect(save({ triageChecklist: renamed })).toEqual({
        ok: false,
        errors: [
          {
            field: "triageChecklist",
            row: 1,
            column: "check",
            message: `Must stay "${checks[1]}"`,
          },
        ],
      })
    })
  })

  describe("required answers", () => {
    it.each([
      ["no status", "status"],
      ["no reviewer note", "reviewerNotes"],
    ])(
      "refuses a submit with a check that has %s, with Required under that check",
      (_, column) => {
        const rows = checklist().map((row, index) =>
          index === 2
            ? Object.fromEntries(
                Object.entries(row).filter(([key]) => key !== column)
              )
            : row
        )

        expect(
          submit({ triageChecklist: rows, triageDecision: PROCEED })
        ).toEqual({
          ok: false,
          errors: [
            { field: "triageChecklist", row: 2, column, message: "Required" },
          ],
        })
      }
    )

    it("refuses a blank reviewer note on a Pass", () => {
      const rows = checklist().map((row, index) =>
        index === 0 ? { ...row, reviewerNotes: "  " } : row
      )

      expect(
        submit({ triageChecklist: rows, triageDecision: PROCEED })
      ).toEqual({
        ok: false,
        errors: [
          {
            field: "triageChecklist",
            row: 0,
            column: "reviewerNotes",
            message: "Required",
          },
        ],
      })
    })

    it("lets a draft be saved with checks still unanswered", () => {
      const rows = checks.map((check) => ({ check }))

      expect(save({ triageChecklist: rows })).toMatchObject({ ok: true })
    })

    it("refuses a submit with no checklist or decision", () => {
      expect(submit({})).toEqual({
        ok: false,
        errors: [
          { field: "triageChecklist", message: "Required" },
          { field: "triageDecision", message: "Required" },
        ],
      })
    })
  })

  describe("the Proceed rule", () => {
    it("accepts Proceed when every check is Pass with a note", () => {
      expect(submit(triage(PROCEED))).toMatchObject({ ok: true })
    })

    it.each([
      ["submit", true],
      ["draft save", false],
    ])(
      "refuses Proceed on a %s while a check is Fail, naming the failed check",
      (_, forSubmit) => {
        expect(
          validateRecord("D1.2", triage(PROCEED, ["Pass", "Fail", "Pass"]), {
            forSubmit,
          })
        ).toEqual({
          ok: false,
          errors: [
            {
              field: "triageDecision",
              message: `Cannot proceed while a check is Fail: "${checks[1]}"`,
            },
          ],
        })
      }
    )

    it("names every failed check", () => {
      expect(submit(triage(PROCEED, ["Fail", "Pass", "Fail"]))).toEqual({
        ok: false,
        errors: [
          {
            field: "triageDecision",
            message: `Cannot proceed while a check is Fail: "${checks[0]}", "${checks[2]}"`,
          },
        ],
      })
    })

    it("accepts Proceed once the Fail is changed to Pass", () => {
      expect(submit(triage(PROCEED, ["Pass", "Fail"]))).toMatchObject({
        ok: false,
      })
      expect(submit(triage(PROCEED, ["Pass", "Pass"]))).toMatchObject({
        ok: true,
      })
    })

    it.each([
      [["Pass", "Pass", "Pass"]],
      [["Fail", "Pass", "Pass"]],
      [["Fail", "Fail", "Fail"]],
    ])("always accepts Reject as Spam, with checks %j", (statuses) => {
      expect(submit(triage(SPAM, statuses))).toMatchObject({ ok: true })
    })

    it("asks no reason for Reject as Spam, and has no field for one", () => {
      expect(submit(triage(SPAM, ["Fail"]))).toMatchObject({ ok: true })
      expect(
        submit({ ...triage(SPAM, ["Fail"]), rejectionReason: "Spam" })
      ).toEqual({
        ok: false,
        errors: [
          { field: "rejectionReason", message: "Not a field of this tool" },
        ],
      })
    })
  })

  describe("the metadata", () => {
    it.each(metadata)("marks %s as filled by the system", (key) => {
      expect(d12.fields.find((field) => field.key === key)).toMatchObject({
        systemFilled: true,
        required: false,
      })
    })

    it("refuses a metadata value written by the form", () => {
      expect(
        save({ ...triage(PROCEED), senderEmail: "client@example.com" })
      ).toEqual({
        ok: false,
        errors: [
          {
            field: "senderEmail",
            message: "Filled in by the system, so it cannot be written",
          },
        ],
      })
    })
  })

  it("is one tool for Tier 1 and Tier 3, which no variant replaces", () => {
    expect(d12.tier).toBe("both")
    expect(
      tools.listTools().filter((tool) => tool.replaces === "D1.2")
    ).toEqual([])
  })
})

// The workbook schema, as far as a field definition needs it.
const schemaFile = z.object({
  tools: z.array(
    z.object({
      tool_id: z.string(),
      sections: z.array(
        z.object({
          fields: z.array(
            z.object({
              name: z.string(),
              label: z.string(),
              type: z.string(),
              options: z.array(z.string()).optional(),
              required: z.boolean().default(false),
            })
          ),
        })
      ),
    })
  ),
})

// A schema checklist with a status and a notes column is a table whose rows
// are its items.
const definitionTypes = new Map([
  ["string", "text"],
  ["text", "longText"],
  ["enum", "select"],
  ["file_link", "fileLink"],
  ["static_list", "staticList"],
  ["checklist", "table"],
])

function camelCase(name: string) {
  return name.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase())
}

describe("D1.2 against the workbook schema", () => {
  it("has every schema field with the same label, type, options and required flag, apart from the system-filled metadata", () => {
    const tool = schemaFile
      .parse(schemaJson)
      .tools.find((entry) => entry.tool_id === "D1.2")

    const expected = (tool?.sections ?? [])
      .flatMap((section) => section.fields)
      .map((field) => {
        const key = camelCase(field.name)

        return [
          key,
          field.label,
          definitionTypes.get(field.type) ?? field.type,
          field.options,
          metadata.includes(key) ? false : field.required,
        ]
      })

    expect(
      d12.fields.map((field) => [
        field.key,
        field.label,
        field.type,
        field.type === "select" ? field.options : undefined,
        field.required,
      ])
    ).toEqual(expected)
  })
})
