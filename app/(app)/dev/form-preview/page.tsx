import { notFound } from "next/navigation"

import { FormPreview } from "@/components/form-preview"
import { Grain } from "@/components/grain"
import type { FieldError } from "@/lib/tool-definition"
import { defineTool } from "@/server/tools/define-tool"

const square = "grid-square relative isolate bg-background"

// One field of every type, one required, one inherited.
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
  ],
})

const values = { clientName: "Ama Owusu" }

// ?errors=1 previews what the server sends back when two fields are wrong.
const errorsToShow: FieldError[] = [
  { field: "projectName", message: "Enter a project name." },
  { field: "quantity", message: "Quantity must be a whole number." },
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
          <div className="relative max-w-2xl">
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
