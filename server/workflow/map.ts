import type { ProjectStatus, ServiceTrack } from "@/db/schema"
import type { Workbook } from "@/server/tools/define-tool"

// The tools whose records must be locked first: every one of them, or any one.
// A tool that the project's track does not use counts as the tool that
// replaces it there, so "D1.8" means T3.D1.8a on a Tier 3 project.
export type Requirement =
  { all: readonly string[] } | { any: readonly string[] }

// Holds when the tool's locked record has one of these values in a select or
// yes/no field. A draft never counts.
export type Condition = {
  tool: string
  field: string
  oneOf: readonly (string | boolean)[]
  // What a closed tool says while the tool is locked without one of these
  // values, such as "This tool opens after D1.4 is delivered."
  note?: string
}

// One way a tool can open: the tools that must be locked first, and the
// answer one of them must hold.
export type Opening = {
  after?: Requirement
  when?: Condition
}

export type ToolRule = Opening & {
  tool: string
  // A rule with no `after` starts as soon as its workbook opens.
  // `openings` are other ways the tool opens, used instead of `after` and
  // `when`: it opens when any one of them holds, such as D2.10 after D2.9
  // with Terms Agreed, or after D2.7 with the draft accepted as it is.
  openings?: readonly Opening[]
  // Runs once per payment milestone, in the cycles the map's `cycles` sets.
  repeats?: true
}

// The ways a rule opens its tool: its openings, or its own `after` and
// `when` as the one way.
export function openingsOf(rule: ToolRule): readonly Opening[] {
  return rule.openings ?? [{ after: rule.after, when: rule.when }]
}

// An answer that ends the route. Locking it sets the project's status, which
// makes the project read only. No record is voided.
export type HardStop = Condition & {
  status: Exclude<ProjectStatus, "active">
}

// The repeating tools of a map run in cycles 1, 2, 3 and so on. `count` is the
// field of a locked record that holds the number of cycles: a number, or a
// table with one row per cycle. A cycle after the first starts only once
// `closedBy` is locked in the cycle before it.
export type Cycles = {
  count: { tool: string; field: string }
  closedBy: string
}

// The route through one workbook. A workbook with no tool rules yet opens all
// its tools at once, so its own slice can add the order later.
export type WorkbookMap = {
  workbook: Workbook
  // When the workbook opens. The first workbook has none. `tracks` lists the
  // only tracks that use it, when not every track does.
  opens?: { after: Requirement; tracks?: readonly ServiceTrack[] }
  tools: readonly ToolRule[]
  stops?: readonly HardStop[]
  cycles?: Cycles
}

export function requiredTools(requirement: Requirement): readonly string[] {
  return "all" in requirement ? requirement.all : requirement.any
}
