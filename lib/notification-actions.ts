"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { requireSession } from "@/lib/session"
import { getDatabase } from "@/server/database"
import { markAllRead, markRead } from "@/server/notifications/notifications"

// Both only ever touch the signed-in person's own notifications: the person
// comes from the session, never from the caller. Revalidating sends the fresh
// count and list back with the same response.
export async function markNotificationReadAction(id: string): Promise<void> {
  const session = await requireSession()
  const parsed = z.uuid().safeParse(id)

  if (!parsed.success) {
    return
  }

  await markRead(getDatabase(), session.user.id, [parsed.data])

  revalidatePath("/", "layout")
}

export async function markAllNotificationsReadAction(): Promise<void> {
  const session = await requireSession()

  await markAllRead(getDatabase(), session.user.id)

  revalidatePath("/", "layout")
}
