import type { JsonObject } from "@/db/schema"

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

export function validateRecord(
  toolId: string,
  payload: JsonObject,
  options: { forSubmit: boolean }
): Validation {
  void toolId
  void options

  return { ok: true, payload }
}
