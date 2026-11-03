import { afterAll, beforeEach, describe, expect, it } from "vitest"

import {
  createTestDatabase,
  resetTestData,
  restoreSystemPerson,
} from "@/db/testing"
import { systemActor } from "@/server/system/system"

import {
  listNotifications,
  markAllRead,
  markRead,
  notify,
  unreadCount,
} from "./notifications"

const database = createTestDatabase()

let ama: string

let kofi: string

async function addPerson(name: string) {
  const { rows } = await database.pool.query<{ id: string }>(
    "INSERT INTO people (name, email) VALUES ($1, $2) RETURNING id",
    [name, `${name.toLowerCase()}-${crypto.randomUUID()}@example.com`]
  )

  return rows[0]!.id
}

// Inserted directly, so a test can pick when it was made and whether it is
// read without going through notify.
async function addNotification(
  personId: string,
  { title = "Waiting", createdAt = new Date(), read = false } = {}
) {
  const { rows } = await database.pool.query<{ id: string }>(
    `INSERT INTO notifications (person_id, kind, title, path, created_at, read_at)
     VALUES ($1, 'tool_open', $2, '/projects', $3, $4) RETURNING id`,
    [personId, title, createdAt, read ? createdAt : null]
  )

  return rows[0]!.id
}

async function rowsFor(personId: string) {
  const { rows } = await database.pool.query<{
    id: string
    kind: string
    title: string
    text: string | null
    project_id: string | null
    record_id: string | null
    path: string
    read_at: Date | null
  }>("SELECT * FROM notifications WHERE person_id = $1", [personId])

  return rows
}

function notifyIn(personIds: string[]) {
  return database.transaction((transaction) =>
    notify(transaction, {
      personIds,
      kind: "approval_needed",
      title: "D1.2 needs your approval",
      path: "/projects/abc/tools/D1.2",
    })
  )
}

beforeEach(async () => {
  await resetTestData(database)
  await restoreSystemPerson(database)

  ama = await addPerson("Ama")
  kofi = await addPerson("Kofi")
})

afterAll(async () => {
  await database.pool.end()
})

describe("notify", () => {
  it("gives each person one unread notification", async () => {
    await notifyIn([ama, kofi])

    for (const person of [ama, kofi]) {
      const rows = await rowsFor(person)

      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject({
        kind: "approval_needed",
        title: "D1.2 needs your approval",
        text: null,
        project_id: null,
        record_id: null,
        path: "/projects/abc/tools/D1.2",
        read_at: null,
      })
    }
  })

  it("keeps the optional text, project and record", async () => {
    const project = await database.pool.query<{ id: string }>(
      "INSERT INTO projects (name, request_id, service_track) VALUES ('Boiler', 'T1-1', 'Tier_1') RETURNING id"
    )

    const projectId = project.rows[0]!.id

    const record = await database.pool.query<{ id: string }>(
      "INSERT INTO tool_records (project_id, tool_id, state) VALUES ($1, 'D1.2', 'submitted') RETURNING id",
      [projectId]
    )

    const recordId = record.rows[0]!.id

    await database.transaction((transaction) =>
      notify(transaction, {
        personIds: [ama],
        kind: "approval_needed",
        title: "D1.2 needs your approval",
        text: "Kofi submitted it",
        projectId,
        recordId,
        path: `/projects/${projectId}/tools/D1.2`,
      })
    )

    expect(await rowsFor(ama)).toEqual([
      expect.objectContaining({
        text: "Kofi submitted it",
        project_id: projectId,
        record_id: recordId,
      }),
    ])
  })

  it("saves nothing when its transaction is rolled back", async () => {
    await expect(
      database.transaction(async (transaction) => {
        await notify(transaction, {
          personIds: [ama],
          kind: "tool_open",
          title: "D1.3 is open",
          path: "/projects/abc/tools/D1.3",
        })

        throw new Error("The change failed")
      })
    ).rejects.toThrow("The change failed")

    expect(await rowsFor(ama)).toEqual([])
  })

  it("makes one notification for a person listed twice", async () => {
    await notifyIn([ama, ama])

    expect(await rowsFor(ama)).toHaveLength(1)
  })

  it("writes no row for the system person", async () => {
    await notifyIn([systemActor, ama])

    expect(await rowsFor(systemActor)).toEqual([])
    expect(await rowsFor(ama)).toHaveLength(1)
  })

  it("writes nothing for no one", async () => {
    await notifyIn([systemActor])

    const { rows } = await database.pool.query("SELECT id FROM notifications")

    expect(rows).toEqual([])
  })
})

describe("listNotifications", () => {
  it("returns only the person's own, newest first", async () => {
    await addNotification(ama, {
      title: "Old",
      createdAt: new Date("2026-10-01T00:00:00Z"),
    })
    await addNotification(kofi, {
      title: "Kofi's",
      createdAt: new Date("2026-10-02T00:00:00Z"),
    })
    await addNotification(ama, {
      title: "New",
      createdAt: new Date("2026-10-03T00:00:00Z"),
    })

    const list = await listNotifications(database, ama)

    expect(list.map((notification) => notification.title)).toEqual([
      "New",
      "Old",
    ])
  })

  it("leaves out read ones when unreadOnly is set", async () => {
    await addNotification(ama, { title: "Read", read: true })
    await addNotification(ama, { title: "Unread" })

    const list = await listNotifications(database, ama, { unreadOnly: true })

    expect(list.map((notification) => notification.title)).toEqual(["Unread"])
  })

  it("returns no more than the limit", async () => {
    for (let index = 0; index < 30; index++) {
      await addNotification(ama, {
        createdAt: new Date(Date.UTC(2026, 9, 1, 0, index)),
      })
    }

    const list = await listNotifications(database, ama, { limit: 20 })

    expect(list).toHaveLength(20)
    expect(list[0]!.createdAt).toEqual(new Date(Date.UTC(2026, 9, 1, 0, 29)))
  })
})

describe("unreadCount", () => {
  it("counts only the person's own unread", async () => {
    for (let index = 0; index < 3; index++) {
      await addNotification(ama)
    }

    for (let index = 0; index < 2; index++) {
      await addNotification(ama, { read: true })
    }

    await addNotification(kofi)

    expect(await unreadCount(database, ama)).toBe(3)
  })
})

describe("markRead", () => {
  it("sets read_at and drops the count by one", async () => {
    const first = await addNotification(ama)

    await addNotification(ama)

    await markRead(database, ama, [first])

    const rows = await rowsFor(ama)

    expect(rows.find((row) => row.id === first)!.read_at).toBeInstanceOf(Date)
    expect(await unreadCount(database, ama)).toBe(1)
  })

  it("ignores another person's notification without an error", async () => {
    const kofis = await addNotification(kofi)

    await expect(markRead(database, ama, [kofis])).resolves.toBeUndefined()

    expect((await rowsFor(kofi))[0]!.read_at).toBeNull()
  })

  it("keeps the time it was first read", async () => {
    const readAt = new Date("2026-10-01T00:00:00Z")
    const id = await addNotification(ama, { createdAt: readAt, read: true })

    await markRead(database, ama, [id])

    expect((await rowsFor(ama))[0]!.read_at).toEqual(readAt)
  })

  it("does nothing with no IDs", async () => {
    await addNotification(ama)

    await markRead(database, ama, [])

    expect(await unreadCount(database, ama)).toBe(1)
  })
})

describe("markAllRead", () => {
  it("reads all the person's own and leaves others' untouched", async () => {
    await addNotification(ama)
    await addNotification(ama)
    await addNotification(kofi)

    await markAllRead(database, ama)

    expect(await unreadCount(database, ama)).toBe(0)
    expect(await unreadCount(database, kofi)).toBe(1)
  })
})

describe("notifications", () => {
  it("refuses a row for the system person written straight to the database", async () => {
    await expect(addNotification(systemActor)).rejects.toThrow(
      /notifications_not_system/
    )
  })

  it.each(["projects", "https://example.com", "//example.com"])(
    "refuses the path %s, which is not inside the app",
    async (path) => {
      await expect(
        database.pool.query(
          "INSERT INTO notifications (person_id, kind, title, path) VALUES ($1, 'tool_open', 'Open', $2)",
          [ama, path]
        )
      ).rejects.toThrow(/notifications_path_in_app/)
    }
  )

  it("are never deleted", async () => {
    const id = await addNotification(ama)

    await expect(
      database.pool.query("DELETE FROM notifications WHERE id = $1", [id])
    ).rejects.toThrow(/cannot be deleted/)
  })

  it("can change nothing but an empty read_at", async () => {
    const id = await addNotification(ama)
    const read = await addNotification(ama, { read: true })

    await expect(
      database.pool.query(
        "UPDATE notifications SET title = 'Changed' WHERE id = $1",
        [id]
      )
    ).rejects.toThrow(/only be marked read/)

    await expect(
      database.pool.query(
        "UPDATE notifications SET read_at = NULL WHERE id = $1",
        [read]
      )
    ).rejects.toThrow(/only be marked read/)
  })
})
