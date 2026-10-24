import { serviceTracks, type ServiceTrack } from "@/db/schema"
import type { ToolDefinition } from "@/server/tools/define-tool"

const tierOf: Record<ServiceTrack, 1 | 3> = { Tier_1: 1, Tier_3: 3 }

export function servesTrack(tool: ToolDefinition, track: ServiceTrack) {
  return tool.tier === "both" || tool.tier === tierOf[track]
}

export function tracksOf(tool: ToolDefinition): ServiceTrack[] {
  return serviceTracks.filter((track) => servesTrack(tool, track))
}

export type Catalog = {
  get: (id: string) => ToolDefinition | undefined
  inWorkbook: (workbook: string) => ToolDefinition[]
  // The tool a track uses for `id`: the tool itself, or the variant that
  // replaces it on that track. Undefined when the track skips it.
  onTrack: (id: string, track: ServiceTrack) => string | undefined
}

export function catalogOf(tools: readonly ToolDefinition[]): Catalog {
  const byId = new Map(tools.map((tool) => [tool.id, tool]))

  return {
    get: (id) => byId.get(id),
    inWorkbook: (workbook) =>
      tools.filter((tool) => tool.workbook === workbook),
    onTrack(id, track) {
      const tool = byId.get(id)

      if (tool && servesTrack(tool, track)) {
        return id
      }

      return tools.find(
        (variant) => variant.replaces === id && servesTrack(variant, track)
      )?.id
    },
  }
}
