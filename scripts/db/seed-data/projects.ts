import {
  roles,
  type ProjectStatus,
  type Role,
  type ServiceTrack,
} from "@/db/schema"
import { accessRow, writingRoles } from "@/server/permissions/matrix"
import { allTools } from "@/workbooks"
import {
  DEV_LOCKED,
  DEV_PROJECT,
  DEV_UNLOCKED,
} from "@/server/workflow/dev-unlocked"

export type Client = {
  name: string
  email: string
  organisation: string
  phone: string
}

type Tier1Request = {
  scope: string[]
  title: string
  objective: string
  materialInputs: string
  energyInputs: string
  transformation: string
  outputs: string
  byProducts?: string
  budget?: string
  timeline?: string
}

type Tier3Request = {
  inputMaterialType: string
  assetCondition: string
  services: string[]
  endGoal: string
  standard: string
  outputFormats: string[]
}

// Who is on the project: one person for every role, so any role can be logged
// in as on it, or nobody yet.
export type Team = "everyone" | "nobody"

export type SeedProject = {
  name: string
  serviceTrack: ServiceTrack
  status: ProjectStatus
  // When the website received the request. The request ID is made from it, the
  // way the website makes it, so the ID is the same every time this runs.
  received: string
  site: string
  client: Client
  team: Team
  request: Tier1Request | Tier3Request
}

export function isTier3(
  request: SeedProject["request"]
): request is Tier3Request {
  return "services" in request
}

export function requestIdOf(project: SeedProject) {
  const prefix = project.serviceTrack === "Tier_1" ? "T1" : "T3"

  return `${prefix}-${Date.parse(project.received)}`
}

// The Dev projects' requests (stageProjects below).
function tier1Stage(
  name: string,
  status: ProjectStatus,
  received: string,
  site: string,
  client: Client,
  team: Team,
  title: string,
  objective: string
): SeedProject {
  return {
    name,
    serviceTrack: "Tier_1",
    status,
    received,
    site,
    client,
    team,
    request: {
      scope: ["Product Design", "Process / Factory Design"],
      title,
      objective,
      materialInputs: "Raw produce in sacks, clean water",
      energyInputs: "415 V supply, LPG for heating",
      transformation: "Wash, process and dry in one line",
      outputs: "A commissioned line with drawings and an O&M manual",
      byProducts: "Waste water and husks",
      budget: "GHS 250,000",
      timeline: "10 weeks",
    },
  }
}

function tier3Stage(
  name: string,
  status: ProjectStatus,
  received: string,
  site: string,
  client: Client,
  team: Team,
  endGoal: string
): SeedProject {
  return {
    name,
    serviceTrack: "Tier_3",
    status,
    received,
    site,
    client,
    team,
    request: {
      inputMaterialType: "Physical Part / Machine",
      assetCondition: "In service, no drawings exist",
      services: [
        "3D Solid Modeling (STEP/IGES)",
        "2D Manufacturing Drawings (GD&T)",
      ],
      endGoal,
      standard: "ISO",
      outputFormats: ["PDF", "STEP"],
    },
  }
}

// The one client on every project, so one account tests the client's side.
export const client: Client = {
  name: "Akosua Mensah",
  email: "client@client.test",
  organisation: "Client Test Ltd",
  phone: "0244 000 001",
}

// The tool being built, on each tier. Each time a tool is built these move on
// to it, and the projects below move with them. A tier the tool does not
// serve names the tool that takes its place there.
export const CURRENT_TOOL = "D1.16"

const CURRENT_TIER_3_TOOL = "D1.16"

export function currentToolFor(track: ServiceTrack) {
  return track === "Tier_1" ? CURRENT_TOOL : CURRENT_TIER_3_TOOL
}

const CURRENT_TIERS: readonly ServiceTrack[] = ["Tier_1", "Tier_3"]

// Who writes a tool and who approves it, from the matrix: the OM and the PM
// where the matrix names no one else. A tool that locks on submit has no
// approver: its writer locks it.
export function writerOf(toolId: string): Role {
  return writingRoles(toolId).find((role) => role !== "Client") ?? "OM"
}

export function approverOf(toolId: string): Role {
  const row = accessRow(toolId) ?? {}

  if (allTools.some((tool) => tool.id === toolId && tool.locksOnSubmit)) {
    return writerOf(toolId)
  }

  return roles.find((role) => row[role] === "RA") ?? "PM"
}

// Where the tool being built stands on a project: open and empty for its
// writer, submitted and waiting for its approver, or approved and locked.
export type ToolStage = "open" | "submitted" | "locked"

export const toolStages: readonly ToolStage[] = ["open", "submitted", "locked"]

function stageLabel(stage: ToolStage, tool: string) {
  switch (stage) {
    case "open": {
      return `1 Fill in (${writerOf(tool)})`
    }

    case "submitted": {
      return `2 Approve (${approverOf(tool)})`
    }

    case "locked": {
      return "3 Approved"
    }
  }
}

function tierLabel(track: ServiceTrack) {
  return track === "Tier_1" ? "Tier 1" : "Tier 3"
}

export function toolProjectName(track: ServiceTrack, stage: ToolStage) {
  const tool = currentToolFor(track)

  return `${DEV_PROJECT}${tool} ${tierLabel(track)} · ${stageLabel(stage, tool)}`
}

// Every project has everyone on it, one person per role, so logging in as any
// role shows the same projects from that role's side.
export const toolProjects: readonly {
  project: SeedProject
  stage: ToolStage
}[] = CURRENT_TIERS.flatMap((track, tierIndex) =>
  toolStages.map((stage, stageIndex) => {
    const received = new Date(
      Date.UTC(2026, 9, 1 + tierIndex * 3 + stageIndex, 9)
    ).toISOString()

    const name = toolProjectName(track, stage)

    return {
      stage,
      project:
        track === "Tier_1"
          ? tier1Stage(
              name,
              "active",
              received,
              "Accra",
              client,
              "everyone",
              "Small rice mill with destoner",
              "Mill 1 tonne of paddy an hour with a destoner and polisher."
            )
          : tier3Stage(
              name,
              "active",
              received,
              "Accra",
              client,
              "everyone",
              "Drawings of the aggregate hopper and its chute, measured on site"
            ),
    }
  })
)

// The tools a track runs, in the order they open: the registry's order, less
// the tools of the other tier.
export function routeOf(track: ServiceTrack): string[] {
  const tier = track === "Tier_1" ? 1 : 3

  return allTools
    .filter((tool) => tool.tier === "both" || tool.tier === tier)
    .map((tool) => tool.id)
}

export const TEST_PROJECT = `${DEV_PROJECT}Test `

export function testProjectName(track: ServiceTrack, toolId: string) {
  const tool = allTools.find((each) => each.id === toolId)

  return `${TEST_PROJECT}${toolId} ${tool?.name ?? ""} (${tierLabel(track)})`
}

// One project for each tool on each tier, to test that tool: every tool
// before it is locked with sample answers, and the tool itself is open and
// empty, starting from those answers as a real project would. The client's
// web form, D1.1, is the first record of every project, so it has none.
// A newly built tool gets its project once it is registered.
export const testProjects: readonly {
  project: SeedProject
  toolId: string
}[] = CURRENT_TIERS.flatMap((track, tierIndex) =>
  routeOf(track)
    .slice(1)
    .map((toolId, index) => {
      const received = new Date(
        Date.UTC(2026, 6, 1 + index, 9 + tierIndex)
      ).toISOString()

      const name = testProjectName(track, toolId)

      return {
        toolId,
        project:
          track === "Tier_1"
            ? tier1Stage(
                name,
                "active",
                received,
                "Accra",
                client,
                "everyone",
                "Small rice mill with destoner",
                "Mill 1 tonne of paddy an hour with a destoner and polisher."
              )
            : tier3Stage(
                name,
                "active",
                received,
                "Accra",
                client,
                "everyone",
                "Drawings of the aggregate hopper and its chute, measured on site"
              ),
      }
    })
)

// A request no one has been assigned to yet, for the IT/Admin to staff.
export const NEEDS_TEAM = `${DEV_PROJECT}New request · Assign a team (IT/Admin)`

const needsTeam = tier1Stage(
  NEEDS_TEAM,
  "active",
  "2026-10-20T09:00:00Z",
  "Kumasi",
  client,
  "nobody",
  "Cocoa roasting and cooling line",
  "Roast 1.5 tonnes of cocoa beans an hour and cool them."
)

// For testing every tool built: one project per tier with every tool built
// locked, and one with every tool open at once
// (server/workflow/dev-unlocked.ts).
export const stageProjects: readonly SeedProject[] = [
  tier1Stage(
    `${DEV_LOCKED} (Tier 1)`,
    "active",
    "2026-09-10T09:00:00Z",
    "Accra",
    client,
    "everyone",
    "Small rice mill with destoner",
    "Mill 1 tonne of paddy an hour with a destoner and polisher."
  ),
  tier1Stage(
    `${DEV_UNLOCKED} (Tier 1)`,
    "active",
    "2026-09-11T09:00:00Z",
    "Accra",
    client,
    "everyone",
    "Palm fruit press and clarifier",
    "Press 1 tonne of palm fruit an hour and clarify the oil."
  ),
  tier3Stage(
    `${DEV_LOCKED} (Tier 3)`,
    "active",
    "2026-09-12T09:00:00Z",
    "Accra",
    client,
    "everyone",
    "Drawings of the aggregate hopper and its chute, measured on site"
  ),
  tier3Stage(
    `${DEV_UNLOCKED} (Tier 3)`,
    "active",
    "2026-09-13T09:00:00Z",
    "Accra",
    client,
    "everyone",
    "Manufacturing drawings of a worn crusher gearbox so it can be made locally"
  ),
]

// A Tier 1 project whose client accepted the draft contract as it is in
// D2.7, so D2.8, the negotiation meeting invite, never opens.
export const ACCEPTED_AS_IS_PROJECT = `${DEV_PROJECT}D2.7 Accepted as-is (Tier 1)`

const acceptedAsIs = tier1Stage(
  ACCEPTED_AS_IS_PROJECT,
  "active",
  "2026-09-14T09:00:00Z",
  "Accra",
  client,
  "everyone",
  "Small rice mill with destoner",
  "Mill 1 tonne of paddy an hour with a destoner and polisher."
)

// A Tier 1 project whose final contract was signed on paper (D2.11 sent by
// Physical Courier), so D2.12 starts on Physical Scan with no files.
export const PAPER_SIGNED_PROJECT = `${DEV_PROJECT}D2.11 Signed on Paper (Tier 1)`

const paperSigned = tier1Stage(
  PAPER_SIGNED_PROJECT,
  "active",
  "2026-09-15T09:00:00Z",
  "Kumasi",
  client,
  "everyone",
  "Cassava grater with press",
  "Grate and press 500 kg of cassava an hour for gari."
)

// Two Tier 1 projects in Workbook 3's first payment milestone cycle: on the
// first the PM's D3.3 for 2.2 waits for the FO; on the second the FO
// approved it, so a new D3.3 is open for 2.3.
export const TRIGGER_WAITING_PROJECT = `${DEV_PROJECT}D3.3 Waiting for the FO (Tier 1)`

export const TRIGGER_APPROVED_PROJECT = `${DEV_PROJECT}D3.3 2.2 Approved (Tier 1)`

const triggerWaiting = tier1Stage(
  TRIGGER_WAITING_PROJECT,
  "active",
  "2026-09-16T09:00:00Z",
  "Accra",
  client,
  "everyone",
  "Small rice mill with destoner",
  "Mill 1 tonne of paddy an hour with a destoner and polisher."
)

// A Tier 1 project two cycles in: the FO drafted and locked the invoice for
// 2.2 (D3.4) and approved the trigger for 2.3, so D3.4 for 2.3 is open.
export const INVOICE_DRAFTED_PROJECT = `${DEV_PROJECT}D3.4 2.2 Invoiced (Tier 1)`

const invoiceDrafted = tier1Stage(
  INVOICE_DRAFTED_PROJECT,
  "active",
  "2026-09-18T09:00:00Z",
  "Accra",
  client,
  "everyone",
  "Small rice mill with destoner",
  "Mill 1 tonne of paddy an hour with a destoner and polisher."
)

// A Tier 1 project whose 2.2 invoice the PM approved as Head of Finance, so
// D3.5 for 2.2 is locked and the approved invoice PDF can be read.
export const INVOICE_APPROVED_PROJECT = `${DEV_PROJECT}D3.5 2.2 Approved (Tier 1)`

const invoiceApproved = tier1Stage(
  INVOICE_APPROVED_PROJECT,
  "active",
  "2026-09-19T09:00:00Z",
  "Accra",
  client,
  "everyone",
  "Small rice mill with destoner",
  "Mill 1 tonne of paddy an hour with a destoner and polisher."
)

const triggerApproved = tier1Stage(
  TRIGGER_APPROVED_PROJECT,
  "active",
  "2026-09-17T09:00:00Z",
  "Accra",
  client,
  "everyone",
  "Small rice mill with destoner",
  "Mill 1 tonne of paddy an hour with a destoner and polisher."
)

export const projects: readonly SeedProject[] = [
  ...toolProjects.map((each) => each.project),
  ...testProjects.map((each) => each.project),
  needsTeam,
  ...stageProjects,
  acceptedAsIs,
  paperSigned,
  triggerWaiting,
  triggerApproved,
  invoiceDrafted,
  invoiceApproved,
]

export function seedProjectNamed(name: string) {
  const found = projects.find((project) => project.name === name)

  if (!found) {
    throw new Error(`No seed project is named ${name}`)
  }

  return found
}
