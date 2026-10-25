import type { ToolRegistry } from "@/server/tools/registry"
import { assertWorkflowMaps } from "@/server/workflow/check"
import { workflowMaps } from "@/server/workflow/workflow"

import { d11 } from "./wb01/tools/d1-1"
import { d110 } from "./wb01/tools/d1-10"
import { d111 } from "./wb01/tools/d1-11"
import { d112 } from "./wb01/tools/d1-12"
import { d113 } from "./wb01/tools/d1-13"
import { d114 } from "./wb01/tools/d1-14"
import { d115 } from "./wb01/tools/d1-15"
import { d116 } from "./wb01/tools/d1-16"
import { d12 } from "./wb01/tools/d1-2"
import { d13 } from "./wb01/tools/d1-3"
import { d14 } from "./wb01/tools/d1-4"
import { d15 } from "./wb01/tools/d1-5"
import { d16 } from "./wb01/tools/d1-6"
import { d17 } from "./wb01/tools/d1-7"
import { d18 } from "./wb01/tools/d1-8"
import { d19 } from "./wb01/tools/d1-9"
import { t3d13a } from "./wb01/tools/t3-d1-3a"
import { t3d115a } from "./wb01/tools/t3-d1-15a"
import { t3d18a } from "./wb01/tools/t3-d1-8a"

// The one file that lists every tool definition from every workbook.
export const allTools = [
  d11,
  d12,
  d13,
  t3d13a,
  d14,
  d15,
  d16,
  d17,
  d18,
  t3d18a,
  d19,
  d110,
  d111,
  d112,
  d113,
  d114,
  d115,
  t3d115a,
  d116,
]

// Fails when a workflow rule names a tool, field or option that is not
// registered, so a typo in the map stops the app from starting.
export function registerAllTools(registry: ToolRegistry) {
  for (const tool of allTools) {
    registry.registerTool(tool)
  }

  assertWorkflowMaps(workflowMaps, registry.listTools())
}
