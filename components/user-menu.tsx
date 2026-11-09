"use client"

import { SignOutIcon } from "@phosphor-icons/react"

import { SignOutButton } from "@/components/sign-out-button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { initialsOf } from "@/lib/initials"

// Who is signed in: an avatar, the name and a second line (the role or the
// email), and the way to sign out. The avatar also has a tooltip.
export function UserMenu({
  name,
  detail,
}: Readonly<{ name: string; detail?: string }>) {
  return (
    <div className="flex shrink-0 items-center gap-3 border-t px-4 py-3">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label={`Signed in as ${name}`}
              className="rounded-[var(--radius-control)] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              <Avatar className="size-10">
                <AvatarFallback className="bg-primary text-xs font-medium text-primary-foreground">
                  {initialsOf(name)}
                </AvatarFallback>
              </Avatar>
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" align="start">
            {`Signed in as ${name}`}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <span className="user-identity">
        <span className="user-identity-name">{name}</span>
        {detail && <span className="user-identity-detail">{detail}</span>}
      </span>
      <SignOutButton icon={<SignOutIcon aria-hidden className="size-5" />} />
    </div>
  )
}
