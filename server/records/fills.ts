import type { Database } from "@/db"
import type { JsonObject } from "@/db/schema"
import { fieldFills, type Fills } from "@/lib/placeholders"
import { INITIAL_DRAFT } from "@/lib/initial-draft"
import { STANDARD_CONTRACT } from "@/lib/standard-contract"
import { draftFills } from "@/server/contract/initial-draft"
import { contractFills } from "@/server/contract/standard-contract"
import { tools } from "@/server/tools/registry"

// What the system fills into the [bracketed] names of a tool's fixed text,
// read live from the project. Empty for a tool with none.
export async function systemFillsOf(
  database: Database,
  projectId: string,
  toolId: string
): Promise<Fills> {
  switch (toolId) {
    case STANDARD_CONTRACT: {
      return await contractFills(database, projectId)
    }

    case INITIAL_DRAFT: {
      return await draftFills(database, projectId)
    }

    default: {
      return {}
    }
  }
}

// Every fill of a record as it is now: the system's, and those from the
// record's own fields. The PDF export shows the text filled in with these.
export async function fillsOf(
  database: Database,
  projectId: string,
  toolId: string,
  values: JsonObject
): Promise<Fills> {
  return {
    ...(await systemFillsOf(database, projectId, toolId)),
    ...fieldFills(tools.getTool(toolId)?.fills, (field) => values[field]),
  }
}
