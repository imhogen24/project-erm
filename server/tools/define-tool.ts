import { z } from "zod"

const fieldKey = z
  .string()
  .regex(/^[a-z][A-Za-z0-9]*$/, "A field key is a camelCase name")

const inheritedLink = z.object({
  tool: z.string().min(1),
  field: z.string().min(1),
})

const fieldBase = {
  key: fieldKey,
  label: z.string().min(1),
  required: z.boolean().default(false),
  inherited: inheritedLink.optional(),
}

const field = z
  .discriminatedUnion("type", [
    z.object({
      ...fieldBase,
      type: z.enum(["text", "longText", "number", "date", "boolean"]),
    }),
    z.object({
      ...fieldBase,
      type: z.literal("select"),
      options: z.array(z.string().min(1)).min(1),
    }),
  ])
  .refine((value) => !(value.inherited && value.required), {
    message:
      "An inherited field is filled in by the system, so it is never required",
  })

const toolDefinition = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    workbook: z.string().min(1),
    fields: z.array(field).min(1),
  })
  .refine(
    (value) =>
      new Set(value.fields.map((entry) => entry.key)).size ===
      value.fields.length,
    { message: "Two fields cannot share a key" }
  )

export type ToolInput = z.input<typeof toolDefinition>

export type ToolDefinition = z.output<typeof toolDefinition>

export type Field = ToolDefinition["fields"][number]

export type FieldType = Field["type"]

export function defineTool(input: ToolInput): ToolDefinition {
  return toolDefinition.parse(input)
}
