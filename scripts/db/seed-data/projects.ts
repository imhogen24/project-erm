import type { ProjectStatus, Role, ServiceTrack } from "@/db/schema"
import { DEV_LOCKED, DEV_UNLOCKED } from "@/server/workflow/dev-unlocked"

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

// The people on the project by handle. "everyone" is one person for every role,
// the first listed, so any role can be logged in as on that project.
export type Team = "everyone" | Partial<Record<Role, string[]>>

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

// The first project is the one the preview guide points at: every role is on
// it and its records are locked up to the tool being built (records.ts). The others
// are at the other stages a project can be in. Workloads stay within the
// limits, with Kojo Antwi at his limit of three engineering projects.
const baseProjects: readonly SeedProject[] = [
  {
    name: "Tema Foods Boiler Skid",
    serviceTrack: "Tier_1",
    status: "active",
    received: "2026-10-31T09:14:00Z",
    site: "Tema Industrial Area, Accra",
    client: {
      name: "Kwaku Ampofo",
      email: "kwaku.ampofo@temafoods.test",
      organisation: "Tema Foods Ltd",
      phone: "0244 318 075",
    },
    team: "everyone",
    request: {
      scope: ["Product Design", "Process / Factory Design"],
      title: "Packaged boiler skid for the juice line",
      objective:
        "A packaged steam boiler skid for our juice plant, ready to connect to the existing steam header.",
      materialInputs: "Carbon steel plate, stainless piping, insulation",
      energyInputs: "415 V supply, PLC signals from the plant controller",
      transformation: "Cut, weld and assemble onto a single skid frame",
      outputs: "One skid with drawings, a test report and an O&M manual",
      byProducts: "Offcuts and weld spatter",
      budget: "GHS 420,000",
      timeline: "12 weeks",
    },
  },
  {
    // The Tier 3 match for the first project: active and staffed for drafting,
    // with records locked up to the tool being built (records.ts).
    name: "Tarkwa Mine Pump Station Drawings",
    serviceTrack: "Tier_3",
    status: "active",
    received: "2026-11-02T10:05:00Z",
    site: "Tarkwa, Western Region",
    client: {
      name: "Joseph Arhin",
      email: "joseph.arhin@tarkwaminesupport.test",
      organisation: "Tarkwa Mine Support Ltd",
      phone: "0312 220 418",
    },
    team: {
      PM: ["nana.adjei"],
      OM: ["selorm.dzigbordi"],
      FO: ["edem.agbeko"],
      LE: ["yaa.sarpong"],
      AE: ["adwoa.baffoe"],
      LD: ["nii.lamptey"],
      HE: ["kwesi.appiah"],
    },
    request: {
      inputMaterialType: "Legacy 2D Drawings/PDFs",
      assetCondition: "In service, blueprints faded and out of date",
      services: [
        "3D Solid Modeling (STEP/IGES)",
        "General Arrangement / Assembly",
        "Exploded Views for Manuals",
      ],
      endGoal:
        "Up-to-date drawings of the pump station and an illustrated manual for the maintenance crew",
      standard: "ISO",
      outputFormats: ["PDF", "DWG", "STEP"],
    },
  },
  {
    name: "Takoradi Port Conveyor Upgrade",
    serviceTrack: "Tier_3",
    status: "active",
    received: "2026-11-04T14:42:00Z",
    site: "Takoradi Port, Western Region",
    client: {
      name: "Nana Yaa Ofosu",
      email: "nanayaa.ofosu@takoradiport.test",
      organisation: "Takoradi Bulk Terminal",
      phone: "0302 774 190",
    },
    team: {},
    request: {
      inputMaterialType: "Physical Part / Machine",
      assetCondition: "In service, no drawings kept",
      services: [
        "3D Solid Modeling (STEP/IGES)",
        "General Arrangement / Assembly",
        "2D Manufacturing Drawings (GD&T)",
      ],
      endGoal: "Drawings the workshop can build a replacement drive frame from",
      standard: "ISO",
      outputFormats: ["PDF", "DXF", "STEP"],
    },
  },
  {
    name: "Kumasi Cocoa Roasting Line",
    serviceTrack: "Tier_1",
    status: "active",
    received: "2026-10-26T08:05:00Z",
    site: "Kaase Industrial Area, Kumasi",
    client: {
      name: "Adwoa Serwaa",
      email: "adwoa.serwaa@asanteroasters.test",
      organisation: "Asante Cocoa Roasters",
      phone: "0208 552 641",
    },
    team: { PM: ["yaw.boateng"] },
    request: {
      scope: ["Process / Factory Design"],
      title: "Cocoa roasting and cooling line",
      objective:
        "A roasting line that takes 1.5 tonnes of cocoa beans an hour from the hopper to the cooling conveyor.",
      materialInputs: "Raw cocoa beans, stainless steel drum and ducting",
      energyInputs: "LPG burner, 415 V supply, temperature sensors",
      transformation: "Roast at 130 to 150 C, then cool to ambient",
      outputs: "Roasted beans at 1.5 tonnes an hour",
      byProducts: "Shell husks, exhaust heat",
      budget: "GHS 1,100,000",
      timeline: "6 months",
    },
  },
  {
    name: "Accra Brewery Bottling Retrofit",
    serviceTrack: "Tier_3",
    status: "active",
    received: "2026-10-20T11:30:00Z",
    site: "Spintex Road, Accra",
    client: {
      name: "Samuel Nkrumah",
      email: "samuel.nkrumah@gaheritage.test",
      organisation: "Ga Heritage Brewery",
      phone: "0277 410 928",
    },
    team: { OM: ["abena.frimpong"] },
    request: {
      inputMaterialType: "Legacy 2D Drawings/PDFs",
      assetCondition: "In service, drawings partly missing",
      services: ["Automated BOM Extraction", "Exploded Views for Manuals"],
      endGoal: "A parts list and an illustrated manual for the bottling line",
      standard: "ISO",
      outputFormats: ["PDF"],
    },
  },
  {
    name: "Ho Water Treatment Dosing Skid",
    serviceTrack: "Tier_1",
    status: "active",
    received: "2026-10-09T10:20:00Z",
    site: "Ho, Volta Region",
    client: {
      name: "Dzifa Amenuvor",
      email: "dzifa.amenuvor@voltawater.test",
      organisation: "Volta Rural Water Company",
      phone: "0246 903 117",
    },
    team: {
      PM: ["efua.quartey"],
      OM: ["selorm.dzigbordi"],
      FO: ["edem.agbeko"],
      LE: ["esi.mensima"],
    },
    request: {
      scope: ["Product Design"],
      title: "Chlorine dosing skid for a treatment plant",
      objective:
        "A dosing skid that holds chlorine at 1 mg/L in water leaving the plant, with a manual override.",
      materialInputs: "PVC and stainless piping, dosing pumps, tanks",
      energyInputs: "230 V supply, flow meter signal",
      transformation: "Meter chlorine solution into the treated water flow",
      outputs: "One skid with a P&ID and a commissioning checklist",
      budget: "GHS 180,000",
      timeline: "10 weeks",
    },
  },
  {
    name: "Tamale Shea Butter Processing Plant",
    serviceTrack: "Tier_1",
    status: "active",
    received: "2026-10-02T13:10:00Z",
    site: "Tamale, Northern Region",
    client: {
      name: "Rahinatu Alhassan",
      email: "rahinatu.alhassan@sheagold.test",
      organisation: "Northern Shea Gold Cooperative",
      phone: "0209 664 305",
    },
    team: {
      PM: ["ama.owusu"],
      OM: ["kwabena.asante"],
      FO: ["akosua.darko"],
      LE: ["kojo.antwi"],
      AE: ["adwoa.baffoe"],
    },
    request: {
      scope: ["Process / Factory Design", "Product Design"],
      title: "Shea butter kneading and filtering plant",
      objective:
        "A plant that turns 800 kg of roasted shea nuts a day into filtered butter, replacing hand kneading.",
      materialInputs: "Roasted shea nuts, stainless tanks and a press",
      energyInputs: "Three phase supply, hot water from a biomass boiler",
      transformation: "Mill, knead with hot water, separate and filter",
      outputs: "Filtered shea butter, 800 kg of nuts a day",
      byProducts: "Press cake, wash water",
      budget: "GHS 650,000",
      timeline: "5 months",
    },
  },
  {
    name: "Cape Coast Hotel Laundry Boiler",
    serviceTrack: "Tier_1",
    status: "on_hold",
    received: "2026-09-24T09:00:00Z",
    site: "Cape Coast, Central Region",
    client: {
      name: "Michael Essel",
      email: "michael.essel@coastalretreat.test",
      organisation: "Coastal Retreat Hotel",
      phone: "0243 718 560",
    },
    team: {
      PM: ["ama.owusu"],
      OM: ["abena.frimpong"],
      FO: ["edem.agbeko"],
    },
    request: {
      scope: ["Product Design"],
      title: "Steam boiler for the hotel laundry",
      objective:
        "A diesel fired boiler that supplies the laundry presses and tunnel washer, replacing two failing electric units.",
      materialInputs: "Boiler shell, burner, piping, controls",
      energyInputs: "Diesel, 230 V supply",
      transformation: "Heat water to steam at 8 bar",
      outputs: "A commissioned boiler with a safety valve test certificate",
      budget: "GHS 260,000",
      timeline: "8 weeks",
    },
  },
  {
    name: "Sunyani Timber Kiln Controls",
    serviceTrack: "Tier_1",
    status: "active",
    received: "2026-09-19T15:45:00Z",
    site: "Sunyani, Bono Region",
    client: {
      name: "Kofi Danquah",
      email: "kofi.danquah@bonotimber.test",
      organisation: "Bono Timber Works",
      phone: "0201 886 472",
    },
    team: {
      PM: ["nana.adjei"],
      OM: ["kwabena.asante"],
      FO: ["akosua.darko"],
      LE: ["kojo.antwi"],
    },
    request: {
      scope: ["Process / Factory Design"],
      title: "Moisture controlled drying kilns",
      objective:
        "Controls that dry hardwood boards to 12 percent moisture and stop the kiln when it is reached.",
      materialInputs: "Sawn hardwood boards, moisture probes, sensors",
      energyInputs: "Steam from the existing boiler, 415 V supply",
      transformation: "Dry boards in a kiln by temperature and humidity",
      outputs: "A controller panel with a program for each timber type",
      budget: "GHS 340,000",
      timeline: "14 weeks",
    },
  },
  {
    name: "Obuasi Workshop Crane Rail",
    serviceTrack: "Tier_3",
    status: "completed",
    received: "2026-07-08T08:30:00Z",
    site: "Obuasi, Ashanti Region",
    client: {
      name: "Isaac Tawiah",
      email: "isaac.tawiah@obuasiminesupport.test",
      organisation: "Obuasi Mine Support Services",
      phone: "0244 150 893",
    },
    team: {
      PM: ["efua.quartey"],
      OM: ["selorm.dzigbordi"],
    },
    request: {
      inputMaterialType: "Hand Sketches / Concepts",
      assetCondition: "In service, drawings lost",
      services: [
        "3D Solid Modeling (STEP/IGES)",
        "2D Manufacturing Drawings (GD&T)",
      ],
      endGoal: "Drawings to re-fabricate a worn crane rail section",
      standard: "ISO",
      outputFormats: ["PDF", "DXF"],
    },
  },
  {
    name: "Koforidua Poultry Feed Mill",
    serviceTrack: "Tier_1",
    status: "rejected",
    received: "2026-09-02T12:00:00Z",
    site: "Koforidua, Eastern Region",
    client: {
      name: "Gloria Boadu",
      email: "gloria.boadu@eastlayers.test",
      organisation: "Eastern Layers Farm",
      phone: "0242 330 719",
    },
    team: {},
    request: {
      scope: ["Process / Factory Design"],
      title: "Poultry feed mill",
      objective:
        "A mill that mixes maize, soya and premix into layer feed at 2 tonnes an hour.",
      materialInputs: "Maize, soya meal, premix, mild steel hoppers",
      energyInputs: "Three phase supply",
      transformation: "Grind, mix and bag",
      outputs: "Bagged layer feed, 2 tonnes an hour",
      budget: "GHS 90,000",
      timeline: "3 weeks",
    },
  },
  {
    name: "Bolgatanga Cold Room",
    serviceTrack: "Tier_1",
    status: "closed",
    received: "2026-08-14T10:10:00Z",
    site: "Bolgatanga, Upper East Region",
    client: {
      name: "Alhassan Iddrisu",
      email: "alhassan.iddrisu@uppereastgrowers.test",
      organisation: "Upper East Growers Association",
      phone: "0540 221 806",
    },
    team: {
      PM: ["nana.adjei"],
      OM: ["selorm.dzigbordi"],
    },
    request: {
      scope: ["Product Design"],
      title: "Cold room for tomatoes and onions",
      objective:
        "A 20 tonne cold room that keeps tomatoes at 10 C so growers can hold stock for two weeks.",
      materialInputs: "Insulated panels, refrigeration unit, door",
      energyInputs: "Three phase supply, backup generator input",
      transformation: "Hold produce at 10 C and 85 percent humidity",
      outputs: "A built and commissioned cold room",
      budget: "GHS 300,000",
      timeline: "10 weeks",
    },
  },
]

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

// One client for every Dev project, so one account tests the client's side.
const devClient: Client = {
  name: "Akosua Mensah",
  email: "akosua.mensah@devclient.test",
  organisation: "Dev Client Ltd",
  phone: "0244 000 001",
}

// For testing every tool in development: the same people on all four, one
// project per tier with every tool built locked, and one with every tool
// open at once (server/workflow/dev-unlocked.ts). Remove them with that file.
export const stageProjects: readonly SeedProject[] = [
  tier1Stage(
    `${DEV_LOCKED} (Tier 1)`,
    "active",
    "2026-09-10T09:00:00Z",
    "Accra",
    devClient,
    "everyone",
    "Small rice mill with destoner",
    "Mill 1 tonne of paddy an hour with a destoner and polisher."
  ),
  tier1Stage(
    `${DEV_UNLOCKED} (Tier 1)`,
    "active",
    "2026-09-11T09:00:00Z",
    "Accra",
    devClient,
    "everyone",
    "Palm fruit press and clarifier",
    "Press 1 tonne of palm fruit an hour and clarify the oil."
  ),
  tier3Stage(
    `${DEV_LOCKED} (Tier 3)`,
    "active",
    "2026-09-12T09:00:00Z",
    "Accra",
    devClient,
    "everyone",
    "Drawings of the aggregate hopper and its chute, measured on site"
  ),
  tier3Stage(
    `${DEV_UNLOCKED} (Tier 3)`,
    "active",
    "2026-09-13T09:00:00Z",
    "Accra",
    devClient,
    "everyone",
    "Manufacturing drawings of a worn crusher gearbox so it can be made locally"
  ),
]

export const projects: readonly SeedProject[] = [
  ...baseProjects,
  ...stageProjects,
]

export const featuredProject = projects[0]!

export const featuredTier3Project = projects.find(
  (project) => project.name === "Tarkwa Mine Pump Station Drawings"
)!
