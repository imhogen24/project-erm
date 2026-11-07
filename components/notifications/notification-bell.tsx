import { loadNotifications } from "@/lib/notifications"
import { requireSession } from "@/lib/session"

import { NotificationMenu } from "./notification-menu"

// A Server Component. Every page behind the sign-in already has a person, so
// the bell is only ever drawn for someone signed in.
export async function NotificationBell({
  variant,
}: Readonly<{
  // "popover" beside the sidebar, "sheet" from the mobile bar.
  variant: "popover" | "sheet"
}>) {
  const session = await requireSession()
  const { unread, notifications } = await loadNotifications(session.user.id)

  return (
    <NotificationMenu
      variant={variant}
      unread={unread}
      notifications={notifications}
    />
  )
}
