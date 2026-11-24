import type { JsonObject } from "@/db/schema"
import type { ToolDefinition } from "@/lib/tool-definition"

// What each field shown from another field's answer says for these values,
// such as D2.3's Next Step Directive for its status. Empty text while the
// answer has none, so the field shows its note.
export function shownFromValues(
  tool: Pick<ToolDefinition, "fields">,
  values: JsonObject
): Record<string, string> {
  return Object.fromEntries(
    tool.fields.flatMap((field) => {
      const from = "shownFrom" in field ? field.shownFrom : undefined

      if (!from) {
        return []
      }

      const answer = values[from.field]

      const shown = Object.entries(from.values).find(
        ([option]) => option === answer
      )

      return [[field.key, shown?.[1] ?? ""]]
    })
  )
}

// The fields whose answers other fields are shown from, so a form follows
// them as they change.
export function shownFromSources(
  tool: Pick<ToolDefinition, "fields">
): string[] {
  return tool.fields.flatMap((field) =>
    "shownFrom" in field && field.shownFrom ? [field.shownFrom.field] : []
  )
}
