import { notFound } from "next/navigation"

import { FormPreview } from "@/components/form-preview"
import { Grain } from "@/components/grain"
import type { FieldError } from "@/lib/tool-definition"
import { defineTool } from "@/server/tools/define-tool"

const square = "grid-square relative isolate bg-background"

// One field of every type, one required, one inherited, and the types added
// for tables, checklists and the like.
const tool = defineTool({
  id: "PREVIEW",
  name: "Form preview",
  workbook: "wb00",
  fields: [
    { key: "projectName", label: "Project name", type: "text", required: true },
    { key: "notes", label: "Notes", type: "longText" },
    { key: "quantity", label: "Quantity", type: "number" },
    { key: "dueDate", label: "Due date", type: "date" },
    { key: "approved", label: "Client approved", type: "boolean" },
    {
      key: "priority",
      label: "Priority",
      type: "select",
      options: ["Low", "Medium", "High"],
    },
    {
      key: "clientName",
      label: "Client name",
      type: "text",
      inherited: { tool: "D1.1", field: "clientName" },
    },
    {
      key: "guidance",
      label: "Guidance",
      type: "instruction",
      content: "Fill one row per operand. Rows marked with a lock are fixed.",
    },
    {
      key: "operands",
      label: "Operands",
      type: "table",
      required: true,
      prefilledRows: ["Material", "Energy", "Information", "Living thing"],
      subtotal: "amount",
      columns: [
        { key: "category", label: "Category", type: "text" },
        { key: "description", label: "Description", type: "text" },
        { key: "targetDate", label: "Target date", type: "date" },
        { key: "amount", label: "Amount", type: "currency" },
      ],
    },
    {
      key: "extraItems",
      label: "Extra items",
      type: "table",
      subtotal: "cost",
      columns: [
        { key: "item", label: "Item", type: "text" },
        { key: "cost", label: "Cost", type: "currency" },
      ],
    },
    {
      key: "readiness",
      label: "Readiness checks",
      type: "checklist",
      items: [
        "Client brief received",
        "Site constraints noted",
        "Budget range confirmed",
        "Safety plan reviewed",
      ],
    },
    { key: "budget", label: "Budget", type: "currency" },
    { key: "contingency", label: "Contingency", type: "percentage" },
    { key: "contactEmail", label: "Contact email", type: "email" },
    { key: "meetingTime", label: "Meeting time", type: "time" },
    { key: "briefLink", label: "Brief link", type: "fileLink" },
    {
      key: "standards",
      label: "Standards",
      type: "staticList",
      items: ["ISO 128", "ISO 2768"],
    },
    { key: "pmSignature", label: "PM signature", type: "signature" },
    { key: "qaSignature", label: "QA signature", type: "signature" },
  ],
})

const values = {
  clientName: "Ama Owusu",
  qaSignature: { signedBy: "Ama Owusu", signedAt: "2026-10-23T10:00:00Z" },
}

// ?errors=1 previews what the server sends back when two fields are wrong.
const errorsToShow: FieldError[] = [
  { field: "projectName", message: "Enter a project name." },
  { field: "quantity", message: "Quantity must be a whole number." },
  {
    field: "operands",
    row: 1,
    column: "targetDate",
    message: "Must be a date (YYYY-MM-DD)",
  },
  { field: "extraItems", row: 0, message: "Must be a row of cells" },
]

// Only for developers: production answers not found.
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ errors?: string }>
}) {
  if (process.env.NODE_ENV === "production") {
    notFound()
  }

  const { errors } = await searchParams

  return (
    <div className="drafting-grid min-h-svh py-[var(--cell)]">
      <main className="table-home">
        <div
          className={`${square} flex min-h-[calc(var(--cell)*2)] flex-col justify-end gap-2 px-6 py-6`}
        >
          <Grain />
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
            Form preview
          </h1>
          <p className="text-sm text-muted-foreground">
            A tool definition drawn as a form. Development only.
          </p>
        </div>
        <div className={`${square} mt-[var(--cell)] px-6 py-8`}>
          <Grain />
          <div className="relative max-w-4xl">
            <FormPreview
              tool={tool}
              values={values}
              errors={errors === "1" ? errorsToShow : []}
            />
          </div>
        </div>
      </main>
    </div>
  )
}
