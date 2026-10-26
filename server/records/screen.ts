import { and, desc, eq, inArray, ne } from "drizzle-orm"
import { z } from "zod"

import type { Database } from "@/db"
import {
  people,
  projects,
  toolRecords,
  type JsonObject,
  type ProjectStatus,
  type RecordState,
} from "@/db/schema"
import {
  getDocumentControl,
  type DocumentControl,
} from "@/server/document-control/document-control"
import {
  PermissionDeniedError,
  roleAllows,
  rolesOn,
} from "@/server/permissions/permissions"
import { tools } from "@/server/tools/registry"
import { toolStatus } from "@/server/workflow/workflow"

import { getRecord } from "./records"
import { signatureFields } from "./signatures"
import { UnknownToolError } from "./validate"

export type ScreenState = Exclude<RecordState, "void"> | "notStarted"

// What the record screen shows one person for one tool of a project. It holds
// the answers the server gives, so the page never works out permissions.
export type RecordScreen = {
  project: { id: string; name: string; status: ProjectStatus }
  toolId: string
  toolName: string
  state: ScreenState
  cycle: number
  // The record the tool has, with its payload as the screen shows it: inherited
  // values filled in and each signature carrying the signer's name.
  record: { id: string; updatedAt: Date; payload: JsonObject } | null
  // Set when the tool has no record and the workflow has not opened it.
  waiting: { missing: string[]; waitingOn: string[] } | null
  can: { write: boolean; approve: boolean; sign: string[] }
  control: DocumentControl | null
}

const signed = z.object({ signedBy: z.string(), signedAt: z.string() })

// The signatures of the payload with the signer's name in place of their id,
// since the screen shows who signed, not a person's key.
async function withSignerNames(
  database: Database,
  toolId: string,
  payload: JsonObject
): Promise<JsonObject> {
  const fields = signatureFields(toolId)

  const signatures = fields.flatMap((field) => {
    const value = signed.safeParse(payload[field.key])

    return value.success ? [{ key: field.key, ...value.data }] : []
  })

  if (signatures.length === 0) {
    return payload
  }

  const names = new Map(
    (
      await database
        .select({ id: people.id, name: people.name })
        .from(people)
        .where(
          inArray(
            people.id,
            signatures.map((each) => each.signedBy)
          )
        )
    ).map((person) => [person.id, person.name])
  )

  return {
    ...payload,
    ...Object.fromEntries(
      signatures.map((each) => [
        each.key,
        {
          signedBy: names.get(each.signedBy) ?? each.signedBy,
          signedAt: each.signedAt,
        },
      ])
    ),
  }
}

// Everything the record screen needs for one tool: the newest record that is
// not void, or why the tool cannot be started, and what this person may do.
// Reading needs read access to the tool; anyone else gets the same refusal as a
// project they are not on.
export async function getRecordScreen(
  database: Database,
  actor: string,
  projectId: string,
  toolId: string
): Promise<RecordScreen> {
  const held = await rolesOn(database, actor, projectId)

  if (held.length === 0) {
    throw new PermissionDeniedError("This person is not on this project")
  }

  const tool = tools.getTool(toolId)

  if (!tool) {
    throw new UnknownToolError(`${toolId} has no tool definition`)
  }

  if (!roleAllows(held, toolId, "read")) {
    throw new PermissionDeniedError(`This person may not read ${toolId}`)
  }

  const [project] = await database
    .select({
      id: projects.id,
      name: projects.name,
      status: projects.status,
    })
    .from(projects)
    .where(eq(projects.id, projectId))

  const active = project!.status === "active"

  const [newest] = await database
    .select({ id: toolRecords.id })
    .from(toolRecords)
    .where(
      and(
        eq(toolRecords.projectId, projectId),
        eq(toolRecords.toolId, toolId),
        ne(toolRecords.state, "void")
      )
    )
    .orderBy(desc(toolRecords.cycle), desc(toolRecords.createdAt))
    .limit(1)

  if (!newest) {
    const status = await toolStatus(database, projectId, toolId)
    const open = status.missing.length === 0

    return {
      project: project!,
      toolId,
      toolName: tool.name,
      state: "notStarted",
      cycle: status.cycle,
      record: null,
      waiting: open
        ? null
        : { missing: status.missing, waitingOn: status.waitingOn },
      can: {
        write: active && open && roleAllows(held, toolId, "write"),
        approve: false,
        sign: [],
      },
      control: null,
    }
  }

  const record = await getRecord(database, actor, newest.id)

  const payload = await withSignerNames(database, toolId, record.payload)

  const editable = record.state === "draft" || record.state === "submitted"

  return {
    project: project!,
    toolId,
    toolName: tool.name,
    state: record.state === "void" ? "notStarted" : record.state,
    cycle: record.cycle,
    record: { id: record.id, updatedAt: record.updatedAt, payload },
    waiting: null,
    can: {
      write:
        active && record.state === "draft" && roleAllows(held, toolId, "write"),
      approve:
        active &&
        record.state === "submitted" &&
        roleAllows(held, toolId, "approve") &&
        record.submittedBy !== actor,
      sign:
        active && editable
          ? signatureFields(toolId)
              .filter(
                (field) =>
                  !signed.safeParse(record.payload[field.key]).success &&
                  (field.signedBy ?? []).some((role) => held.includes(role))
              )
              .map((field) => field.key)
          : [],
    },
    control: await getDocumentControl(database, actor, record.id),
  }
}
