"use client"

import { BellIcon } from "@phosphor-icons/react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"

import type { NotificationView } from "@/lib/notifications"

import { NotificationPanel } from "./notification-panel"

type Props = {
  variant: "popover" | "sheet"
  unread: number
  notifications: NotificationView[]
}

// The bell and what it opens. The count and the list come from the server and
// are replaced whenever a notification is read, so nothing is kept here but
// whether the panel is open.
export function NotificationMenu({ variant, unread, notifications }: Props) {
  const [open, setOpen] = useState(false)

  const trigger = (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      data-testid="notification-bell"
      aria-label={
        unread > 0 ? `Notifications, ${unread} unread` : "Notifications"
      }
      className="relative size-10"
    >
      <BellIcon className="size-5" />
      {unread > 0 && (
        <span
          data-testid="notification-count"
          aria-hidden
          className="absolute top-0.5 right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] leading-none font-semibold text-primary-foreground"
        >
          {unread > 99 ? "99+" : unread}
        </span>
      )}
    </Button>
  )

  if (variant === "popover") {
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>{trigger}</PopoverTrigger>
        <PopoverContent
          side="right"
          align="start"
          sideOffset={12}
          aria-label="Notifications"
          className="w-80 gap-0 p-0 text-sm"
        >
          <NotificationPanel
            heading={<h2 className="text-sm font-semibold">Notifications</h2>}
            stacked={false}
            unread={unread}
            notifications={notifications}
            className="max-h-[32rem]"
            onNavigate={() => setOpen(false)}
          />
        </PopoverContent>
      </Popover>
    )
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent side="right" className="gap-0 p-0 data-[side=right]:w-full">
        <SheetDescription className="sr-only">
          Your latest notifications
        </SheetDescription>
        <NotificationPanel
          heading={
            <SheetTitle className="text-sm font-semibold">
              Notifications
            </SheetTitle>
          }
          stacked
          unread={unread}
          notifications={notifications}
          className="h-full"
          onNavigate={() => setOpen(false)}
        />
      </SheetContent>
    </Sheet>
  )
}
