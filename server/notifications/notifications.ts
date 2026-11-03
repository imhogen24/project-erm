import { and, count, desc, eq, inArray, isNull } from "drizzle-orm"

import type { Database } from "@/db"
import {
  notificationKinds,
  notifications,
  type NotificationKind,
} from "@/db/schema"

import type { Transaction } from "@/server/audit/audit"
import { systemActor } from "@/server/system/system"

export { notificationKinds, type NotificationKind }

export type Notification = {
  id: string
  kind: NotificationKind
  title: string
  text: string | null
  projectId: string | null
  recordId: string | null
  path: string
  createdAt: Date
  readAt: Date | null
}

export type NewNotification = {
  personIds: string[]
  kind: NotificationKind
  title: string
  text?: string
  projectId?: string
  recordId?: string
  path: string
}

export type ListOptions = {
  unreadOnly?: boolean
  limit?: number
}

const defaultLimit = 20

const columns = {
  id: notifications.id,
  kind: notifications.kind,
  title: notifications.title,
  text: notifications.text,
  projectId: notifications.projectId,
  recordId: notifications.recordId,
  path: notifications.path,
  createdAt: notifications.createdAt,
  readAt: notifications.readAt,
}

// Runs inside the caller's transaction, so a notification and the change it
// describes are saved together or not at all. Each person gets one row, however
// often they are listed, and the system person gets none.
export async function notify(
  transaction: Transaction,
  notification: NewNotification
): Promise<void> {
  const { personIds, ...rest } = notification

  const people = [...new Set(personIds)].filter(
    (personId) => personId !== systemActor
  )

  if (people.length === 0) {
    return
  }

  await transaction
    .insert(notifications)
    .values(people.map((personId) => ({ personId, ...rest })))
}

// Only the actor's own, newest first.
export async function listNotifications(
  database: Database,
  actor: string,
  { unreadOnly = false, limit = defaultLimit }: ListOptions = {}
): Promise<Notification[]> {
  return database
    .select(columns)
    .from(notifications)
    .where(
      and(
        eq(notifications.personId, actor),
        unreadOnly ? isNull(notifications.readAt) : undefined
      )
    )
    .orderBy(desc(notifications.createdAt), desc(notifications.id))
    .limit(limit)
}

export async function unreadCount(
  database: Database,
  actor: string
): Promise<number> {
  const [row] = await database
    .select({ unread: count() })
    .from(notifications)
    .where(and(eq(notifications.personId, actor), isNull(notifications.readAt)))

  return row!.unread
}

// Only the actor's own are marked. Another person's ID is left alone, and one
// already read keeps the time it was first read.
export async function markRead(
  database: Database,
  actor: string,
  ids: string[]
): Promise<void> {
  if (ids.length === 0) {
    return
  }

  await database
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notifications.personId, actor),
        inArray(notifications.id, ids),
        isNull(notifications.readAt)
      )
    )
}

export async function markAllRead(
  database: Database,
  actor: string
): Promise<void> {
  await database
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.personId, actor), isNull(notifications.readAt)))
}
