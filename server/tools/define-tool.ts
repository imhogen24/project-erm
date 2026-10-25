import { z } from "zod"

import { roles } from "@/db/schema"

const fieldKey = z
  .string()
  .regex(/^[a-z][A-Za-z0-9]*$/, "A field key is a camelCase name")

// `column` is set when the value comes from one column of a table field.
const inheritedLink = z.object({
  tool: z.string().min(1),
  field: z.string().min(1),
  column: z.string().min(1).optional(),
})

const cellBase = {
  key: fieldKey,
  label: z.string().min(1),
  inherited: inheritedLink.optional(),
}

const distinctTexts = z
  .array(z.string().min(1))
  .min(1)
  .refine((value) => new Set(value).size === value.length, {
    message: "Two entries cannot be the same",
  })

// The types a field and a table cell share.
const plain = z.object({
  ...cellBase,
  type: z.enum([
    "text",
    "longText",
    "number",
    "date",
    "boolean",
    "currency",
    "percentage",
    "email",
    "time",
    "fileLink",
  ]),
})

// Records who signed and when. It is written only by signing, never in the
// form. `signedBy` names the roles that may sign it; the registry refuses a
// signature field that names none.
const signature = z.object({
  ...cellBase,
  type: z.literal("signature"),
  signedBy: z.array(z.enum(roles)).min(1).optional(),
})

const select = z.object({
  ...cellBase,
  type: z.literal("select"),
  options: z.array(z.string().min(1)).min(1),
})

// Each item is answered yes or no.
const checklist = z.object({
  ...cellBase,
  type: z.literal("checklist"),
  items: distinctTexts,
})

// Read-only text shown in the form. It is never stored.
const instruction = z.object({
  ...cellBase,
  type: z.literal("instruction"),
  content: z.string().min(1),
})

// A read-only list shown in the form. It is never stored.
const staticList = z.object({
  ...cellBase,
  type: z.literal("staticList"),
  items: distinctTexts,
})

const column = z.discriminatedUnion("type", [
  plain,
  signature,
  select,
  checklist,
  instruction,
  staticList,
])

type Column = z.output<typeof column>

const required = { required: z.boolean().default(false) }

// `prefilledRows` are fixed labels for the first column: the table always has
// exactly these rows, in this order. `subtotal` names a currency column to add
// up.
const table = z
  .object({
    ...cellBase,
    ...required,
    type: z.literal("table"),
    columns: z.array(column).min(1),
    prefilledRows: distinctTexts.optional(),
    subtotal: fieldKey.optional(),
  })
  .superRefine((value, context) => {
    const keys = value.columns.map((entry) => entry.key)

    if (new Set(keys).size !== keys.length) {
      context.addIssue({
        code: "custom",
        path: ["columns"],
        message: "Two columns cannot share a key",
      })
    }

    if (value.subtotal !== undefined) {
      const totalled = value.columns.find(
        (entry) => entry.key === value.subtotal
      )

      if (totalled?.type !== "currency") {
        context.addIssue({
          code: "custom",
          path: ["subtotal"],
          message: "A subtotal adds up a currency column of the table",
        })
      }
    }

    if (
      value.prefilledRows &&
      !holdsLabels(value.columns[0], value.prefilledRows)
    ) {
      context.addIssue({
        code: "custom",
        path: ["prefilledRows"],
        message:
          "Prefilled rows need a first column of text, or a select whose options include every label, that is not inherited",
      })
    }
  })

function holdsLabels(first: Column | undefined, labels: string[]) {
  if (!first || first.inherited) {
    return false
  }

  if (first.type === "select") {
    return labels.every((label) => first.options.includes(label))
  }

  return first.type === "text" || first.type === "longText"
}

const field = z
  .discriminatedUnion("type", [
    plain.extend(required),
    signature.extend(required),
    select.extend(required),
    checklist.extend(required),
    instruction.extend(required),
    staticList.extend(required),
    table,
  ])
  .refine((value) => !(value.inherited && value.required), {
    message:
      "An inherited field is filled in by the system, so it is never required",
  })
  .refine(
    (value) =>
      !(
        value.required &&
        ["signature", "instruction", "staticList"].includes(value.type)
      ),
    {
      message:
        "A signature, instruction or static list is never written in the form, so it is never required",
    }
  )

// The 13 workbooks. A registered tool belongs to one of them, and its workbook
// is read only from here, never from the letters of its id.
export const workbooks = [
  "wb01",
  "wb02",
  "wb03",
  "wb04",
  "wb05",
  "wb06",
  "wb07",
  "wb08",
  "wb09",
  "wb10",
  "wb11",
  "wb12",
  "wb13",
] as const

export type Workbook = (typeof workbooks)[number]

// A tool for one tier only can name the tool it takes the place of on that
// tier's track. The project's service track picks which variants show.
const toolDefinition = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    workbook: z.string().min(1),
    tier: z
      .union([z.literal(1), z.literal(3), z.literal("both")])
      .default("both"),
    replaces: z.string().min(1).optional(),
    fields: z.array(field).min(1),
  })
  .refine(
    (value) =>
      new Set(value.fields.map((entry) => entry.key)).size ===
      value.fields.length,
    { message: "Two fields cannot share a key" }
  )
  .refine((value) => !(value.replaces && value.tier === "both"), {
    message: "Only a tool for one tier can replace another",
  })
  .refine((value) => value.replaces !== value.id, {
    message: "A tool cannot replace itself",
  })

export type ToolInput = z.input<typeof toolDefinition>

export type ToolDefinition = z.output<typeof toolDefinition>

export type Field = ToolDefinition["fields"][number]

export type FieldType = Field["type"]

export type TableField = Extract<Field, { type: "table" }>

export type SignatureField = Extract<Field, { type: "signature" }>

export type { Column }

export type Tier = ToolDefinition["tier"]

export function defineTool(input: ToolInput): ToolDefinition {
  return toolDefinition.parse(input)
}
