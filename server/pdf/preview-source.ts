import type { PreviewSource } from "@/server/tools/define-tool"
import { tools } from "@/server/tools/registry"

// What a PDF preview points to, by the name people know it by, such as
// "D1.15 Project Brief & Draft Budget" or "Company SLA".
export function sourceName(source: PreviewSource) {
  if ("file" in source) {
    return source.title
  }

  const tool = tools.getTool(source.tool)

  return tool ? `${tool.id} ${tool.name}` : source.tool
}
