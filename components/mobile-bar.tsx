import { SignOutIcon } from "@phosphor-icons/react/ssr"
import Image from "next/image"
import Link from "next/link"

import { CountBadge } from "@/components/count-badge"
import { NotificationBell } from "@/components/notifications/notification-bell"
import { SignOutButton } from "@/components/sign-out-button"
import { requireSession } from "@/lib/session"
import { projectsWaitingForTeam } from "@/lib/team"
import { cn } from "@/lib/utils"

// How many projects wait for a team, after the Team link. Only rendered for an
// IT/Admin, the only person who may ask. From RDP-127.
async function TeamWaiting() {
  const session = await requireSession()
  const waiting = await projectsWaitingForTeam(session.user.id)

  return (
    <CountBadge
      count={waiting.length}
      one="project needs a team"
      many="projects need a team"
    />
  )
}

// The slim top bar for screens too narrow for the title bar or the sidebar.
export function MobileBar({
  className,
  canInvite = false,
}: {
  className?: string
  canInvite?: boolean
}) {
  return (
    <header
      className={cn(
        "flex h-14 items-center justify-between border-b border-foreground/70 bg-background px-4",
        className
      )}
    >
      <Link href="/" className="outline-none focus-visible:bg-primary/10">
        <Image
          src="/logo.png"
          alt="IMHOGEN ERM"
          width={112}
          height={27}
          priority
          className="h-auto w-24"
        />
      </Link>
      <div className="flex items-center gap-4">
        {canInvite && (
          <>
            <Link
              href="/admin/invites"
              className="text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:bg-primary/10"
            >
              Invite people
            </Link>
            <Link
              href="/admin/team"
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:bg-primary/10"
            >
              Team
              <TeamWaiting />
            </Link>
          </>
        )}
        <NotificationBell variant="sheet" />
        <SignOutButton icon={<SignOutIcon aria-hidden className="size-5" />} />
      </div>
    </header>
  )
}
