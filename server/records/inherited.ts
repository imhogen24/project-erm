import { and, eq, inArray, ne } from "drizzle-orm"

import type { Database } from "@/db"
import {
  projects,
  toolRecords,
  type JsonObject,
  type RecordState,
} from "@/db/schema"
import type { Field } from "@/server/tools/define-tool"
import { tools } from "@/server/tools/registry"
import { catalogOf } from "@/server/workflow/tracks"
import { repeatsPerCycle } from "@/server/workflow/workflow"

type Reader = Pick<Database, "select">

type Target = {
  projectId: string
  toolId: string
  cycle: number
  state: RecordState
  payload: JsonObject
}

type Link = NonNullable<Field["inherited"]>

// The fields of the tool that take a whole value from an earlier tool. A link
// with a `column` fills one column of a table row by row, which is not done
// here.
function linksOf(toolId: string): { key: string; link: Link }[] {
  return (tools.getTool(toolId)?.fields ?? []).flatMap((field) =>
    field.inherited && field.inherited.column === undefined
      ? [{ key: field.key, link: field.inherited }]
      : []
  )
}

// The payload without its inherited fields, as a user may write it.
export function withoutInherited(
  toolId: string,
  payload: JsonObject
): JsonObject {
  const inherited = new Set(linksOf(toolId).map(({ key }) => key))

  return Object.fromEntries(
    Object.entries(payload).filter(([key]) => !inherited.has(key))
  )
}

// The current value of each inherited field, from the source tool's live
// record on the same project. The project's track picks the tool that stands
// in for the source, so D1.3 means T3.D1.3a on a Tier 3 project. When both
// tools repeat per payment milestone the source is the record of the same
// cycle; when only the source repeats, the latest locked cycle. A field with
// no source record, or whose source does not hold it, is left out.
export async function inheritedValues(
  database: Reader,
  record: Pick<Target, "projectId" | "toolId" | "cycle">
): Promise<JsonObject> {
  const links = linksOf(record.toolId)

  if (links.length === 0) {
    return {}
  }

  const [project] = await database
    .select({ serviceTrack: projects.serviceTrack })
    .from(projects)
    .where(eq(projects.id, record.projectId))

  if (!project) {
    return {}
  }

  const catalog = catalogOf(tools.listTools())

  const sourceOf = (link: Link) =>
    catalog.onTrack(link.tool, project.serviceTrack) ?? link.tool

  const sources = [...new Set(links.map(({ link }) => sourceOf(link)))]

  const live = await database
    .select({
      toolId: toolRecords.toolId,
      cycle: toolRecords.cycle,
      state: toolRecords.state,
      payload: toolRecords.payload,
    })
    .from(toolRecords)
    .where(
      and(
        eq(toolRecords.projectId, record.projectId),
        inArray(toolRecords.toolId, sources),
        ne(toolRecords.state, "void")
      )
    )

  function sourceRecord(toolId: string) {
    if (!repeatsPerCycle(toolId)) {
      return live.find((source) => source.toolId === toolId)
    }

    if (repeatsPerCycle(record.toolId)) {
      return live.find(
        (source) => source.toolId === toolId && source.cycle === record.cycle
      )
    }

    return live
      .filter((source) => source.toolId === toolId && source.state === "locked")
      .sort((a, b) => b.cycle - a.cycle)[0]
  }

  const values: JsonObject = {}

  for (const { key, link } of links) {
    const value = sourceRecord(sourceOf(link))?.payload[link.field]

    if (value !== undefined) {
      values[key] = value
    }
  }

  return values
}

// What a record shows. A draft takes its inherited fields live from their
// sources. From submit on they are frozen in the payload.
export async function readPayload(
  database: Reader,
  record: Target
): Promise<JsonObject> {
  if (record.state !== "draft") {
    return record.payload
  }

  return {
    ...withoutInherited(record.toolId, record.payload),
    ...(await inheritedValues(database, record)),
  }
}
