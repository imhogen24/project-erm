import type { JsonObject } from "@/db/schema"
import { COST_ESTIMATION, costCells } from "@/lib/cost-estimation"
import { DRAFT_INVOICE, invoiceCells } from "@/lib/draft-invoice"
import { T3_QUOTE, quoteCells } from "@/lib/project-brief"

export function hasLiveValues(toolId: string) {
  return (
    toolId === COST_ESTIMATION ||
    toolId === T3_QUOTE ||
    toolId === DRAFT_INVOICE
  )
}

// What a tool's system cells show while the sheet is being typed, worked out
// from what is typed: a field's value by its key, and a table's rows with
// their system cells filled in. Undefined for a tool with no such sums.
export function liveValues(
  toolId: string,
  values: JsonObject
): JsonObject | undefined {
  switch (toolId) {
    case COST_ESTIMATION: {
      return costCells(values)
    }

    case T3_QUOTE: {
      return quoteCells(values)
    }

    case DRAFT_INVOICE: {
      return invoiceCells(values)
    }

    default: {
      return undefined
    }
  }
}
