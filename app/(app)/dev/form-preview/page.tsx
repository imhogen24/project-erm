import { eq } from "drizzle-orm"
import { notFound } from "next/navigation"
import { z } from "zod"

import { projects } from "@/db/schema"
import { FormPreview } from "@/components/form-preview"
import { Grain } from "@/components/grain"
import { PdfPreviews } from "@/components/pdf-preview-field"
import { requireSession } from "@/lib/session"
import type { FieldError } from "@/lib/tool-definition"
import { ensureToolsRegistered } from "@/lib/tools"
import { getDatabase } from "@/server/database"
import { previewStates } from "@/server/pdf/previews"
import { defineTool } from "@/server/tools/define-tool"
import { DEV_LOCKED } from "@/server/workflow/dev-unlocked"

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
      key: "objectives",
      label: "Locked and added rows",
      type: "table",
      lockedRows: ["Primary purpose", "Main deliverables"],
      columns: [
        { key: "item", label: "Item", type: "text" },
        { key: "detail", label: "Detail", type: "longText" },
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
    {
      key: "appendixA",
      label: "Appendix A: D1.15 Project Brief & Draft Budget",
      type: "pdfPreview",
      section: "Appendices",
      source: { tool: "D1.15" },
    },
    {
      key: "appendixB",
      label: "Appendix B: D1.13 Draft Scope of Work",
      type: "pdfPreview",
      section: "Appendices",
      source: { tool: "D1.13" },
    },
    {
      key: "appendixC",
      label: "Appendix C: D1.11 Risk Assessment Sheet",
      type: "pdfPreview",
      section: "Appendices",
      source: { tool: "D1.11" },
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
  searchParams: Promise<{ errors?: string; project?: string; tier?: string }>
}) {
  if (process.env.NODE_ENV === "production") {
    notFound()
  }

  const { errors, project, tier } = await searchParams

  ensureToolsRegistered()

  const session = await requireSession()

  // The appendices read the seeded Tier 1 project where every tool is
  // locked, its Tier 3 twin with ?tier=3, or ?project=<id>, so Appendix A
  // opens D1.15, or T3.D1.15a in its place on Tier 3, as this person may see
  // it. B and C show the other two states a preview can be in.
  const [shown] = z.uuid().safeParse(project).success
    ? [{ id: project! }]
    : await getDatabase()
        .select({ id: projects.id })
        .from(projects)
        .where(
          eq(projects.name, `${DEV_LOCKED} (Tier ${tier === "3" ? 3 : 1})`)
        )

  const states = shown
    ? await previewStates(getDatabase(), session.user.id, shown.id, tool)
    : {}

  const previews = {
    ...states,
    appendixB: { status: "notStarted", name: "D1.13 Draft Scope of Work" },
    appendixC: { status: "noAccess", name: "D1.11 Risk Assessment Sheet" },
  } as const

  return (
    <div className="drafting-grid min-h-svh py-[var(--inset)]">
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
            <PdfPreviews states={previews}>
              <FormPreview
                tool={tool}
                values={values}
                errors={errors === "1" ? errorsToShow : []}
              />
            </PdfPreviews>
          </div>
        </div>
      </main>
    </div>
  )
}
