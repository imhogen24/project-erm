import { z } from "zod"

import type { JsonObject } from "@/db/schema"
import type { SignatureField } from "@/server/tools/define-tool"
import { tools } from "@/server/tools/registry"

import type { FieldError } from "./validate"

// What signing writes into a signature field: the person and an ISO time.
const signed = z.object({ signedBy: z.string(), signedAt: z.string() })

// The tool's signature fields. A signature in a table column is not signed
// field by field, so it is not one of these.
export function signatureFields(toolId: string): SignatureField[] {
  return (tools.getTool(toolId)?.fields ?? []).filter(
    (field): field is SignatureField => field.type === "signature"
  )
}

export function signatureField(
  toolId: string,
  key: string
): SignatureField | undefined {
  return signatureFields(toolId).find((field) => field.key === key)
}

// The signatures the payload holds.
export function signaturesOf(toolId: string, payload: JsonObject): JsonObject {
  const keys = new Set(signatureFields(toolId).map((field) => field.key))

  return Object.fromEntries(
    Object.entries(payload).filter(([key]) => keys.has(key))
  )
}

// The payload without its signatures, as a person may write it.
export function withoutSignatures(
  toolId: string,
  payload: JsonObject
): JsonObject {
  const keys = new Set(signatureFields(toolId).map((field) => field.key))

  return Object.fromEntries(
    Object.entries(payload).filter(([key]) => !keys.has(key))
  )
}

// One error for each signature field that is not signed yet.
export function unsignedFields(
  toolId: string,
  payload: JsonObject
): FieldError[] {
  return signatureFields(toolId)
    .filter((field) => !signed.safeParse(payload[field.key]).success)
    .map((field) => ({ field: field.key, message: "Must be signed" }))
}
