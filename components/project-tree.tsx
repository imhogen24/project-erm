"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

import { stateLabel } from "@/components/state-badge"
import { ToolLock, ToolMark } from "@/components/tool-mark"
import { Folder, Tree } from "@/components/ui/file-tree"
import type { ProjectNav } from "@/lib/project-nav"

// The project's workbooks as folders and their tools as links, so a tool opens
// from anywhere in the project. The workbook of the open tool starts open.
export function ProjectTree({ project }: { project: ProjectNav }) {
  const pathname = usePathname()
  const current = pathname.split("/tools/")[1]

  const open =
    project.workbooks.find((workbook) =>
      workbook.tools.some((tool) => tool.toolId === current)
    ) ?? project.workbooks[0]

  return (
    <Tree
      key={open?.id}
      indicator
      initialExpandedItems={open ? [open.id] : []}
      aria-label="Project tools"
      className="min-h-0 flex-1 pb-2"
    >
      {project.workbooks.map((workbook) => (
        <Folder
          key={workbook.id}
          value={workbook.id}
          element={workbook.label}
          className="nav-folder"
        >
          {workbook.tools.length === 0 && (
            <p className="px-2 py-1.5 text-sm text-muted-foreground">
              No tools yet
            </p>
          )}
          {workbook.tools.map((tool) =>
            tool.open ? (
              <Link
                key={tool.toolId}
                href={`/projects/${project.id}/tools/${tool.toolId}`}
                aria-current={tool.toolId === current ? "page" : undefined}
                className="nav-tool"
              >
                <ToolMark state={tool.state} />
                <span className="sr-only">{stateLabel(tool.state)}: </span>
                <span className="min-w-0 flex-1 truncate" title={tool.name}>
                  {tool.name}
                </span>
                <ToolLock state={tool.state} />
              </Link>
            ) : (
              // Not open until the tool before it is locked, so not a link.
              <span
                key={tool.toolId}
                aria-disabled="true"
                data-shut="true"
                className="nav-tool"
              >
                <ToolMark state={tool.state} />
                <span className="sr-only">Not open yet: </span>
                <span className="min-w-0 flex-1 truncate" title={tool.name}>
                  {tool.name}
                </span>
                <ToolLock state={tool.state} />
              </span>
            )
          )}
        </Folder>
      ))}
    </Tree>
  )
}
