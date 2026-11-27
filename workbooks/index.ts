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
import { d21 } from "./wb02/tools/d2-1"
import { d22 } from "./wb02/tools/d2-2"
import { d23 } from "./wb02/tools/d2-3"
import { d24 } from "./wb02/tools/d2-4"
import { d25 } from "./wb02/tools/d2-5"
import { d26 } from "./wb02/tools/d2-6"
import { d27 } from "./wb02/tools/d2-7"
import { d28 } from "./wb02/tools/d2-8"
import { d29 } from "./wb02/tools/d2-9"
import { d210 } from "./wb02/tools/d2-10"
import { d211 } from "./wb02/tools/d2-11"
import { d212 } from "./wb02/tools/d2-12"
import { d213 } from "./wb02/tools/d2-13"
import { d214 } from "./wb02/tools/d2-14"
import { t3d22a } from "./wb02/tools/t3-d2-2a"
import { d31 } from "./wb03/tools/d3-1"
import { d32 } from "./wb03/tools/d3-2"
import { d33 } from "./wb03/tools/d3-3"
import { d34 } from "./wb03/tools/d3-4"
import { d35 } from "./wb03/tools/d3-5"
import { d36 } from "./wb03/tools/d3-6"
import { d37 } from "./wb03/tools/d3-7"
import { d38 } from "./wb03/tools/d3-8"
import { d39 } from "./wb03/tools/d3-9"
import { d310 } from "./wb03/tools/d3-10"
import { d311 } from "./wb03/tools/d3-11"

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
  d21,
  d22,
  t3d22a,
  d23,
  d24,
  d25,
  d26,
  d27,
  d28,
  d29,
  d210,
  d211,
  d212,
  d213,
  d214,
  d31,
  d32,
  d33,
  d34,
  d35,
  d36,
  d37,
  d38,
  d39,
  d310,
  d311,
]

// Fails when a workflow rule names a tool, field or option that is not
// registered, so a typo in the map stops the app from starting.
export function registerAllTools(registry: ToolRegistry) {
  for (const tool of allTools) {
    registry.registerTool(tool)
  }

  assertWorkflowMaps(workflowMaps, registry.listTools())
}
