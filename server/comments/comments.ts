import { and, asc, eq, inArray, isNull, ne } from "drizzle-orm"

import type { Database } from "@/db"
import { people, recordComments, toolRecords, type Role } from "@/db/schema"
import { writeAudit } from "@/server/audit/audit"
import { notifyCommented, notifyReplied } from "@/server/notifications/raise"
import {
  PermissionDeniedError,
  roleAllows,
  rolesOn,
} from "@/server/permissions/permissions"
import { RecordNotFoundError } from "@/server/records/records"

export class CommentNotFoundError extends Error {}

export class CommentBodyMissingError extends Error {}

export type Comment = {
  id: string
  authorName: string
  authorRole: Role
  body: string
  createdAt: Date
}

// A comment with its replies, oldest first. Resolving a comment resolves the
// thread.
export type Thread = Comment & {
  replies: Comment[]
  resolvedAt: Date | null
  resolvedByName: string | null
}

type Target = { id: string; projectId: string; toolId: string }

// The roles a person may comment as on a tool: those they hold on the project
// that may open it. The Client is never one: the team's comments are the
// team's own.
function commentingRoles(held: readonly Role[], toolId: string): Role[] {
  return held.filter(
    (role) => role !== "Client" && roleAllows([role], toolId, "read")
  )
}

// Whether someone holding these roles may read and write the team's comments
// on a tool.
export function mayComment(held: readonly Role[], toolId: string): boolean {
  return commentingRoles(held, toolId).length > 0
}

// The role a comment is signed with: one that approves the tool, else one
// that writes it, else the first other role that may open it.
function speakingAs(held: readonly Role[], toolId: string): Role {
  const fitting = commentingRoles(held, toolId)

  return (
    fitting.find((role) => roleAllows([role], toolId, "approve")) ??
    fitting.find((role) => roleAllows([role], toolId, "write")) ??
    fitting[0]!
  )
}

type Reader = Pick<Database, "select">

async function targetOf(database: Reader, recordId: string): Promise<Target> {
  const [record] = await database
    .select({
      id: toolRecords.id,
      projectId: toolRecords.projectId,
      toolId: toolRecords.toolId,
    })
    .from(toolRecords)
    .where(and(eq(toolRecords.id, recordId), ne(toolRecords.state, "void")))

  if (!record) {
    throw new RecordNotFoundError(`No record with id ${recordId}`)
  }

  return record
}

// The person's roles that may comment on the record, refused if there are
// none.
async function assertMayComment(
  database: Reader,
  actor: string,
  record: Target
): Promise<Role[]> {
  const held = await rolesOn(database, actor, record.projectId)

  if (!mayComment(held, record.toolId)) {
    throw new PermissionDeniedError(
      `This person may not comment on ${record.toolId}`
    )
  }

  return held
}

function requireBody(body: string): string {
  const trimmed = body.trim()

  if (trimmed === "") {
    throw new CommentBodyMissingError("Write a comment first")
  }

  return trimmed
}

// Adds a comment to a record, or a reply when `parentId` names a comment on
// the same record. A reply to a reply joins the same thread, under the comment
// that starts it.
// A new comment tells the tool's writers and approvers; a reply tells whoever
// wrote the comment it answers. It works at any stage of the record.
export async function addComment(
  database: Database,
  actor: string,
  input: { recordId: string; body: string; parentId?: string }
): Promise<{ id: string }> {
  const record = await targetOf(database, input.recordId)
  const held = await assertMayComment(database, actor, record)
  const body = requireBody(input.body)

  return database.transaction(async (transaction) => {
    let parent:
      { id: string; parentId: string | null; authorId: string } | undefined

    if (input.parentId) {
      ;[parent] = await transaction
        .select({
          id: recordComments.id,
          parentId: recordComments.parentId,
          authorId: recordComments.authorId,
        })
        .from(recordComments)
        .where(
          and(
            eq(recordComments.id, input.parentId),
            eq(recordComments.recordId, record.id)
          )
        )

      if (!parent) {
        throw new CommentNotFoundError("That comment is no longer there")
      }
    }

    const [comment] = await transaction
      .insert(recordComments)
      .values({
        recordId: record.id,
        projectId: record.projectId,
        parentId: parent ? (parent.parentId ?? parent.id) : undefined,
        authorId: actor,
        authorRole: speakingAs(held, record.toolId),
        body,
      })
      .returning({ id: recordComments.id })

    await writeAudit(
      transaction,
      {
        recordId: record.id,
        projectId: record.projectId,
        actor,
        action: "commented",
      },
      [
        {
          field: "comment",
          oldValue: null,
          newValue: {
            id: comment!.id,
            parentId: parent ? (parent.parentId ?? parent.id) : null,
            body,
          },
        },
      ]
    )

    if (parent) {
      await notifyReplied(
        transaction,
        actor,
        record,
        comment!.id,
        parent.authorId,
        body
      )
    } else {
      await notifyCommented(transaction, actor, record, comment!.id, body)
    }

    return comment!
  })
}

// Marks a comment, with its replies, as resolved. Anyone who may comment may
// resolve. A thread resolved already stays as it was.
export async function resolveComment(
  database: Database,
  actor: string,
  commentId: string
): Promise<void> {
  const [comment] = await database
    .select({
      recordId: recordComments.recordId,
      parentId: recordComments.parentId,
    })
    .from(recordComments)
    .where(eq(recordComments.id, commentId))

  if (!comment) {
    throw new CommentNotFoundError("That comment is no longer there")
  }

  const record = await targetOf(database, comment.recordId)

  await assertMayComment(database, actor, record)

  const threadId = comment.parentId ?? commentId

  await database.transaction(async (transaction) => {
    const [resolved] = await transaction
      .update(recordComments)
      .set({ resolvedAt: new Date(), resolvedBy: actor })
      .where(
        and(
          eq(recordComments.id, threadId),
          eq(recordComments.recordId, record.id),
          isNull(recordComments.resolvedAt)
        )
      )
      .returning({ resolvedAt: recordComments.resolvedAt })

    if (!resolved) {
      return
    }

    await writeAudit(
      transaction,
      {
        recordId: record.id,
        projectId: record.projectId,
        actor,
        action: "comment_resolved",
      },
      [
        {
          field: "comment",
          oldValue: { id: threadId, resolved: false },
          newValue: { id: threadId, resolved: true },
        },
      ]
    )
  })
}

// The record's comments, each with its replies, oldest first, for someone who
// may comment on it. Anyone else, the client among them, gets none.
export async function listComments(
  database: Database,
  actor: string,
  recordId: string
): Promise<Thread[] | null> {
  const record = await targetOf(database, recordId)
  const held = await rolesOn(database, actor, record.projectId)

  if (!mayComment(held, record.toolId)) {
    return null
  }

  const rows = await database
    .select({
      id: recordComments.id,
      parentId: recordComments.parentId,
      authorName: people.name,
      authorRole: recordComments.authorRole,
      body: recordComments.body,
      createdAt: recordComments.createdAt,
      resolvedAt: recordComments.resolvedAt,
      resolvedBy: recordComments.resolvedBy,
    })
    .from(recordComments)
    .innerJoin(people, eq(people.id, recordComments.authorId))
    .where(eq(recordComments.recordId, record.id))
    .orderBy(asc(recordComments.createdAt), asc(recordComments.id))

  const resolvers = [
    ...new Set(rows.flatMap((row) => (row.resolvedBy ? [row.resolvedBy] : []))),
  ]

  const names = new Map(
    resolvers.length === 0
      ? []
      : (
          await database
            .select({ id: people.id, name: people.name })
            .from(people)
            .where(inArray(people.id, resolvers))
        ).map((person) => [person.id, person.name])
  )

  const threads = rows
    .filter((row) => row.parentId === null)
    .map((row): Thread => ({
      id: row.id,
      authorName: row.authorName,
      authorRole: row.authorRole,
      body: row.body,
      createdAt: row.createdAt,
      resolvedAt: row.resolvedAt,
      resolvedByName: row.resolvedBy
        ? (names.get(row.resolvedBy) ?? null)
        : null,
      replies: [],
    }))

  const byId = new Map(threads.map((thread) => [thread.id, thread]))

  for (const row of rows) {
    if (row.parentId !== null) {
      byId.get(row.parentId)?.replies.push({
        id: row.id,
        authorName: row.authorName,
        authorRole: row.authorRole,
        body: row.body,
        createdAt: row.createdAt,
      })
    }
  }

  return threads
}
