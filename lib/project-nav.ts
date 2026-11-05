import type { ToolState } from "@/lib/tool-state"

// What the sidebar shows inside a project: its workbooks, each with its tools
// and where each tool stands.
export type ProjectNav = {
  id: string
  name: string
  workbooks: {
    id: string
    label: string
    tools: { toolId: string; name: string; state: ToolState }[]
  }[]
}
