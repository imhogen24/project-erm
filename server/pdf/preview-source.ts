import type { ServiceTrack } from "@/db/schema"
import type { PreviewSource } from "@/server/tools/define-tool"
import { tools } from "@/server/tools/registry"
import { catalogOf } from "@/server/workflow/tracks"

// The tool a preview of `id` shows on a project of this track: the tool
// itself, or the variant that takes its place there, such as T3.D1.15a for
// D1.15 on Tier 3. Undefined when the track skips the tool.
export function shownTool(id: string, track: ServiceTrack) {
  return catalogOf(tools.listTools()).onTrack(id, track)
}

// What a PDF preview points to, by the name people know it by, such as
// "D1.15 Project Brief & Draft Budget" or "Company SLA". Given the project's
// track, a tool is named as the tool that track shows.
export function sourceName(source: PreviewSource, track?: ServiceTrack) {
  if ("file" in source) {
    return source.title
  }

  const id = (track && shownTool(source.tool, track)) ?? source.tool
  const tool = tools.getTool(id)

  return tool ? `${tool.id} ${tool.name}` : id
}
