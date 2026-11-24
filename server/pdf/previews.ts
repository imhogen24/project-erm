import { existsSync } from "node:fs"
import { readFile } from "node:fs/promises"
import path from "node:path"

import { eq } from "drizzle-orm"

import type { Database } from "@/db"
import { projects } from "@/db/schema"
import {
  previewCellKey,
  type PreviewState,
  type PreviewStates,
} from "@/lib/pdf-preview"
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
  type PreviewSource,
  type ToolDefinition,
} from "@/server/tools/define-tool"
import { tools } from "@/server/tools/registry"

import { shownTool, sourceName } from "./preview-source"
import { recordPdf, type RecordPdf } from "./record-pdf"

// The PDFs kept with the app, such as the company SLA. They are never public:
// only the routes below send them, to someone a tool shows them to.
export const documentsDirectory = path.join(process.cwd(), "documents")

export function toolPdfHref(projectId: string, toolId: string) {
  return `/api/projects/${projectId}/tools/${encodeURIComponent(toolId)}/pdf`
}

export function storedPdfHref(projectId: string, file: string) {
  return `/api/projects/${projectId}/documents/${file}`
}

async function trackOf(database: Database, projectId: string) {
  const [project] = await database
    .select({ track: projects.serviceTrack })
    .from(projects)
    .where(eq(projects.id, projectId))

  return project?.track
}

// Every PDF preview of the tool, by its key: each preview field, and each
// fixed row's cell of a table's preview column, which names a tool.
export function previewSourcesOf(
  tool: ToolDefinition
): [string, PreviewSource][] {
  return tool.fields.flatMap((field): [string, PreviewSource][] => {
    if (field.type === "pdfPreview") {
      return [[field.key, field.source]]
    }

    if (field.type !== "table") {
      return []
    }

    const previewColumns = field.columns.filter(
      (column) => column.type === "pdfPreview"
    )

    return (field.fixedRows ?? []).flatMap((row, index) =>
      previewColumns.flatMap((column): [string, PreviewSource][] => {
        const toolId = row[column.key]

        return toolId
          ? [[previewCellKey(field.key, index, column.key), { tool: toolId }]]
          : []
      })
    )
  })
}

// Each PDF preview of the tool, by its key, as this person sees it on the
// project. A preview names the Tier 1 tool, as the sheet does; on a Tier 3
// project it shows the variant that takes that tool's place. A tool they
// cannot read is "noAccess", and its PDF is never offered to them.
export async function previewStates(
  database: Database,
  actor: string,
  projectId: string,
  tool: ToolDefinition
): Promise<PreviewStates> {
  const sources = previewSourcesOf(tool)

  if (sources.length === 0) {
    return {}
  }

  const [held, track] = await Promise.all([
    rolesOn(database, actor, projectId),
    trackOf(database, projectId),
  ])

  // Several cells often show the same tool, so each is looked up once.
  const looked = new Map<string, Promise<PreviewState>>()

  async function stateOf(source: PreviewSource): Promise<PreviewState> {
    const name = sourceName(source, track)

    if ("file" in source) {
      return {
        status: "ready",
        name,
        href: storedPdfHref(projectId, source.file),
      }
    }

    // A project whose track skips the tool has nothing to show for it.
    const shown = track ? shownTool(source.tool, track) : undefined

    if (!roleAllows(held, shown ?? source.tool, "read")) {
      return { status: "noAccess", name }
    }

    if (!shown || !(await currentRecordId(database, projectId, shown))) {
      return { status: "notStarted", name }
    }

    return { status: "ready", name, href: toolPdfHref(projectId, shown) }
  }

  function once(source: PreviewSource) {
    const key = "file" in source ? `file:${source.file}` : source.tool
    const known = looked.get(key) ?? stateOf(source)

    looked.set(key, known)

    return known
  }

  const states = await Promise.all(
    sources.map(async ([key, source]): Promise<[string, PreviewState]> => [
      key,
      await once(source),
    ])
  )

  return Object.fromEntries(states)
}

// The project's record of the tool as it is now, as a PDF for this person.
// On a Tier 3 project the Tier 1 tool's ID gives the variant that takes its
// place, and a tool the track skips gives nothing. Someone who may not read
// the tool sent is refused before any record is looked up, so the refusal
// never says whether a record exists.
export async function toolPdf(
  database: Database,
  actor: string,
  projectId: string,
  toolId: string
): Promise<RecordPdf> {
  const track = await trackOf(database, projectId)
  const shown = track ? shownTool(toolId, track) : undefined

  if (!(await can(database, actor, projectId, shown ?? toolId, "read"))) {
    throw new PermissionDeniedError(`This person may not read ${toolId}`)
  }

  const recordId = shown && (await currentRecordId(database, projectId, shown))

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
    previewSourcesOf(tool).flatMap(([key, source]) => {
      const where = `${tool.id}.${key}`

      if ("tool" in source) {
        return ids.has(source.tool) ? [] : [`${where}: no tool ${source.tool}`]
      }

      return existsSync(path.join(documentsDirectory, source.file))
        ? []
        : [`${where}: no file documents/${source.file}`]
    })
  )
}
