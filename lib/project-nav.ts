import type { ToolState } from "@/lib/tool-state"

// What the sidebar shows inside a project: its workbooks, each with its tools
// and where each tool stands.
export type ProjectNav = {
  id: string
  name: string
  requestId: string
  // "T1" or "T3", for the project card at the top of the sidebar.
  tier: string
  workbooks: {
    id: string
    label: string
    // Whether the tool can be opened: false until the tool before it is locked.
    tools: { toolId: string; name: string; state: ToolState; open: boolean }[]
  }[]
}
