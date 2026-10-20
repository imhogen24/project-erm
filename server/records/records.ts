import type { Database } from "@/db"

export const recordStates = [
  "draft",
  "submitted",
  "approved",
  "locked",
] as const

export type RecordState = (typeof recordStates)[number]

export type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }

export type JsonObject = { [key: string]: JsonValue }

export type ToolRecord = {
  id: string
  projectId: string
  toolId: string
  state: RecordState
  payload: JsonObject
}

export class InvalidTransitionError extends Error {}

export class RecordNotEditableError extends Error {}

type NewRecord = {
  projectId: string
  toolId: string
  payload?: JsonObject
}

export async function createRecord(
  _database: Database,
  _input: NewRecord
): Promise<ToolRecord> {
  throw new Error("not implemented")
}

export async function transitionRecord(
  _database: Database,
  _recordId: string,
  _to: RecordState
): Promise<ToolRecord> {
  throw new Error("not implemented")
}

export async function updateRecord(
  _database: Database,
  _recordId: string,
  _payload: JsonObject
): Promise<ToolRecord> {
  throw new Error("not implemented")
}

export async function getRecord(
  _database: Database,
  _recordId: string
): Promise<ToolRecord> {
  throw new Error("not implemented")
}
