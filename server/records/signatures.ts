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

export function isSigned(payload: JsonObject, key: string) {
  return signed.safeParse(payload[key]).success
}

// The signatures the tool collects one after another once submitted, and the
// one that approves it. Undefined for a tool signed any time.
export function turnsOf(toolId: string) {
  return tools.getTool(toolId)?.signInTurn
}

// The signature whose turn it is: the first one signed in turn that is not
// signed yet. Undefined once all are, or for a tool signed any time.
export function nextTurn(
  toolId: string,
  payload: JsonObject
): SignatureField | undefined {
  const key = turnsOf(toolId)?.order.find((each) => !isSigned(payload, each))

  return key === undefined ? undefined : signatureField(toolId, key)
}

// One error for each signature field that is not signed yet. `forApproval`
// leaves out the signatures signed in turn after the approving one, since
// they are signed once it is approved.
export function unsignedFields(
  toolId: string,
  payload: JsonObject,
  options: { forApproval?: boolean; off?: ReadonlySet<string> } = {}
): FieldError[] {
  const turns = turnsOf(toolId)

  const later =
    options.forApproval && turns
      ? turns.order.slice(turns.order.indexOf(turns.approves) + 1)
      : []

  return signatureFields(toolId)
    .filter((field) => !later.includes(field.key))
    .filter((field) => !options.off?.has(field.key))
    .filter((field) => !isSigned(payload, field.key))
    .map((field) => ({ field: field.key, message: "Must be signed" }))
}
