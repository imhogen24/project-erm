import {
  ArrowLeftIcon,
  FolderSimpleIcon,
  UserPlusIcon,
  UsersThreeIcon,
} from "@phosphor-icons/react/ssr"
import Image from "next/image"
import Link from "next/link"
import type { ReactNode } from "react"

import { NotificationBell } from "@/components/notifications/notification-bell"
import { ProjectTree } from "@/components/project-tree"
import { Sheet } from "@/components/sheet"
import { SidebarProjects } from "@/components/sidebar-projects"
import { UserMenu } from "@/components/user-menu"
import type { ProjectNav } from "@/lib/project-nav"
import { isItAdmin } from "@/lib/roles"
import { loadSidebarList } from "@/lib/sidebar-list"
import { requireSession } from "@/lib/session"

type Props = {
  name: string
  // Set inside a project: its name and its workbooks and tools as a tree.
  project?: ProjectNav
  // Which page the person is on, outside a project, and whether to offer the
  // IT/Admin pages: invite people and assign staff.
  current?: "projects" | "invites" | "team"
  canInvite?: boolean
}

function NavLink({
  href,
  icon,
  active,
  count,
  countLabel,
  children,
}: {
  href: string
  icon: ReactNode
  active: boolean
  count?: number
  countLabel?: string
  children: ReactNode
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className="nav-link"
    >
      {icon}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {count !== undefined && count > 0 && (
        <span className="nav-count">
          {count}
          <span className="sr-only"> {countLabel}</span>
        </span>
      )}
    </Link>
  )
}

// Floats over the drafting table on wide screens, with its edges on the grid:
// one square in, three squares wide. Inside a project it is that project's
// navigation. On narrower screens the top bar is shown instead.
export async function AppSidebar({
  name,
  project,
  current = "projects",
  canInvite = false,
}: Props) {
  const session = await requireSession()
  const admin = await isItAdmin(session.user.id)
  const list = project ? undefined : await loadSidebarList()

  return (
    <Sheet className="sidebar-frame z-20 hidden flex-col shadow-xl shadow-foreground/10 xl:flex">
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
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="nav-section">
                <NavLink
                  href="/"
                  icon={<ArrowLeftIcon aria-hidden className="nav-icon" />}
                  active={false}
                >
                  Your projects
                </NavLink>
                <Link
                  href={`/projects/${project.id}`}
                  title={project.name}
                  className="project-card"
                >
                  <span aria-hidden className="option-mark">
                    {project.tier}
                  </span>
                  <span className="flex min-w-0 flex-col">
                    <span className="project-card-name">{project.name}</span>
                    <span className="project-card-meta">
                      {project.requestId}
                    </span>
                  </span>
                </Link>
              </div>
              <ProjectTree project={project} />
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
              <div className="nav-section">
                <p className="nav-group-title">Work</p>
                <NavLink
                  href="/"
                  icon={<FolderSimpleIcon aria-hidden className="nav-icon" />}
                  active={current === "projects"}
                >
                  Your projects
                </NavLink>
              </div>
              {canInvite && (
                <div className="nav-section">
                  <p className="nav-group-title">Admin</p>
                  <NavLink
                    href="/admin/invites"
                    icon={<UserPlusIcon aria-hidden className="nav-icon" />}
                    active={current === "invites"}
                  >
                    Invite people
                  </NavLink>
                  <NavLink
                    href="/admin/team"
                    icon={<UsersThreeIcon aria-hidden className="nav-icon" />}
                    active={current === "team"}
                    count={list?.rows.length}
                    countLabel="projects need a team"
                  >
                    Assign staff
                  </NavLink>
                </div>
              )}
              {list && <SidebarProjects list={list} />}
            </div>
          )}
        </nav>
        <UserMenu
          name={name}
          detail={admin ? "IT/Admin" : session.user.email}
        />
      </aside>
    </Sheet>
  )
}
