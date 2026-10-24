// What a component may know about a tool definition and a server check.
export type {
  Column,
  Field,
  FieldType,
  TableField,
  Tier,
  ToolDefinition,
} from "@/server/tools/define-tool"

export type { FieldError } from "@/server/records/validate"

// Written by the approval step, never in the form.
export type Signature = { signedBy: string; signedAt: string }

// Each checklist item, answered yes or no.
export type ChecklistValue = Record<string, boolean>

export type CellValue =
  string | number | boolean | null | ChecklistValue | Signature

export type TableRow = Record<string, CellValue>

export type FieldValue = CellValue | TableRow[]

export type FormValues = Record<string, FieldValue>
