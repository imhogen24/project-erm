import Image from "next/image"
import Link from "next/link"

import { BackLink } from "@/components/back-link"
import { NotificationBell } from "@/components/notifications/notification-bell"
import { ProjectTree } from "@/components/project-tree"
import { Sheet } from "@/components/sheet"
import type { ProjectNav } from "@/lib/project-nav"
import { UserMenu } from "@/components/user-menu"
import { cn } from "@/lib/utils"

type Props = {
  name: string
  // Set inside a project: its name and its workbooks and tools as a tree.
  project?: ProjectNav
  // Which page the person is on, outside a project, and whether to offer the
  // IT/Admin pages: invite people and assign staff.
  current?: "projects" | "invites" | "team"
  canInvite?: boolean
}

const linkClass =
  "block truncate border-l-2 border-transparent px-4 py-2 text-sm text-muted-foreground outline-none transition-colors hover:border-primary hover:bg-primary/5 hover:text-foreground focus-visible:bg-primary/10"

// Floats over the drafting table on wide screens, with its edges on the grid:
// one square in, three squares wide. Inside a project it is that project's
// navigation. On narrower screens the top bar is shown instead.
export function AppSidebar({
  name,
  project,
  current = "projects",
  canInvite = false,
}: Props) {
  return (
    <Sheet className="fixed top-[var(--cell)] bottom-[var(--cell)] left-[var(--cell)] z-20 hidden w-[calc(var(--cell)*3)] flex-col shadow-xl shadow-foreground/10 xl:flex">
      <aside aria-label="Sidebar" className="flex min-h-0 flex-1 flex-col">
        <div className="flex h-16 shrink-0 items-center justify-between gap-2 border-b pr-3 pl-5">
          <Link href="/" className="outline-none focus-visible:bg-primary/10">
            <Image
              src="/logo.png"
              alt="IMHOGEN ERM"
              width={112}
              height={27}
              priority
              className="h-auto w-28"
            />
          </Link>
          <NotificationBell variant="popover" />
        </div>
        <nav aria-label="Main" className="flex min-h-0 flex-1 flex-col">
          {project ? (
            <>
              <BackLink href="/" className="border-b">
                Your projects
              </BackLink>
              <p
                title={project.name}
                className="border-b px-5 py-4 text-sm leading-snug font-medium break-words"
              >
                {project.name}
              </p>
              <ProjectTree project={project} />
            </>
          ) : (
            <>
              <Link
                href="/"
                aria-current={current === "projects" ? "page" : undefined}
                className={cn(
                  linkClass,
                  "py-3",
                  current === "projects" &&
                    "border-primary bg-primary/10 font-medium text-foreground"
                )}
              >
                Your projects
              </Link>
              {canInvite && (
                <Link
                  href="/admin/invites"
                  aria-current={current === "invites" ? "page" : undefined}
                  className={cn(
                    linkClass,
                    "py-3",
                    current === "invites" &&
                      "border-primary bg-primary/10 font-medium text-foreground"
                  )}
                >
                  Invite people
                </Link>
              )}
              {canInvite && (
                <Link
                  href="/admin/team"
                  aria-current={current === "team" ? "page" : undefined}
                  className={cn(
                    linkClass,
                    "py-3",
                    current === "team" &&
                      "border-primary bg-primary/10 font-medium text-foreground"
                  )}
                >
                  Assign staff
                </Link>
              )}
            </>
          )}
        </nav>
        <UserMenu name={name} />
      </aside>
    </Sheet>
  )
}
