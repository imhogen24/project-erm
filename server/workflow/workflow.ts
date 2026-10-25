import { and, eq, ne } from "drizzle-orm"
import { z } from "zod"

import type { Database } from "@/db"
import {
  projects,
  toolRecords,
  type JsonObject,
  type ProjectStatus,
  type RecordState,
  type ServiceTrack,
} from "@/db/schema"
import { writeAudit, type Transaction } from "@/server/audit/audit"
import { tools, type ToolRegistry } from "@/server/tools/registry"

import { assertWorkflowMaps } from "./check"
import {
  requiredTools,
  type Condition,
  type HardStop,
  type Requirement,
  type ToolRule,
  type WorkbookMap,
} from "./map"
import { catalogOf, servesTrack, type Catalog } from "./tracks"
import { wb01 } from "./wb01"
import { wb02 } from "./wb02"
import { wb03 } from "./wb03"
import { wb04 } from "./wb04"
import { wb05 } from "./wb05"

export { WorkflowMapError } from "./check"

export class ToolNotAvailableError extends Error {}

// One map per workbook. A workbook with no map yet opens none of its tools.
export const workflowMaps: readonly WorkbookMap[] = [
  wb01,
  wb02,
  wb03,
  wb04,
  wb05,
]

let active: readonly WorkbookMap[] = workflowMaps

// Checks the maps against the registry's tools and puts them in force. The
// real maps are in force from the start and checked by `registerAllTools`; a
// test loads its own.
export function loadWorkflow(
  maps: readonly WorkbookMap[],
  registry: ToolRegistry = tools
): void {
  assertWorkflowMaps(maps, registry.listTools())
  active = maps
}

// Whether the tool runs once per payment milestone in the maps in force.
export function repeatsPerCycle(toolId: string): boolean {
  return active.some((map) =>
    map.tools.some((rule) => rule.tool === toolId && rule.repeats)
  )
}

export type OpenTool = { toolId: string; cycle: number }

type LiveRecord = {
  toolId: string
  cycle: number
  state: RecordState
  payload: JsonObject
}

type Project = { serviceTrack: ServiceTrack; status: ProjectStatus }

// Open with the cycle a new record gets, or closed with what is missing.
type Verdict = { cycle: number; missing: string[] }

function listed(values: Condition["oneOf"]) {
  return values.map((value) => JSON.stringify(value)).join(" or ")
}

function stopMatches(stop: HardStop, payload: JsonObject) {
  return isOneOf(stop.oneOf, payload[stop.field])
}

// A value the record does not hold, or holds as another type, matches none.
function isOneOf(
  values: Condition["oneOf"],
  value: JsonObject[string] | undefined
) {
  return values.some((option) => option === value)
}

// Everything the route depends on, read once per question.
class Route {
  private readonly catalog: Catalog

  constructor(
    private readonly project: Project,
    private readonly records: readonly LiveRecord[],
    private readonly maps: readonly WorkbookMap[]
  ) {
    this.catalog = catalogOf(tools.listTools())
  }

  private get track() {
    return this.project.serviceTrack
  }

  private locked(toolId: string, cycle: number) {
    return this.records.find(
      (record) =>
        record.toolId === toolId &&
        record.cycle === cycle &&
        record.state === "locked"
    )
  }

  private started(toolId: string, cycle: number) {
    return this.records.some(
      (record) => record.toolId === toolId && record.cycle === cycle
    )
  }

  private repeats(toolId: string) {
    return this.maps.some((map) =>
      map.tools.some((rule) => rule.tool === toolId && rule.repeats)
    )
  }

  // A repeating tool waits for the other repeating tools of its own cycle.
  // Anything else waits for cycle 1, so WB04 opens on the first payment.
  private cycleFor(
    waiting: ToolRule | undefined,
    toolId: string,
    cycle: number
  ) {
    return waiting?.repeats && this.repeats(toolId) ? cycle : 1
  }

  private named(toolId: string, cycle: number) {
    return this.repeats(toolId) ? `${toolId} of cycle ${cycle}` : toolId
  }

  // The hard stop whose answer is on a locked record, if any.
  stopped(): { stop: HardStop; value: JsonObject[string] } | undefined {
    for (const map of this.maps) {
      for (const stop of map.stops ?? []) {
        const hit = this.records.find(
          (record) =>
            record.toolId === stop.tool &&
            record.state === "locked" &&
            stopMatches(stop, record.payload)
        )

        if (hit) {
          return { stop, value: hit.payload[stop.field] }
        }
      }
    }

    return undefined
  }

  private unmet(
    requirement: Requirement,
    waiting: ToolRule | undefined,
    cycle: number
  ): string[] {
    const tools = requiredTools(requirement).map((id) => {
      const used = this.catalog.onTrack(id, this.track) ?? id

      return { id: used, cycle: this.cycleFor(waiting, used, cycle) }
    })

    const open = tools.filter((tool) => this.locked(tool.id, tool.cycle))

    if ("all" in requirement) {
      return tools
        .filter((tool) => !open.includes(tool))
        .map((tool) => `${this.named(tool.id, tool.cycle)} is not locked yet`)
    }

    return open.length > 0
      ? []
      : [
          `none of ${tools.map((tool) => this.named(tool.id, tool.cycle)).join(", ")} is locked yet`,
        ]
  }

  private unmetCondition(
    condition: Condition,
    waiting: ToolRule,
    cycle: number
  ): string[] {
    const at = this.cycleFor(waiting, condition.tool, cycle)
    const record = this.locked(condition.tool, at)

    if (isOneOf(condition.oneOf, record?.payload[condition.field])) {
      return []
    }

    // A missing record is already said by an `all` that names it. An `any` can
    // be met by another tool, so the condition must still say it here.
    if (
      !record &&
      waiting.after &&
      "all" in waiting.after &&
      waiting.after.all.includes(condition.tool)
    ) {
      return []
    }

    return [
      `${this.named(condition.tool, at)} is not locked with ${condition.field} ${listed(condition.oneOf)}`,
    ]
  }

  // The map check allows only a number field or a table here, so the value is
  // a number, a list of rows, or not filled in.
  private cycleCount(map: WorkbookMap): number {
    const { count } = map.cycles!
    const value = this.locked(count.tool, 1)?.payload[count.field]

    return (
      z.number().safeParse(value).data ??
      z.array(z.unknown()).safeParse(value).data?.length ??
      0
    )
  }

  private unmetCycle(map: WorkbookMap, cycle: number): string[] {
    const { count, closedBy } = map.cycles!
    const missing: string[] = []

    if (!this.locked(count.tool, 1)) {
      missing.push(`${count.tool} is not locked yet`)
    } else if (cycle > this.cycleCount(map)) {
      const total = this.cycleCount(map)

      missing.push(
        `${count.tool} sets ${total} payment milestone${total === 1 ? "" : "s"}, so there is no cycle ${cycle}`
      )
    }

    if (cycle > 1 && !this.locked(closedBy, cycle - 1)) {
      missing.push(`${closedBy} of cycle ${cycle - 1} is not locked yet`)
    }

    return missing
  }

  // Whether `toolId` can start in `cycle`, or the first cycle it has no
  // record in when no cycle is given.
  verdict(toolId: string, cycle?: number): Verdict {
    const tool = this.catalog.get(toolId)!
    const map = this.maps.find((entry) => entry.workbook === tool.workbook)
    const rule = map?.tools.find((entry) => entry.tool === toolId)
    const repeating = rule?.repeats === true

    let at = cycle ?? 1

    if (cycle === undefined && repeating) {
      while (this.started(toolId, at)) {
        at++
      }
    }

    const missing: string[] = []

    if (this.project.status !== "active") {
      missing.push(`the project is ${this.project.status}`)
    }

    const stopped = this.stopped()

    if (stopped) {
      missing.push(
        `the route ended when ${stopped.stop.tool} was locked with ${stopped.stop.field} ${JSON.stringify(stopped.value)}`
      )
    }

    if (!map) {
      missing.push(`${tool.workbook} has no workflow map yet`)

      return { cycle: at, missing }
    }

    if (!servesTrack(tool, this.track)) {
      missing.push(`${this.track} projects do not use ${toolId}`)
    }

    if (map.opens?.tracks && !map.opens.tracks.includes(this.track)) {
      missing.push(`${this.track} projects skip ${map.workbook}`)
    } else if (map.opens) {
      missing.push(...this.unmet(map.opens.after, undefined, at))
    }

    if (map.tools.length > 0 && !rule) {
      missing.push(`${toolId} has no rule in the ${map.workbook} map`)
    }

    if (!repeating && at !== 1) {
      missing.push(`${toolId} does not repeat, so it only has cycle 1`)
    }

    if (rule?.after) {
      missing.push(...this.unmet(rule.after, rule, at))
    }

    if (rule?.when) {
      missing.push(...this.unmetCondition(rule.when, rule, at))
    }

    if (repeating) {
      missing.push(...this.unmetCycle(map, at))
    }

    if (this.started(toolId, at)) {
      missing.push(
        repeating
          ? `${toolId} already has a record in cycle ${at}`
          : `${toolId} already has a record`
      )
    }

    return { cycle: at, missing }
  }

  openTools(): OpenTool[] {
    const open: OpenTool[] = []

    for (const map of this.maps) {
      for (const tool of this.catalog.inWorkbook(map.workbook)) {
        const { cycle, missing } = this.verdict(tool.id)

        if (missing.length === 0) {
          open.push({ toolId: tool.id, cycle })
        }
      }
    }

    return open
  }
}

async function routeOf(
  transaction: Transaction,
  projectId: string
): Promise<Route> {
  const [project] = await transaction
    .select({ serviceTrack: projects.serviceTrack, status: projects.status })
    .from(projects)
    .where(eq(projects.id, projectId))

  if (!project) {
    throw new Error(`No project with id ${projectId}`)
  }

  const records = await transaction
    .select({
      toolId: toolRecords.toolId,
      cycle: toolRecords.cycle,
      state: toolRecords.state,
      payload: toolRecords.payload,
    })
    .from(toolRecords)
    .where(
      and(eq(toolRecords.projectId, projectId), ne(toolRecords.state, "void"))
    )

  return new Route(project, records, active)
}

// The tools that can be started on the project now, each with the cycle its
// new record gets. Only locked records count.
export async function availableTools(
  database: Database,
  projectId: string
): Promise<OpenTool[]> {
  return database.transaction(async (transaction) =>
    (await routeOf(transaction, projectId)).openTools()
  )
}

// Runs inside the transaction that creates the record, and returns the cycle
// the record gets.
export async function assertAvailable(
  transaction: Transaction,
  projectId: string,
  toolId: string,
  cycle?: number
): Promise<number> {
  const verdict = (await routeOf(transaction, projectId)).verdict(toolId, cycle)

  if (verdict.missing.length > 0) {
    throw new ToolNotAvailableError(
      `${toolId} cannot be started: ${verdict.missing.join("; ")}`
    )
  }

  return verdict.cycle
}

// Runs inside the transaction that locks the record. When the locked answer is
// a hard stop, the project takes the stop's status and becomes read only.
export async function applyHardStop(
  transaction: Transaction,
  actor: string,
  record: { projectId: string; toolId: string; payload: JsonObject }
): Promise<void> {
  const stop = active
    .flatMap((map) => map.stops ?? [])
    .find(
      (entry) =>
        entry.tool === record.toolId && stopMatches(entry, record.payload)
    )

  if (!stop) {
    return
  }

  // The same lock the update takes, so records being created at this moment,
  // which hold a key share lock, are not waited on.
  const [current] = await transaction
    .select({ status: projects.status })
    .from(projects)
    .where(eq(projects.id, record.projectId))
    .for("no key update")

  await transaction
    .update(projects)
    .set({ status: stop.status })
    .where(eq(projects.id, record.projectId))

  await writeAudit(
    transaction,
    {
      recordId: null,
      projectId: record.projectId,
      actor,
      action: "transitioned",
      reason: `${stop.tool} was locked with ${stop.field} ${JSON.stringify(record.payload[stop.field])}`,
    },
    [{ field: "status", oldValue: current!.status, newValue: stop.status }]
  )
}
