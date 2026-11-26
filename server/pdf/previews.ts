import { existsSync } from "node:fs"
import { readFile } from "node:fs/promises"
import path from "node:path"

import { and, eq } from "drizzle-orm"
import { z } from "zod"

import type { Database } from "@/db"
import { files, projects, toolRecords } from "@/db/schema"
import { fileIdOf } from "@/lib/file-reference"
import { storages, type Storages } from "@/server/files/storage"
import { rowsNotNeeded } from "@/server/records/not-needed"
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
import { currentRecordId, cycleRecordId } from "@/server/records/screen"
import { repeatsPerCycle } from "@/server/workflow/workflow"
import {
  cellPreviewSource,
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

// `cycle` names one payment milestone cycle's record of a tool run once per
// milestone, such as D3.3's for cycle 2; without it, the newest.
export function toolPdfHref(projectId: string, toolId: string, cycle?: number) {
  return `/api/projects/${projectId}/tools/${encodeURIComponent(toolId)}/pdf${cycle === undefined ? "" : `?cycle=${cycle}`}`
}

// The record a preview of a tool shows: in a cycle of a tool run once per
// milestone, the same cycle's record of a tool that also runs once per
// milestone, such as D3.4's preview of its own cycle's D3.3; otherwise the
// newest.
async function shownRecordId(
  database: Pick<Database, "select">,
  projectId: string,
  toolId: string,
  cycle: number | undefined
) {
  return cycle !== undefined && repeatsPerCycle(toolId)
    ? await cycleRecordId(database, projectId, toolId, cycle)
    : await currentRecordId(database, projectId, toolId)
}

export function uploadPdfHref(
  projectId: string,
  toolId: string,
  field: string
) {
  return `/api/projects/${projectId}/tools/${encodeURIComponent(toolId)}/uploads/${field}`
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
        const named = row[column.key]

        return named
          ? [
              [
                previewCellKey(field.key, index, column.key),
                cellPreviewSource(named),
              ],
            ]
          : []
      })
    )
  })
}

// The file a preview of an upload points to on the project: the newest
// record of the tool (as the track shows it) and the uploaded file's ID.
async function uploadOf(
  database: Database,
  projectId: string,
  toolId: string,
  field: string
) {
  const recordId = await currentRecordId(database, projectId, toolId)

  if (!recordId) {
    return undefined
  }

  const [record] = await database
    .select({ payload: toolRecords.payload })
    .from(toolRecords)
    .where(eq(toolRecords.id, recordId))

  const fileId = fileIdOf(z.string().catch("").parse(record?.payload[field]))

  if (!fileId) {
    return undefined
  }

  const [file] = await database
    .select({ key: files.key, name: files.name, storage: files.storage })
    .from(files)
    .where(and(eq(files.id, fileId), eq(files.projectId, projectId)))

  return file
}

// Each PDF preview of the tool, by its key, as this person sees it on the
// project. A preview names the Tier 1 tool, as the sheet does; on a Tier 3
// project it shows the variant that takes that tool's place. A tool they
// cannot read is "noAccess", and its PDF is never offered to them. A table
// row the project does not need (`notNeeded`) is "notNeeded". In `cycle` of
// a tool run once per milestone, a tool that also runs once per milestone
// shows that cycle's record.
export async function previewStates(
  database: Database,
  actor: string,
  projectId: string,
  tool: ToolDefinition,
  cycle?: number
): Promise<PreviewStates> {
  const sources = previewSourcesOf(tool)

  if (sources.length === 0) {
    return {}
  }

  const [held, track, skipped] = await Promise.all([
    rolesOn(database, actor, projectId),
    trackOf(database, projectId),
    rowsNotNeeded(database, projectId, tool.id),
  ])

  const notNeeded = (key: string) => {
    const [table, row] = key.split(".")

    return skipped.get(table!)?.has(Number(row)) ?? false
  }

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

    if ("upload" in source) {
      const shown = track ? shownTool(source.upload.tool, track) : undefined

      if (!roleAllows(held, shown ?? source.upload.tool, "read")) {
        return { status: "noAccess", name }
      }

      if (
        !shown ||
        !(await uploadOf(database, projectId, shown, source.upload.field))
      ) {
        return { status: "notStarted", name }
      }

      return {
        status: "ready",
        name,
        href: uploadPdfHref(projectId, shown, source.upload.field),
      }
    }

    // A project whose track skips the tool has nothing to show for it.
    const shown = track ? shownTool(source.tool, track) : undefined

    if (!roleAllows(held, shown ?? source.tool, "read")) {
      return { status: "noAccess", name }
    }

    const inCycle =
      cycle !== undefined && repeatsPerCycle(tool.id) && shown
        ? repeatsPerCycle(shown)
        : false

    const at = inCycle ? cycle : undefined

    if (!shown || !(await shownRecordId(database, projectId, shown, at))) {
      return { status: "notStarted", name }
    }

    return { status: "ready", name, href: toolPdfHref(projectId, shown, at) }
  }

  function once(source: PreviewSource) {
    const key =
      "file" in source
        ? `file:${source.file}`
        : "upload" in source
          ? `upload:${source.upload.tool}:${source.upload.field}`
          : source.tool

    const known = looked.get(key) ?? stateOf(source)

    looked.set(key, known)

    return known
  }

  const states = await Promise.all(
    sources.map(async ([key, source]): Promise<[string, PreviewState]> => [
      key,
      notNeeded(key)
        ? { status: "notNeeded", name: sourceName(source, track) }
        : await once(source),
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
  toolId: string,
  cycle?: number
): Promise<RecordPdf> {
  const track = await trackOf(database, projectId)
  const shown = track ? shownTool(toolId, track) : undefined

  if (!(await can(database, actor, projectId, shown ?? toolId, "read"))) {
    throw new PermissionDeniedError(`This person may not read ${toolId}`)
  }

  const recordId =
    shown && (await shownRecordId(database, projectId, shown, cycle))

  if (!recordId) {
    throw new RecordNotFoundError(`${toolId} has no record on this project`)
  }

  return await recordPdf(database, actor, recordId)
}

// A PDF uploaded to a file field of the project's record of a tool, such as
// D2.12's executed contract, for someone who may read that tool. On a Tier 3
// project the Tier 1 tool's ID gives the variant. Someone who may not read
// it is refused before anything is looked up.
export async function uploadPdf(
  database: Database,
  actor: string,
  projectId: string,
  toolId: string,
  field: string,
  storage: Storages = storages
): Promise<RecordPdf> {
  const track = await trackOf(database, projectId)
  const shown = track ? shownTool(toolId, track) : undefined

  if (!(await can(database, actor, projectId, shown ?? toolId, "read"))) {
    throw new PermissionDeniedError(`This person may not read ${toolId}`)
  }

  const file = shown && (await uploadOf(database, projectId, shown, field))

  if (!file) {
    throw new RecordNotFoundError(`${toolId} holds no file in ${field}`)
  }

  return {
    fileName: file.name,
    content: await storage[file.storage].read(file.key),
  }
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

      if ("upload" in source) {
        const named = all.find((each) => each.id === source.upload.tool)

        return named?.fields.some(
          (field) =>
            field.key === source.upload.field && field.type === "fileLink"
        )
          ? []
          : [
              `${where}: no file field ${source.upload.tool}.${source.upload.field}`,
            ]
      }

      return existsSync(path.join(documentsDirectory, source.file))
        ? []
        : [`${where}: no file documents/${source.file}`]
    })
  )
}
