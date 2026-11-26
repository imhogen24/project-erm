"use client"

import Link from "next/link"
import { Fragment } from "react"
import { usePathname } from "next/navigation"

import { EmptyState } from "@/components/empty-state"
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
            <EmptyState
              size="inline"
              className="px-2 py-1.5"
              title="No tools yet"
            />
          )}
          {workbook.tools.map((tool) =>
            tool.open ? (
              <Fragment key={tool.toolId}>
                <Link
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
                {tool.cycles?.map((entry) => (
                  // Each payment milestone's record of the tool, such as
                  // "D3.3 · 2.2 Fabrication Milestone".
                  <Link
                    key={entry.cycle}
                    href={`/projects/${project.id}/tools/${tool.toolId}?cycle=${entry.cycle}`}
                    className="nav-tool ps-6"
                  >
                    <ToolMark state={entry.state} />
                    <span className="sr-only">{stateLabel(entry.state)}: </span>
                    <span
                      className="min-w-0 flex-1 truncate"
                      title={`${tool.toolId} · ${entry.label}`}
                    >
                      {tool.toolId} · {entry.label}
                    </span>
                    <ToolLock state={entry.state} />
                  </Link>
                ))}
              </Fragment>
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
