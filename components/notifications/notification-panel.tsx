"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useTransition, type MouseEvent, type ReactNode } from "react"

import { Button } from "@/components/ui/button"
import {
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from "@/lib/notification-actions"
import type { NotificationView } from "@/lib/notifications"
import { cn } from "@/lib/utils"

type Props = {
  heading: ReactNode
  // In the full-width sheet the title and the button sit on separate rows, and
  // the title row leaves room for the sheet's close button.
  stacked: boolean
  unread: number
  notifications: NotificationView[]
  className?: string
  onNavigate: () => void
}

export function NotificationPanel({
  heading,
  stacked,
  unread,
  notifications,
  className,
  onNavigate,
}: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  function markAll() {
    startTransition(async () => {
      await markAllNotificationsReadAction()
    })
  }

  // A plain click is saved as read first and then goes to the path, so the next
  // page already has the new count. A click with Ctrl, Cmd, Shift or Alt keeps
  // the browser's own behaviour (a new tab or window) and is saved alongside.
  async function open(
    event: MouseEvent<HTMLAnchorElement>,
    notification: NotificationView
  ) {
    const modified =
      event.metaKey || event.ctrlKey || event.shiftKey || event.altKey

    if (modified) {
      if (!notification.read) {
        void markNotificationReadAction(notification.id)
      }

      return
    }

    event.preventDefault()
    onNavigate()

    try {
      if (!notification.read) {
        await markNotificationReadAction(notification.id)
      }
    } finally {
      // Go there even if saving failed. The bell shows the real count next time.
      router.push(notification.path)
    }
  }

  return (
    <div className={cn("flex min-h-0 min-w-0 flex-col", className)}>
      <div
        className={cn(
          "flex shrink-0 gap-1 border-b px-4 py-3",
          stacked
            ? "flex-col items-start pr-14"
            : "items-center justify-between"
        )}
      >
        {heading}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn(stacked && "-ml-2.5")}
          disabled={unread === 0 || pending}
          onClick={markAll}
        >
          Mark all read
        </Button>
      </div>

      {notifications.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-muted-foreground">
          You have no notifications.
        </p>
      ) : (
        <ul className="min-h-0 flex-1 divide-y overflow-x-hidden overflow-y-auto">
          {notifications.map((notification) => (
            <li key={notification.id}>
              <Link
                href={notification.path}
                data-testid="notification-item"
                data-read={notification.read ? "true" : "false"}
                onClick={(event) => open(event, notification)}
                className={cn(
                  "flex min-w-0 items-start gap-3 px-4 py-3 outline-none hover:bg-primary/5 focus-visible:bg-primary/10",
                  notification.read && "text-muted-foreground"
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "mt-1.5 size-2 shrink-0 rounded-full",
                    notification.read ? "bg-transparent" : "bg-primary"
                  )}
                />
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span
                    className={cn(
                      "text-sm leading-snug break-words",
                      !notification.read && "font-medium text-foreground"
                    )}
                  >
                    {notification.title}
                  </span>
                  <span className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <time dateTime={notification.createdAt}>
                      {notification.timeAgo}
                    </time>
                    {notification.read ? (
                      <span>(read)</span>
                    ) : (
                      <span className="sr-only">Unread</span>
                    )}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
