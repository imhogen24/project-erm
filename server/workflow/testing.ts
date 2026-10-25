import type { Workbook } from "@/server/tools/define-tool"

import { loadWorkflow, workflowMaps } from "./workflow"

// For a test about something other than the route. Puts the real maps in force
// with the order inside each listed workbook taken out, so its listed tools
// start as soon as the workbook opens. Workbooks still open in the real order.
export function loadUnorderedWorkflow(
  byWorkbook: Partial<Record<Workbook, string[]>>
) {
  loadWorkflow(
    workflowMaps.map((map) => {
      const ids = byWorkbook[map.workbook]

      return ids
        ? {
            workbook: map.workbook,
            opens: map.opens,
            tools: ids.map((tool) => ({ tool })),
          }
        : map
    })
  )
}
