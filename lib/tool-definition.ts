// What a component may know about a tool definition and a server check.
export type { Field, ToolDefinition } from "@/server/tools/define-tool"

export type { FieldError } from "@/server/records/validate"

export type FieldValue = string | number | boolean | null

export type FormValues = Record<string, FieldValue>
