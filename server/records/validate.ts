import { z } from "zod"

import type { JsonObject } from "@/db/schema"
import type { Field } from "@/server/tools/define-tool"
import { tools } from "@/server/tools/registry"

export type FieldError = { field: string; message: string }

export type Validation =
  { ok: true; payload: JsonObject } | { ok: false; errors: FieldError[] }

export class UnknownToolError extends Error {}

export class ValidationError extends Error {
  readonly errors: FieldError[]

  constructor(errors: FieldError[]) {
    super(errors.map((error) => `${error.field}: ${error.message}`).join("; "))
    this.errors = errors
  }
}

function valueSchema(field: Field) {
  switch (field.type) {
    case "text":
    case "longText":
      return z.string({ error: "Must be text" })
    case "number":
      return z.number({ error: "Must be a number" })
    case "date":
      return z.iso.date({ error: "Must be a date (YYYY-MM-DD)" })
    case "boolean":
      return z.boolean({ error: "Must be yes or no" })
    case "select":
      return z.enum(field.options, {
        error: `Must be one of: ${field.options.join(", ")}`,
      })
  }
}

// Every field is optional here. Whether a required field is filled is checked
// separately, and only at submit.
function payloadSchema(fields: Field[]) {
  const fieldSchemas: Record<string, z.ZodType> = {}

  for (const field of fields) {
    fieldSchemas[field.key] = field.inherited
      ? z
          .never({ error: "Filled in by the system, so it cannot be written" })
          .optional()
      : valueSchema(field).optional()
  }

  return z.strictObject(fieldSchemas)
}

const blank = z.union([z.undefined(), z.null(), z.string().trim().length(0)])

// Checks `payload` against the tool's definition and returns every problem
// together. Types, options, and unknown or inherited fields are checked on
// every write. Required fields are checked only when `forSubmit` is set, so a
// draft can be saved incomplete.
export function validateRecord(
  toolId: string,
  payload: JsonObject,
  options: { forSubmit: boolean }
): Validation {
  const tool = tools.getTool(toolId)

  if (!tool) {
    throw new UnknownToolError(`${toolId} has no tool definition`)
  }

  const errors: FieldError[] = []
  const result = payloadSchema(tool.fields).safeParse(payload)

  if (!result.success) {
    for (const issue of result.error.issues) {
      if (issue.code === "unrecognized_keys") {
        for (const key of issue.keys) {
          errors.push({ field: key, message: "Not a field of this tool" })
        }
      } else {
        errors.push({ field: String(issue.path[0]), message: issue.message })
      }
    }
  }

  if (options.forSubmit) {
    for (const field of tool.fields) {
      const alreadyWrong = errors.some((error) => error.field === field.key)

      if (
        field.required &&
        !alreadyWrong &&
        blank.safeParse(payload[field.key]).success
      ) {
        errors.push({ field: field.key, message: "Required" })
      }
    }
  }

  return errors.length === 0 ? { ok: true, payload } : { ok: false, errors }
}

export function assertValid(
  toolId: string,
  payload: JsonObject,
  options: { forSubmit: boolean }
): JsonObject {
  const validation = validateRecord(toolId, payload, options)

  if (!validation.ok) {
    throw new ValidationError(validation.errors)
  }

  return validation.payload
}
