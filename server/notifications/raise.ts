import { and, eq, inArray } from "drizzle-orm"

import type { Database } from "@/db"
import {
  people,
  personProjectRoles,
  projects,
  roles,
  type Role,
} from "@/db/schema"
import type { Transaction } from "@/server/audit/audit"
import { requireEnv } from "@/server/database"
import { sendEmail, type Transport } from "@/server/email/email"
import { accessRow, type Access } from "@/server/permissions/matrix"
import { getTool } from "@/server/tools/registry"
import type { OpenTool } from "@/server/workflow/workflow"

import { notify, type Written } from "./notifications"

// An email that goes with a notification. It is sent only once the
// transaction that wrote the notification has committed, and its key is the
// notification's ID, so a retry sends it once.
export type PendingEmail =
  | {
      kind: "assigned"
      key: string
      to: string
      projectId: string
      path: string
      projectName: string
    }
  | {
      kind: "approval_needed"
      key: string
      to: string
      projectId: string
      recordId: string
      path: string
      recordTitle: string
    }

type RecordRef = { id: string; projectId: string; toolId: string }

type Reader = Pick<Transaction, "select" | "selectDistinct">

export function projectPath(projectId: string): string {
  return `/projects/${projectId}`
}

export function toolPath(projectId: string, toolId: string): string {
  return `${projectPath(projectId)}/tools/${toolId}`
}

function toolName(toolId: string): string {
  return getTool(toolId)?.name ?? toolId
}

// A person is never notified about their own action.
function others(actor: string, personIds: readonly string[]): string[] {
  return personIds.filter((personId) => personId !== actor)
}

async function projectName(
  transaction: Reader,
  projectId: string
): Promise<string> {
  const [project] = await transaction
    .select({ name: projects.name })
    .from(projects)
    .where(eq(projects.id, projectId))

  return project!.name
}

// The people assigned to any of these roles on the project. A company-wide
// role is not an assignment, so it is never counted.
async function holdersOf(
  transaction: Reader,
  projectId: string,
  roles: readonly Role[]
): Promise<string[]> {
  if (roles.length === 0) {
    return []
  }

  const rows = await transaction
    .selectDistinct({ personId: personProjectRoles.personId })
    .from(personProjectRoles)
    .where(
      and(
        eq(personProjectRoles.projectId, projectId),
        inArray(personProjectRoles.role, roles)
      )
    )

  return rows.map((row) => row.personId)
}

// Leaves out anyone assigned as the project's Client: client notifications are
// their own.
async function withoutClients(
  transaction: Reader,
  projectId: string,
  personIds: readonly string[]
): Promise<string[]> {
  const clients = await holdersOf(transaction, projectId, ["Client"])

  return personIds.filter((personId) => !clients.includes(personId))
}

async function addressesOf(
  transaction: Reader,
  written: readonly Written[]
): Promise<Map<string, string>> {
  if (written.length === 0) {
    return new Map()
  }

  const rows = await transaction
    .select({ id: people.id, email: people.email })
    .from(people)
    .where(
      inArray(
        people.id,
        written.map((row) => row.personId)
      )
    )

  return new Map(rows.map((row) => [row.id, row.email]))
}

// The person given a role on a project, unless they gave it to themselves.
export async function notifyAssigned(
  transaction: Transaction,
  actor: string,
  assignment: { projectId: string; personId: string; role: Role }
): Promise<PendingEmail[]> {
  const name = await projectName(transaction, assignment.projectId)
  const path = projectPath(assignment.projectId)

  const written = await notify(transaction, {
    personIds: others(actor, [assignment.personId]),
    kind: "assigned",
    title: `You were assigned as ${assignment.role} on ${name}`,
    projectId: assignment.projectId,
    path,
  })

  const addresses = await addressesOf(transaction, written)

  return written.map((row) => ({
    kind: "assigned",
    key: row.id,
    to: addresses.get(row.personId)!,
    projectId: assignment.projectId,
    path,
    projectName: name,
  }))
}

// Whoever may approve the tool, when a record is submitted: the people assigned
// to its approving role in the permissions matrix, the same rule approving
// checks. That is the PM for most tools, and the HE, FO or LE for some. Nobody
// assigned to that role, or a tool with none, notifies nobody.
export async function notifyApprovalNeeded(
  transaction: Transaction,
  actor: string,
  record: RecordRef
): Promise<PendingEmail[]> {
  const approvers = await holdersOf(
    transaction,
    record.projectId,
    rolesWith(record.toolId, "RA")
  )

  const name = await projectName(transaction, record.projectId)
  const path = toolPath(record.projectId, record.toolId)

  const written = await notify(transaction, {
    personIds: others(actor, approvers),
    kind: "approval_needed",
    title: `${record.toolId} is waiting for your approval`,
    text: `${toolName(record.toolId)} on ${name}`,
    projectId: record.projectId,
    recordId: record.id,
    path,
  })

  const addresses = await addressesOf(transaction, written)

  return written.map((row) => ({
    kind: "approval_needed",
    key: row.id,
    to: addresses.get(row.personId)!,
    projectId: record.projectId,
    recordId: record.id,
    path,
    recordTitle: `${record.toolId} ${toolName(record.toolId)}`,
  }))
}

// The roles with this access to the tool in the permissions matrix: "RW"
// writes it and "RA" approves it. The Client is left out: client
// notifications are their own.
function rolesWith(toolId: string, access: Access): Role[] {
  const row = accessRow(toolId)

  return roles.filter((role) => role !== "Client" && row?.[role] === access)
}

// Everyone who writes a tool that a lock has just opened, one notification per
// tool. A tool that was already open before the lock is not named again.
export async function notifyToolsOpened(
  transaction: Transaction,
  actor: string,
  projectId: string,
  before: readonly OpenTool[],
  after: readonly OpenTool[]
): Promise<void> {
  const opened = after.filter(
    (tool) =>
      !before.some(
        (open) => open.toolId === tool.toolId && open.cycle === tool.cycle
      )
  )

  if (opened.length === 0) {
    return
  }

  const name = await projectName(transaction, projectId)

  for (const tool of opened) {
    const writers = await holdersOf(
      transaction,
      projectId,
      rolesWith(tool.toolId, "RW")
    )

    await notify(transaction, {
      personIds: others(actor, writers),
      kind: "tool_open",
      title: `${tool.toolId} is open`,
      text: `${toolName(tool.toolId)} on ${name} can be started`,
      projectId,
      path: toolPath(projectId, tool.toolId),
    })
  }
}

// The project's PM, when a writer asks to reopen a locked record.
export async function notifyChangeWaiting(
  transaction: Transaction,
  actor: string,
  record: RecordRef,
  reason: string
): Promise<void> {
  const pms = await holdersOf(transaction, record.projectId, ["PM"])

  await notify(transaction, {
    personIds: others(actor, pms),
    kind: "change_waiting",
    title: `A change to ${record.toolId} is waiting for your decision`,
    text: reason,
    projectId: record.projectId,
    recordId: record.id,
    path: toolPath(record.projectId, record.toolId),
  })
}

// The person who asked for a change, once the PM decides, unless they are the
// Client, who may ask for a change to a tool they write. A rejection carries
// its reason.
export async function notifyChangeDecided(
  transaction: Transaction,
  actor: string,
  record: RecordRef,
  requestedBy: string,
  outcome: "approved" | "rejected",
  rejection?: string
): Promise<void> {
  await notify(transaction, {
    personIds: await withoutClients(
      transaction,
      record.projectId,
      others(actor, [requestedBy])
    ),
    kind: "change_decided",
    title: `Your change to ${record.toolId} was ${outcome}`,
    text: rejection,
    projectId: record.projectId,
    recordId: record.id,
    path: toolPath(record.projectId, record.toolId),
  })
}

// Runs after the action's transaction commits. A failed email never fails the
// action: sendEmail logs a failed send itself, and anything that stops it
// before then, such as a bad address or no BETTER_AUTH_URL, leaves no email
// row, so it is logged here, without the address.
export async function sendNotificationEmails(
  database: Database,
  pending: readonly PendingEmail[],
  transport?: Transport
): Promise<void> {
  for (const email of pending) {
    try {
      const link = `${requireEnv("BETTER_AUTH_URL").replace(/\/+$/, "")}${email.path}`

      if (email.kind === "assigned") {
        await sendEmail(
          database,
          {
            to: email.to,
            kind: email.kind,
            data: { projectName: email.projectName, link },
            projectId: email.projectId,
            key: email.key,
          },
          transport
        )

        continue
      }

      await sendEmail(
        database,
        {
          to: email.to,
          kind: email.kind,
          data: { recordTitle: email.recordTitle, link },
          projectId: email.projectId,
          recordId: email.recordId,
          key: email.key,
        },
        transport
      )
    } catch (error) {
      console.error("Notification email dropped before sending", {
        key: email.key,
        kind: email.kind,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
}
