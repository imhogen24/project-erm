import { cache } from "react"

import { timeAgo } from "@/lib/time-ago"
import { getDatabase } from "@/server/database"
import {
  listNotifications,
  unreadCount,
} from "@/server/notifications/notifications"

// The list shows the latest 20. Older ones are out of scope.
const latest = 20

// What the bell and its panel draw for one notification.
export type NotificationView = {
  id: string
  title: string
  path: string
  createdAt: string
  timeAgo: string
  read: boolean
}

// The sidebar and the mobile bar both draw a bell on the same page, so this is
// asked once per request, not once per bell. The times are worked out here, on
// the server, so the browser's clock never changes what is shown.
export const loadNotifications = cache(async (personId: string) => {
  const database = getDatabase()

  const [unread, list] = await Promise.all([
    unreadCount(database, personId),
    listNotifications(database, personId, { limit: latest }),
  ])

  const now = Date.now()

  const notifications: NotificationView[] = list.map((notification) => ({
    id: notification.id,
    title: notification.title,
    path: notification.path,
    createdAt: notification.createdAt.toISOString(),
    timeAgo: timeAgo(notification.createdAt, now),
    read: notification.readAt !== null,
  }))

  return { unread, notifications }
})
