import Image from "next/image"
import Link from "next/link"

import { BackLink } from "@/components/back-link"
import { Sheet } from "@/components/sheet"
import { SignOutButton } from "@/components/sign-out-button"

type Props = {
  name: string
  // Set inside a project: its name and the workbooks to jump to.
  project?: { name: string; workbooks: { id: string; label: string }[] }
}

const linkClass =
  "block truncate border-l-2 border-transparent px-4 py-2 text-sm text-muted-foreground outline-none transition-colors hover:border-primary hover:bg-primary/5 hover:text-foreground focus-visible:bg-primary/10"

// Floats over the drafting table on wide screens, with its edges on the grid:
// one square in, three squares wide. Inside a project it is that project's
// navigation. On narrower screens the top bar is shown instead.
export function AppSidebar({ name, project }: Props) {
  return (
    <Sheet className="fixed top-[var(--cell)] bottom-[var(--cell)] left-[var(--cell)] z-20 hidden w-[calc(var(--cell)*3)] flex-col shadow-xl shadow-foreground/10 xl:flex">
      <aside aria-label="Sidebar" className="flex min-h-0 flex-1 flex-col">
        <Link
          href="/"
          className="flex h-16 shrink-0 items-center border-b px-5 outline-none focus-visible:bg-primary/10"
        >
          <Image
            src="/logo.png"
            alt="IMHOGEN ERM"
            width={112}
            height={27}
            priority
            className="h-auto w-28"
          />
        </Link>
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
              <ul className="min-h-0 flex-1 overflow-y-auto py-2">
                {project.workbooks.map((workbook) => (
                  <li key={workbook.id}>
                    <a href={`#${workbook.id}`} className={linkClass}>
                      {workbook.label}
                    </a>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <Link
              href="/"
              aria-current="page"
              className={`${linkClass} border-primary bg-primary/10 py-3 font-medium text-foreground`}
            >
              Your projects
            </Link>
          )}
        </nav>
        <div className="flex shrink-0 flex-col gap-3 border-t p-4">
          <div className="flex min-w-0 flex-col">
            <span className="text-xs text-muted-foreground">Signed in as</span>
            <span className="truncate text-sm font-medium">{name}</span>
          </div>
          <SignOutButton />
        </div>
      </aside>
    </Sheet>
  )
}
