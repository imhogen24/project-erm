import Image from "next/image"
import Link from "next/link"

import { SignOutButton } from "@/components/sign-out-button"
import { cn } from "@/lib/utils"

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
              className="text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:bg-primary/10"
            >
              Team
            </Link>
          </>
        )}
        <SignOutButton />
      </div>
    </header>
  )
}
