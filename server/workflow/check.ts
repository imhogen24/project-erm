import { serviceTracks, type ServiceTrack } from "@/db/schema"
import type { ToolDefinition } from "@/server/tools/define-tool"

import {
  requiredTools,
  type Condition,
  type Requirement,
  type WorkbookMap,
} from "./map"
import { catalogOf, servesTrack, tracksOf, type Catalog } from "./tracks"

export class WorkflowMapError extends Error {}

function checkRequirement(
  catalog: Catalog,
  who: string,
  requirement: Requirement,
  tracks: readonly ServiceTrack[],
  broken: string[]
) {
  const names = requiredTools(requirement)

  if (names.length === 0) {
    broken.push(`${who} waits for an empty list of tools`)
  }

  for (const name of names) {
    if (name === who) {
      broken.push(`${who} waits for itself`)
    } else if (!catalog.get(name)) {
      broken.push(`${who} waits for ${name}, which does not exist`)
    } else {
      for (const track of tracks) {
        if (!catalog.onTrack(name, track)) {
          broken.push(
            `${who} waits for ${name}, which ${track} projects do not use`
          )
        }
      }
    }
  }
}

// Only a select or a yes/no field can decide the route, so every value the
// condition names must be one the field can hold.
function checkCondition(
  catalog: Catalog,
  who: string,
  condition: Condition,
  tracks: readonly ServiceTrack[],
  broken: string[]
) {
  const tool = catalog.get(condition.tool)
  const field = tool?.fields.find((entry) => entry.key === condition.field)
  const at = `${condition.tool}.${condition.field}`

  if (!tool) {
    broken.push(`${who} reads ${condition.tool}, which does not exist`)

    return
  }

  if (!field) {
    broken.push(`${who} reads ${at}, which ${tool.id} does not have`)

    return
  }

  for (const track of tracks) {
    if (!servesTrack(tool, track)) {
      broken.push(`${who} reads ${tool.id}, which ${track} projects do not use`)
    }
  }

  if (condition.oneOf.length === 0) {
    broken.push(`${who} expects ${at} to be one of an empty list`)
  }

  for (const value of condition.oneOf) {
    if (field.type === "select") {
      if (!field.options.some((option) => option === value)) {
        broken.push(
          `${who} expects ${at} to be ${JSON.stringify(value)}, which is not one of its options`
        )
      }
    } else if (field.type === "boolean") {
      if (value !== true && value !== false) {
        broken.push(
          `${who} expects ${at} to be ${JSON.stringify(value)}, but it is a yes/no field`
        )
      }
    } else {
      broken.push(
        `${who} reads ${at}, a ${field.type} field, but only a select or yes/no field can decide the route`
      )

      return
    }
  }
}

function checkMap(
  catalog: Catalog,
  map: WorkbookMap,
  own: ToolDefinition[],
  broken: string[]
) {
  const ruled = new Set<string>()

  for (const rule of map.tools) {
    const tool = catalog.get(rule.tool)

    if (!tool) {
      broken.push(
        `${map.workbook} has a rule for ${rule.tool}, which does not exist`
      )

      continue
    }

    if (tool.workbook !== map.workbook) {
      broken.push(`${rule.tool} is in ${tool.workbook}, not ${map.workbook}`)
    }

    if (ruled.has(rule.tool)) {
      broken.push(`${rule.tool} has two rules`)
    }

    ruled.add(rule.tool)

    if (rule.repeats && !map.cycles) {
      broken.push(
        `${rule.tool} repeats, but ${map.workbook} does not say how many cycles there are`
      )
    }

    const tracks = tracksOf(tool)

    if (rule.after) {
      checkRequirement(catalog, rule.tool, rule.after, tracks, broken)
    }

    if (rule.when) {
      checkCondition(catalog, rule.tool, rule.when, tracks, broken)
    }
  }

  // A workbook with no rules opens all its tools at once, on purpose.
  if (map.tools.length > 0) {
    for (const tool of own) {
      if (!ruled.has(tool.id)) {
        broken.push(`${tool.id} is in ${map.workbook}, but has no rule there`)
      }
    }
  }

  if (map.opens) {
    checkRequirement(
      catalog,
      map.workbook,
      map.opens.after,
      map.opens.tracks ?? serviceTracks,
      broken
    )
  }

  for (const stop of map.stops ?? []) {
    const tool = catalog.get(stop.tool)

    checkCondition(
      catalog,
      `The hard stop on ${stop.tool}`,
      stop,
      tool ? tracksOf(tool) : [],
      broken
    )
  }

  if (map.cycles) {
    const { count, closedBy } = map.cycles
    const counter = catalog.get(count.tool)
    const field = counter?.fields.find((entry) => entry.key === count.field)

    if (!counter) {
      broken.push(
        `${map.workbook} counts cycles in ${count.tool}, which does not exist`
      )
    } else if (!field) {
      broken.push(
        `${map.workbook} counts cycles in ${count.tool}.${count.field}, which ${count.tool} does not have`
      )
    } else if (field.type !== "number" && field.type !== "table") {
      broken.push(
        `${map.workbook} counts cycles in ${count.tool}.${count.field}, a ${field.type} field, but only a number or a table can count them`
      )
    }

    if (map.tools.some((rule) => rule.tool === count.tool && rule.repeats)) {
      broken.push(
        `${map.workbook} counts cycles in ${count.tool}, which itself repeats`
      )
    }

    if (!map.tools.some((rule) => rule.tool === closedBy && rule.repeats)) {
      broken.push(
        `${map.workbook} closes a cycle with ${closedBy}, which is not one of its repeating tools`
      )
    }
  }
}

// Describes every rule that names a tool, field or option that does not
// exist. A map is checked once its workbook has a tool, since until then
// nothing in it can start.
export function brokenWorkflowRules(
  maps: readonly WorkbookMap[],
  tools: readonly ToolDefinition[]
): string[] {
  const catalog = catalogOf(tools)
  const broken: string[] = []
  const seen = new Set<string>()

  for (const map of maps) {
    if (seen.has(map.workbook)) {
      broken.push(`${map.workbook} has two maps`)
    }

    seen.add(map.workbook)

    const own = catalog.inWorkbook(map.workbook)

    if (own.length > 0) {
      checkMap(catalog, map, own, broken)
    }
  }

  return broken
}

export function assertWorkflowMaps(
  maps: readonly WorkbookMap[],
  tools: readonly ToolDefinition[]
): void {
  const broken = brokenWorkflowRules(maps, tools)

  if (broken.length > 0) {
    throw new WorkflowMapError(
      `The workflow map is broken: ${broken.join("; ")}`
    )
  }
}
