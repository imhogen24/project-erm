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

// Up to two capital letters from the person's name.
function initialsOf(name: string) {
  const letters = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]!.toUpperCase())

  return letters.join("") || "?"
}

// Who is signed in, as an avatar, and the way to sign out. The name shows in a
// tooltip on hover and on keyboard focus.
export function UserMenu({ name }: Readonly<{ name: string }>) {
  return (
    <div className="flex shrink-0 items-center justify-between border-t px-4 py-3">
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
      <SignOutButton icon={<SignOutIcon aria-hidden className="size-5" />} />
    </div>
  )
}
