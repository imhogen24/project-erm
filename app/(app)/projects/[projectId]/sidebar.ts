import type { ProjectNav } from "@/lib/project-nav"
import type { ProjectOverview } from "@/server/projects/projects"
import { workbooks, type Workbook } from "@/server/tools/define-tool"

// "wb01" is shown as "Workbook 1", with the figure 1 drawn large beside it.
export function workbookNumber(workbook: string) {
  return /^wb0*(\d+)$/.exec(workbook)?.[1]
}

export function workbookTitle(workbook: string) {
  const number = workbookNumber(workbook)

  return number ? `Workbook ${number}` : workbook
}

// The short name each workbook goes by in the tree.
const shortNames: Record<Workbook, string> = {
  wb01: "Onboarding",
  wb02: "Contracting",
  wb03: "Payments",
  wb04: "Team planning",
  wb05: "Engineering design",
  wb06: "Client review",
  wb07: "Procurement",
  wb08: "Fabrication",
  wb09: "Quality control",
  wb10: "Documentation",
  wb11: "Delivery",
  wb12: "Post-delivery support",
  wb13: "Marketing",
}

// "Onboarding (WB01)".
function treeLabel(workbook: Workbook) {
  return `${shortNames[workbook]} (${workbook.toUpperCase()})`
}

// Every workbook, in order, each with the project's tools in it. A workbook
// with no tools built yet is still listed, so the tree shows the whole path.
export function projectNav(overview: ProjectOverview): ProjectNav {
  return {
    id: overview.id,
    name: overview.name,
    workbooks: workbooks.map((id) => ({
      id,
      label: treeLabel(id),
      tools: overview.tools
        .filter((tool) => tool.workbook === id)
        .map(({ toolId, name, state }) => ({ toolId, name, state })),
    })),
  }
}
