import { and, eq, inArray, ne } from "drizzle-orm"

import type { Database } from "@/db"
import {
  intakeSubmissions,
  projects,
  toolRecords,
  type JsonObject,
  type RecordState,
} from "@/db/schema"
import { mayReadRequest } from "@/server/intake/preview"
import { valueOf } from "@/server/intake/request-sheet"
import { rolesOn } from "@/server/permissions/permissions"
import type { Field, RequestLink } from "@/server/tools/define-tool"
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

type ToolLink = Exclude<Link, RequestLink>

// The fields of the tool that take a whole value from an earlier tool or the
// saved web request. A link with a `column` fills one column of a table row by
// row, which is not done here.
function linksOf(toolId: string): { key: string; link: Link }[] {
  return (tools.getTool(toolId)?.fields ?? []).flatMap((field) =>
    field.inherited &&
    ("request" in field.inherited || field.inherited.column === undefined)
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

// The current value of each field linked to the project's saved web request,
// as one line, the way the client request panel shows it. A field the request
// has no answer for is left out.
async function requestValues(
  database: Reader,
  projectId: string,
  links: { key: string; link: RequestLink }[]
): Promise<JsonObject> {
  if (links.length === 0) {
    return {}
  }

  const [copy] = await database
    .select({
      serviceTrack: intakeSubmissions.serviceTrack,
      submission: intakeSubmissions.submission,
    })
    .from(intakeSubmissions)
    .where(eq(intakeSubmissions.projectId, projectId))

  if (!copy) {
    return {}
  }

  const values: JsonObject = {}

  for (const { key, link } of links) {
    const value = valueOf(copy.submission, link.request[copy.serviceTrack])

    if (value !== "") {
      values[key] = value
    }
  }

  return values
}

// The current value of each field linked to an earlier tool, from the source
// tool's live record on the same project. The project's track picks the tool
// that stands in for the source, so D1.3 means T3.D1.3a on a Tier 3 project.
// When both tools repeat per payment milestone the source is the record of the
// same cycle; when only the source repeats, the latest locked cycle. A field
// with no source record, or whose source does not hold it, is left out.
async function toolValues(
  database: Reader,
  record: Pick<Target, "projectId" | "toolId" | "cycle">,
  links: { key: string; link: ToolLink }[]
): Promise<JsonObject> {
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

  const sourceOf = (link: ToolLink) =>
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

// The current value of each inherited field, whoever is asking, since submit
// freezes these for every later reader. What a person may see of them is
// decided when the record is read, by `withoutHiddenAnswers`.
export async function inheritedValues(
  database: Reader,
  record: Pick<Target, "projectId" | "toolId" | "cycle">
): Promise<JsonObject> {
  const links = linksOf(record.toolId)

  return {
    ...(await toolValues(
      database,
      record,
      links.flatMap(({ key, link }) =>
        "request" in link ? [] : [{ key, link }]
      )
    )),
    ...(await requestValues(
      database,
      record.projectId,
      links.flatMap(({ key, link }) =>
        "request" in link ? [{ key, link }] : []
      )
    )),
  }
}

// Whether the link ends at the web request, directly or through the fields of
// earlier tools. Any tool that can stand in for the source counts, since which
// one is read depends on the project's track.
function endsAtRequest(link: Link, seen = new Set<string>()): boolean {
  if ("request" in link) {
    return true
  }

  const source = `${link.tool}.${link.field}`

  if (seen.has(source)) {
    return false
  }

  seen.add(source)

  return tools
    .listTools()
    .filter((tool) => tool.id === link.tool || tool.replaces === link.tool)
    .flatMap((tool) => tool.fields)
    .some(
      (field) =>
        field.key === link.field &&
        field.inherited !== undefined &&
        endsAtRequest(field.inherited, seen)
    )
}

// The payload as this person may see it: without the web request's answers,
// live or frozen, when they may not read the request. The rule is the client
// request panel's, and a tool's read access does not change it.
export async function withoutHiddenAnswers(
  database: Reader,
  actor: string,
  record: Pick<Target, "projectId" | "toolId" | "payload">
): Promise<JsonObject> {
  const answers = new Set(
    linksOf(record.toolId)
      .filter(({ link }) => endsAtRequest(link))
      .map(({ key }) => key)
  )

  if (
    answers.size === 0 ||
    mayReadRequest(await rolesOn(database, actor, record.projectId))
  ) {
    return record.payload
  }

  return Object.fromEntries(
    Object.entries(record.payload).filter(([key]) => !answers.has(key))
  )
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
