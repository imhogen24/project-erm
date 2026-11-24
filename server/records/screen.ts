import { and, desc, eq, inArray, ne } from "drizzle-orm"
import { z } from "zod"

import type { Database } from "@/db"
import {
  changeRequests,
  people,
  projects,
  toolRecords,
  type JsonObject,
  type ProjectStatus,
  type RecordState,
  type Role,
} from "@/db/schema"
import {
  getDocumentControl,
  type DocumentControl,
} from "@/server/document-control/document-control"
import {
  PermissionDeniedError,
  mayRequestChange,
  roleAllows,
  rolesOn,
} from "@/server/permissions/permissions"
import { tools } from "@/server/tools/registry"
import { toolStatus } from "@/server/workflow/workflow"

import { getRecord } from "./records"
import { nextTurn, signatureFields, turnsOf } from "./signatures"
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
  can: {
    write: boolean
    approve: boolean
    sign: string[]
    // Only the person who submitted the record, while it waits for approval.
    withdraw: boolean
    // A writer of a locked record that has no change request open.
    requestChange: boolean
  }
  control: DocumentControl | null
  // A change request on the locked record still waiting for the PM.
  changeRequested: boolean
}

const signed = z.object({ signedBy: z.string(), signedAt: z.string() })

// The signatures this person may sign now. One signed any time is open while
// the record is a draft or submitted, or before it has one, since signing an
// empty sheet saves it as a draft first. Of those signed in turn (signInTurn),
// only the next one is, once submitted, and the approving one never to
// whoever submitted it.
function signableNow(
  toolId: string,
  record: {
    state: RecordState | "notStarted"
    payload: JsonObject
    submittedBy?: string | null
  },
  held: readonly Role[],
  actor: string
): string[] {
  const turns = turnsOf(toolId)
  const next = nextTurn(toolId, record.payload)
  const editable = ["notStarted", "draft", "submitted"].includes(record.state)

  const signedAfterSubmit =
    record.state === "submitted" || record.state === "approved"

  return signatureFields(toolId)
    .filter((field) =>
      (field.signedBy ?? []).some((role) => held.includes(role))
    )
    .filter((field) => !signed.safeParse(record.payload[field.key]).success)
    .filter((field) =>
      turns?.order.includes(field.key)
        ? signedAfterSubmit &&
          next?.key === field.key &&
          !(field.key === turns.approves && record.submittedBy === actor) &&
          (field.key !== turns.approves || roleAllows(held, toolId, "approve"))
        : editable
    )
    .map((field) => field.key)
}

// The signatures of the payload with the signer's name in place of their id,
// since the screen shows who signed, not a person's key.
export async function withSignerNames(
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

// The id of the tool's record on the project as it is now: the newest cycle's,
// never a voided one. Undefined while the tool has no record. It checks no
// permission; reading the record does.
export async function currentRecordId(
  database: Pick<Database, "select">,
  projectId: string,
  toolId: string
): Promise<string | undefined> {
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

  return newest?.id
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

  const newest = await currentRecordId(database, projectId, toolId)

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
        // Signing an empty sheet saves it as a draft first, so a writer can
        // sign before typing anything.
        sign:
          active && open && roleAllows(held, toolId, "write")
            ? signableNow(
                toolId,
                { state: "notStarted", payload: {} },
                held,
                actor
              )
            : [],
        withdraw: false,
        requestChange: false,
      },
      control: null,
      changeRequested: false,
    }
  }

  const record = await getRecord(database, actor, newest)

  const payload = await withSignerNames(database, toolId, record.payload)

  // A request still open on a locked record is shown on the project page; a
  // second one is refused.
  const [openRequest] =
    record.state === "locked"
      ? await database
          .select({ status: changeRequests.status })
          .from(changeRequests)
          .where(
            and(
              eq(changeRequests.recordId, record.id),
              inArray(changeRequests.status, ["requested", "approved"])
            )
          )
          .limit(1)
      : []

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
      withdraw:
        active &&
        record.state === "submitted" &&
        record.submittedBy === actor &&
        roleAllows(held, toolId, "write"),
      requestChange:
        active &&
        record.state === "locked" &&
        !openRequest &&
        mayRequestChange(held, toolId),
      sign: active ? signableNow(toolId, record, held, actor) : [],
    },
    control: await getDocumentControl(database, actor, record.id),
    changeRequested: openRequest?.status === "requested",
  }
}
