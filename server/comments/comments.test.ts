import { afterAll, beforeEach, describe, expect, it } from "vitest"

import type { Role } from "@/db/schema"
import { createTestDatabase, resetTestData } from "@/db/testing"
import { PermissionDeniedError } from "@/server/permissions/permissions"
import { registerTestTools } from "@/server/tools/testing"

import {
  CommentBodyMissingError,
  CommentNotFoundError,
  addComment,
  listComments,
  mayComment,
  resolveComment,
} from "./comments"

const database = createTestDatabase()

// On D1.2 the OM writes, the PM approves (as an extra approver) and the CR
// only reads.
registerTestTools({ wb01: ["D1.2"] })

let projectId: string

async function addPerson(name: string, held: Role[] = []) {
  const { rows } = await database.pool.query<{ id: string }>(
    "INSERT INTO people (name, email) VALUES ($1, $2) RETURNING id",
    [name, `${name.toLowerCase()}-${Math.random()}@example.com`]
  )

  for (const role of held) {
    await database.pool.query(
      "INSERT INTO person_project_roles (person_id, project_id, role) VALUES ($1, $2, $3)",
      [rows[0]!.id, projectId, role]
    )
  }

  return rows[0]!.id
}

// Each record gets its own cycle, as a tool has one live record per cycle.
let cycle = 0

async function addRecord(
  state: "draft" | "submitted" | "locked" = "submitted"
) {
  cycle += 1

  const { rows } = await database.pool.query<{ id: string }>(
    "INSERT INTO tool_records (project_id, tool_id, cycle, state) VALUES ($1, 'D1.2', $2, $3) RETURNING id",
    [projectId, cycle, state]
  )

  return rows[0]!.id
}

async function notificationsOf(personId: string) {
  const { rows } = await database.pool.query<{
    kind: string
    path: string
  }>(
    "SELECT kind, path FROM notifications WHERE person_id = $1 ORDER BY created_at",
    [personId]
  )

  return rows
}

async function auditActions(recordId: string) {
  const { rows } = await database.pool.query<{ action: string }>(
    "SELECT action FROM audit_log WHERE record_id = $1 ORDER BY created_at",
    [recordId]
  )

  return rows.map((row) => row.action)
}

beforeEach(async () => {
  await resetTestData(database)

  const { rows } = await database.pool.query<{ id: string }>(
    "INSERT INTO projects (name, request_id, service_track) VALUES ('Boiler', 'T1-1789787898386', 'Tier_1') RETURNING id"
  )

  projectId = rows[0]!.id
})

afterAll(async () => {
  await database.pool.end()
})

describe("who may comment", () => {
  it("is anyone on the team who may open the tool, never the client", () => {
    expect(mayComment(["PM"], "D1.2")).toBe(true)
    expect(mayComment(["CR"], "D1.2")).toBe(true)
    expect(mayComment(["Client"], "D1.1")).toBe(false)
    expect(mayComment(["Client", "OM"], "D1.1")).toBe(true)
    expect(mayComment([], "D1.2")).toBe(false)
  })
})

describe("comments and replies", () => {
  it("tells the writer of a new comment, and the commenter of a reply", async () => {
    const om = await addPerson("Efua", ["OM"])
    const pm = await addPerson("Ama", ["PM"])
    const cr = await addPerson("Kofi", ["CR"])
    const recordId = await addRecord()

    const comment = await addComment(database, pm, {
      recordId,
      body: "Is the second photo the right site?",
    })

    expect(await notificationsOf(om)).toEqual([
      {
        kind: "commented",
        path: `/projects/${projectId}/tools/D1.2#comment-${comment.id}`,
      },
    ])
    expect(await notificationsOf(pm)).toEqual([])
    expect(await notificationsOf(cr)).toEqual([])

    const reply = await addComment(database, om, {
      recordId,
      body: "Yes, the client confirmed it.",
      parentId: comment.id,
    })

    expect(await notificationsOf(pm)).toEqual([
      {
        kind: "comment_replied",
        path: `/projects/${projectId}/tools/D1.2#comment-${reply.id}`,
      },
    ])

    const threads = await listComments(database, cr, recordId)

    expect(threads).toMatchObject([
      {
        id: comment.id,
        authorName: "Ama",
        authorRole: "PM",
        body: "Is the second photo the right site?",
        resolvedAt: null,
        replies: [
          {
            id: reply.id,
            authorName: "Efua",
            authorRole: "OM",
            body: "Yes, the client confirmed it.",
          },
        ],
      },
    ])
    expect(await auditActions(recordId)).toEqual(["commented", "commented"])
  })

  it("puts a reply to a reply in the same thread and tells its author", async () => {
    const om = await addPerson("Efua", ["OM"])
    const pm = await addPerson("Ama", ["PM"])
    const cr = await addPerson("Kofi", ["CR"])
    const recordId = await addRecord()

    const comment = await addComment(database, pm, { recordId, body: "One" })

    const reply = await addComment(database, om, {
      recordId,
      body: "Two",
      parentId: comment.id,
    })

    await addComment(database, cr, {
      recordId,
      body: "Three",
      parentId: reply.id,
    })

    const [thread] = (await listComments(database, pm, recordId))!

    expect(thread!.replies.map((each) => each.body)).toEqual(["Two", "Three"])
    expect(
      (await notificationsOf(om)).filter(
        (row) => row.kind === "comment_replied"
      )
    ).toHaveLength(1)
  })

  it("works at every stage, including a locked record", async () => {
    const pm = await addPerson("Ama", ["PM"])

    for (const state of ["draft", "submitted", "locked"] as const) {
      const recordId = await addRecord(state)

      await addComment(database, pm, { recordId, body: `On a ${state}` })

      expect(await listComments(database, pm, recordId)).toHaveLength(1)
    }
  })

  it("refuses an empty comment", async () => {
    const pm = await addPerson("Ama", ["PM"])
    const recordId = await addRecord()

    await expect(
      addComment(database, pm, { recordId, body: "   " })
    ).rejects.toBeInstanceOf(CommentBodyMissingError)
  })

  it("refuses a reply to a comment on another record", async () => {
    const pm = await addPerson("Ama", ["PM"])
    const first = await addRecord()
    const second = await addRecord("locked")

    const comment = await addComment(database, pm, {
      recordId: first,
      body: "One",
    })

    await expect(
      addComment(database, pm, {
        recordId: second,
        body: "Two",
        parentId: comment.id,
      })
    ).rejects.toBeInstanceOf(CommentNotFoundError)
  })
})

describe("who sees comments", () => {
  it("shows the client and outsiders nothing and refuses their comments", async () => {
    const pm = await addPerson("Ama", ["PM"])
    const client = await addPerson("Kwaku", ["Client"])
    const outsider = await addPerson("Yaw")
    const recordId = await addRecord()

    await addComment(database, pm, { recordId, body: "For the team" })

    for (const person of [client, outsider]) {
      expect(await listComments(database, person, recordId)).toBeNull()

      await expect(
        addComment(database, person, { recordId, body: "Hello" })
      ).rejects.toBeInstanceOf(PermissionDeniedError)
    }
  })
})

describe("resolving", () => {
  it("resolves the whole thread, from the comment or a reply, once", async () => {
    const om = await addPerson("Efua", ["OM"])
    const pm = await addPerson("Ama", ["PM"])
    const recordId = await addRecord()

    const comment = await addComment(database, pm, { recordId, body: "One" })

    const reply = await addComment(database, om, {
      recordId,
      body: "Two",
      parentId: comment.id,
    })

    await resolveComment(database, om, reply.id)

    const [thread] = (await listComments(database, pm, recordId))!

    expect(thread!.resolvedAt).toBeInstanceOf(Date)
    expect(thread!.resolvedByName).toBe("Efua")
    expect(thread!.replies).toHaveLength(1)

    await resolveComment(database, pm, comment.id)

    expect(
      (await auditActions(recordId)).filter(
        (action) => action === "comment_resolved"
      )
    ).toHaveLength(1)
  })

  it("refuses someone who may not comment", async () => {
    const pm = await addPerson("Ama", ["PM"])
    const outsider = await addPerson("Yaw")
    const recordId = await addRecord()
    const comment = await addComment(database, pm, { recordId, body: "One" })

    await expect(
      resolveComment(database, outsider, comment.id)
    ).rejects.toBeInstanceOf(PermissionDeniedError)
  })
})
