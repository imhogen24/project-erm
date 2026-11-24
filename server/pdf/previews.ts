import { existsSync } from "node:fs"
import { readFile } from "node:fs/promises"
import path from "node:path"

import type { Database } from "@/db"
import type { PreviewState, PreviewStates } from "@/lib/pdf-preview"
import {
  PermissionDeniedError,
  can,
  roleAllows,
  rolesOn,
} from "@/server/permissions/permissions"
import { RecordNotFoundError } from "@/server/records/records"
import { currentRecordId } from "@/server/records/screen"
import {
  storedPdfName,
  type PdfPreviewField,
  type ToolDefinition,
} from "@/server/tools/define-tool"
import { tools } from "@/server/tools/registry"

import { sourceName } from "./preview-source"
import { recordPdf, type RecordPdf } from "./record-pdf"

// The PDFs kept with the app, such as the company SLA. They are never public:
// only the routes below send them, to someone a tool shows them to.
export const documentsDirectory = path.join(process.cwd(), "documents")

function isPreview(field: ToolDefinition["fields"][number]) {
  return field.type === "pdfPreview"
}

export function toolPdfHref(projectId: string, toolId: string) {
  return `/api/projects/${projectId}/tools/${encodeURIComponent(toolId)}/pdf`
}

export function storedPdfHref(projectId: string, file: string) {
  return `/api/projects/${projectId}/documents/${file}`
}

// Each PDF preview field of the tool, by its key, as this person sees it on
// the project. A tool they cannot read is "noAccess", and its PDF is never
// offered to them.
export async function previewStates(
  database: Database,
  actor: string,
  projectId: string,
  tool: ToolDefinition
): Promise<PreviewStates> {
  // SAFETY: the filter keeps only PDF preview fields.
  const fields = tool.fields.filter(isPreview) as PdfPreviewField[]

  if (fields.length === 0) {
    return {}
  }

  const held = await rolesOn(database, actor, projectId)

  const states = await Promise.all(
    fields.map(async (field): Promise<[string, PreviewState]> => {
      const { source } = field
      const name = sourceName(source)

      if ("file" in source) {
        return [
          field.key,
          {
            status: "ready",
            name,
            href: storedPdfHref(projectId, source.file),
          },
        ]
      }

      if (!roleAllows(held, source.tool, "read")) {
        return [field.key, { status: "noAccess", name }]
      }

      if (!(await currentRecordId(database, projectId, source.tool))) {
        return [field.key, { status: "notStarted", name }]
      }

      return [
        field.key,
        { status: "ready", name, href: toolPdfHref(projectId, source.tool) },
      ]
    })
  )

  return Object.fromEntries(states)
}

// The project's record of the tool as it is now, as a PDF for this person.
// Someone who may not read the tool is refused before anything is looked up,
// so the refusal never says whether a record exists.
export async function toolPdf(
  database: Database,
  actor: string,
  projectId: string,
  toolId: string
): Promise<RecordPdf> {
  if (!(await can(database, actor, projectId, toolId, "read"))) {
    throw new PermissionDeniedError(`This person may not read ${toolId}`)
  }

  const recordId = await currentRecordId(database, projectId, toolId)

  if (!recordId) {
    throw new RecordNotFoundError(`${toolId} has no record on this project`)
  }

  return await recordPdf(database, actor, recordId)
}

// A PDF kept with the app, for someone who may read a tool that shows it on
// this project. Any other name is refused the same way. `directory` is only
// changed by tests.
export async function storedPdf(
  database: Database,
  actor: string,
  projectId: string,
  file: string,
  directory = documentsDirectory
): Promise<RecordPdf> {
  if (!storedPdfName.safeParse(file).success) {
    throw new RecordNotFoundError(`No stored PDF named ${file}`)
  }

  const held = await rolesOn(database, actor, projectId)

  const shownBy = tools
    .listTools()
    .flatMap((tool) =>
      roleAllows(held, tool.id, "read")
        ? tool.fields.flatMap((field) =>
            field.type === "pdfPreview" &&
            "file" in field.source &&
            field.source.file === file
              ? [field.source]
              : []
          )
        : []
    )

  const source = shownBy[0]

  if (!source) {
    throw new PermissionDeniedError(`This person is shown no PDF named ${file}`)
  }

  return {
    fileName: `${source.title}.pdf`,
    content: await readFile(path.join(directory, file)),
  }
}

// Every preview that points nowhere: a tool that is not registered, or a
// stored PDF missing from `documents/`, as "tool.field: what is missing".
export function brokenPreviewSources(all: ToolDefinition[]) {
  const ids = new Set(all.map((tool) => tool.id))

  return all.flatMap((tool) =>
    tool.fields.flatMap((field) => {
      if (field.type !== "pdfPreview") {
        return []
      }

      const { source } = field
      const where = `${tool.id}.${field.key}`

      if ("tool" in source) {
        return ids.has(source.tool) ? [] : [`${where}: no tool ${source.tool}`]
      }

      return existsSync(path.join(documentsDirectory, source.file))
        ? []
        : [`${where}: no file documents/${source.file}`]
    })
  )
}
