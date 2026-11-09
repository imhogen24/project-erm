import type { JsonObject } from "@/db/schema"

import { qualityGateQuestions } from "@/workbooks/wb01/tools/t3-d1-3a"

// Where each project has got to in Workbook 1, so every role has something to
// open. A tool only opens once the one before it is locked, so each project's
// records run in order from D1.1. The OM prepares D1.1 to D1.3 and the PM
// approves them (server/permissions/matrix.ts).
//
// What the PMs see:
// - Ama Owusu: D1.2 waiting for approval on Tamale Shea Butter, a change
//   request on D1.1 of Tema Foods, and a finished D1.3 on Cape Coast.
// - Efua Quartey: D1.3 waiting for approval on Ho Water Treatment.
// - Nana Adjei: D1.1 waiting for approval on Sunyani Timber Kiln.
// - Yaw Boateng: D1.1 still with the OM on Kumasi Cocoa.
//
// Tarkwa Mine Pump Station Drawings is the Tier 3 match for Tema Foods: D1.1
// and D1.2 locked, so T3.D1.3a is open.

export type SeedState = "draft" | "submitted" | "locked"

export type SeedRecord = {
  toolId: string
  state: SeedState
  // Days after the request arrived that the record was started.
  day: number
  payload: JsonObject
}

export type SeedChangeRequest = {
  toolId: string
  // Days after the request arrived.
  day: number
  reason: string
}

type File = { label: string; date: string; slug: string }

function d11(files: File[], status: "Pending" | "Reviewed" | "Approved") {
  return {
    requestStatus: status,
    attachedFiles: files.map((file) => ({
      label: file.label,
      dateUploaded: file.date,
      fileLink: `https://utfs.io/f/${file.slug}`,
      status,
    })),
  }
}

const checks = [
  "Is the notification readable and free of malicious links?",
  "Does the request broadly align with IMHOGEN's services?",
  "Is the contact information apparently valid and legible?",
]

function d12(
  files: File[],
  answers: [status: "Pass" | "Fail", notes: string][],
  decision: "Proceed to D1.3" | "Reject as Spam"
) {
  return {
    digitalRecords: files.map((file) => ({ fileName: file.label })),
    triageChecklist: checks.map((check, index) => ({
      check,
      status: answers[index]![0],
      reviewerNotes: answers[index]![1],
    })),
    triageDecision: decision,
  }
}

const allPass = (
  notes: [string, string, string]
): [status: "Pass", notes: string][] => notes.map((note) => ["Pass", note])

function d13(parts: {
  core: [purpose: string, deliverables: string, constraints?: string]
  operands: Record<"M" | "E" | "I" | "L", [input: string, output: string]>
  operators: [
    human: string,
    technical: string,
    environment: string,
    information: string,
    management: string,
  ]
  missing: [item: string, assignee: string, status: string][]
}) {
  const coreLabels = [
    "Primary Purpose / Business Goal",
    "Main Deliverables Requested",
    "Specific Constraints Noted",
  ]

  const operatorLabels = [
    "Human System",
    "Technical System",
    "Active Environment",
    "Information System",
    "Management System",
  ]

  return {
    coreObjectives: coreLabels.map((item, index) => ({
      item,
      description: parts.core[index] ?? "",
    })),
    operands: (["M", "E", "I", "L"] as const).map((operand) => ({
      operand,
      input: parts.operands[operand][0],
      output: parts.operands[operand][1],
    })),
    operators: operatorLabels.map((operator, index) => ({
      operator,
      description: parts.operators[index]!,
    })),
    missingInformation: parts.missing.map(([item, assignee, status]) => ({
      item,
      assignee,
      status,
    })),
  }
}

const temaFiles: File[] = [
  { label: "Site photo", date: "2026-10-31", slug: "tema-foods-boiler-room" },
  { label: "Layout drawing", date: "2026-10-31", slug: "tema-foods-layout" },
]

const tamaleFiles: File[] = [
  {
    label: "Current kneading area",
    date: "2026-10-02",
    slug: "shea-kneading-area",
  },
  { label: "Floor plan sketch", date: "2026-10-02", slug: "shea-floor-plan" },
  {
    label: "Output records 2025",
    date: "2026-10-02",
    slug: "shea-output-2025",
  },
]

const capeCoastFiles: File[] = [
  {
    label: "Laundry room photo",
    date: "2026-09-24",
    slug: "coastal-laundry-room",
  },
  {
    label: "Existing unit nameplate",
    date: "2026-09-24",
    slug: "coastal-nameplate",
  },
]

const hoFiles: File[] = [
  { label: "Plant P&ID scan", date: "2026-10-09", slug: "volta-pid-scan" },
  {
    label: "Water test results",
    date: "2026-10-09",
    slug: "volta-water-tests",
  },
]

const sunyaniFiles: File[] = [
  { label: "Kiln photos", date: "2026-09-19", slug: "bono-kiln-photos" },
  {
    label: "Moisture log sample",
    date: "2026-09-19",
    slug: "bono-moisture-log",
  },
]

const kumasiFiles: File[] = [
  {
    label: "Roasting room photo",
    date: "2026-10-26",
    slug: "asante-roasting-room",
  },
]

const tarkwaFiles: File[] = [
  {
    label: "Pump station photos",
    date: "2026-11-02",
    slug: "tarkwa-pump-photos",
  },
  {
    label: "Blueprints 1998 (scanned)",
    date: "2026-11-02",
    slug: "tarkwa-blueprints",
  },
]

const takoradiFiles: File[] = [
  {
    label: "Conveyor drive photos",
    date: "2026-11-04",
    slug: "takoradi-drive-photos",
  },
  {
    label: "Hand measurements",
    date: "2026-11-04",
    slug: "takoradi-measurements",
  },
]

const accraFiles: File[] = [
  {
    label: "Scanned line drawings",
    date: "2026-10-20",
    slug: "ga-heritage-drawings",
  },
  { label: "Supplier manual", date: "2026-10-20", slug: "ga-heritage-manual" },
]

const obuasiFiles: File[] = [
  {
    label: "Crane rail survey sketch",
    date: "2026-07-08",
    slug: "obuasi-rail-sketch",
  },
  { label: "Rail wear photos", date: "2026-07-08", slug: "obuasi-rail-photos" },
]

const bolgaFiles: File[] = [
  { label: "Site photo", date: "2026-08-14", slug: "upper-east-site" },
]

const koforiduaFiles: File[] = [
  {
    label: "Attachment",
    date: "2026-09-02",
    slug: "eastern-layers-attachment",
  },
]

// By project name, as in projects.ts.
export const projectRecords = new Map(
  Object.entries({
    "Tema Foods Boiler Skid": [
      {
        toolId: "D1.1",
        state: "locked",
        day: 0,
        payload: d11(temaFiles, "Approved"),
      },
      {
        toolId: "D1.2",
        state: "locked",
        day: 1,
        payload: d12(
          temaFiles,
          allPass([
            "Readable, no links",
            "Within scope",
            "Email and phone check out",
          ]),
          "Proceed to D1.3"
        ),
      },
      // D1.3 is left open, so the D1.3 sheet can be worked on here.
    ],
    "Tamale Shea Butter Processing Plant": [
      {
        toolId: "D1.1",
        state: "locked",
        day: 0,
        payload: d11(tamaleFiles, "Approved"),
      },
      {
        toolId: "D1.2",
        state: "submitted",
        day: 2,
        payload: d12(
          tamaleFiles,
          allPass([
            "Plain text, the three files open",
            "Process plant design is a core service",
            "Cooperative office line answered",
          ]),
          "Proceed to D1.3"
        ),
      },
    ],
    "Cape Coast Hotel Laundry Boiler": [
      {
        toolId: "D1.1",
        state: "locked",
        day: 0,
        payload: d11(capeCoastFiles, "Approved"),
      },
      {
        toolId: "D1.2",
        state: "locked",
        day: 1,
        payload: d12(
          capeCoastFiles,
          allPass([
            "Readable",
            "Boiler supply is in scope",
            "Hotel switchboard confirmed",
          ]),
          "Proceed to D1.3"
        ),
      },
      {
        toolId: "D1.3",
        state: "locked",
        day: 3,
        payload: d13({
          core: [
            "Replace two failing electric steam units with one diesel fired boiler for the laundry presses and tunnel washer.",
            "A commissioned boiler, installation drawings and a safety valve test certificate.",
            "The laundry must keep running; the switch-over has to fit one weekend.",
          ],
          operands: {
            M: [
              "Feed water from the hotel supply",
              "Steam at 8 bar to the presses and washer",
            ],
            E: [
              "Diesel and a 230 V control supply",
              "Heat to the laundry, flue gas to the stack",
            ],
            I: [
              "Pressure and water level readings",
              "Alarms to the maintenance office",
            ],
            L: ["Laundry staff operating the presses", "None"],
          },
          operators: [
            "Two laundry attendants per shift, one trained maintenance technician",
            "Burner, feed pump, safety valves, level controls",
            "Coastal air, salty and humid; the plant room is ventilated",
            "Daily boiler log kept by maintenance",
            "Hotel facilities manager signs off shutdowns",
          ],
          missing: [
            ["Diesel tank capacity on site", "Michael Essel", "Received"],
            ["Weekend shutdown date", "Michael Essel", "Waiting on the hotel"],
          ],
        }),
      },
    ],
    "Ho Water Treatment Dosing Skid": [
      {
        toolId: "D1.1",
        state: "locked",
        day: 0,
        payload: d11(hoFiles, "Approved"),
      },
      {
        toolId: "D1.2",
        state: "locked",
        day: 1,
        payload: d12(
          hoFiles,
          allPass([
            "Readable, P&ID opens",
            "Dosing skids are in scope",
            "Company address and phone verified",
          ]),
          "Proceed to D1.3"
        ),
      },
      {
        toolId: "D1.3",
        state: "submitted",
        day: 4,
        payload: d13({
          core: [
            "Hold free chlorine at 1 mg/L in water leaving the plant, with a manual override.",
            "One dosing skid, a P&ID and a commissioning checklist.",
            "Fits the existing 2 m by 3 m plinth; runs on a 230 V supply.",
          ],
          operands: {
            M: [
              "Treated water, sodium hypochlorite solution",
              "Chlorinated water at 1 mg/L",
            ],
            E: ["230 V supply", "Pump work, heat from the panel"],
            I: [
              "Flow meter signal, chlorine analyser reading",
              "Dose rate and alarms on the panel",
            ],
            L: ["Plant operator on each shift", "None"],
          },
          operators: [
            "One operator per shift, refills the hypochlorite tank weekly",
            "Two dosing pumps, duty and standby, an analyser and a control panel",
            "Indoor pump house, hot and humid",
            "Hourly readings written in the plant log",
            "Volta Rural Water Company engineer approves set points",
          ],
          missing: [
            ["Current peak flow rate", "Dzifa Amenuvor", "Asked on 14 Oct"],
          ],
        }),
      },
    ],
    "Sunyani Timber Kiln Controls": [
      {
        toolId: "D1.1",
        state: "submitted",
        day: 1,
        payload: d11(sunyaniFiles, "Reviewed"),
      },
    ],
    "Kumasi Cocoa Roasting Line": [
      // Made by the intake, still Pending: the project has no OM yet.
      {
        toolId: "D1.1",
        state: "draft",
        day: 0,
        payload: d11(kumasiFiles, "Pending"),
      },
    ],
    "Tarkwa Mine Pump Station Drawings": [
      {
        toolId: "D1.1",
        state: "locked",
        day: 0,
        payload: d11(tarkwaFiles, "Approved"),
      },
      {
        toolId: "D1.2",
        state: "locked",
        day: 1,
        payload: d12(
          tarkwaFiles,
          allPass([
            "Readable, both scans open",
            "Drafting and manuals are Tier 3 services",
            "Company phone and email verified",
          ]),
          "Proceed to D1.3"
        ),
      },
      // T3.D1.3a is left open, so the Tier 3 sheet can be worked on here.
    ],
    "Takoradi Port Conveyor Upgrade": [
      {
        toolId: "D1.1",
        state: "draft",
        day: 0,
        payload: d11(takoradiFiles, "Pending"),
      },
    ],
    "Accra Brewery Bottling Retrofit": [
      {
        toolId: "D1.1",
        state: "draft",
        day: 1,
        payload: d11(accraFiles, "Reviewed"),
      },
    ],
    "Obuasi Workshop Crane Rail": [
      {
        toolId: "D1.1",
        state: "locked",
        day: 0,
        payload: d11(obuasiFiles, "Approved"),
      },
      {
        toolId: "D1.2",
        state: "locked",
        day: 1,
        payload: d12(
          obuasiFiles,
          allPass([
            "Readable",
            "Reverse engineering drawings are in scope",
            "Contact verified by phone",
          ]),
          "Proceed to D1.3"
        ),
      },
      {
        toolId: "T3.D1.3a",
        state: "locked",
        day: 2,
        payload: {
          sourceAssets: [
            {
              assetType: "Survey sketch",
              formatDescription: "Hand sketch on A3, photographed",
              condition: "Legible, some dimensions missing",
              actionRequired: "Confirm rail length and bolt pitch on site",
              notes: "",
            },
            {
              assetType: "Photographs",
              formatDescription: "14 JPEG photos of the worn section",
              condition: "Clear",
              actionRequired: "None",
              notes: "Wear is worst at the east end",
            },
          ],
          draftingSpecs: [
            {
              requirement: "3D Modelling",
              standard: "ISO",
              toleranceClass: "Medium (m)",
              fileFormat: "STEP",
              notes: "",
            },
            {
              requirement: "2D Manufacturing Drawings (GD&T)",
              standard: "ISO",
              toleranceClass: "Medium (m)",
              fileFormat: "PDF, DXF",
              notes: "One sheet per rail section",
            },
          ],
          qualityGate: qualityGateQuestions.map((question, index) => ({
            question,
            answer: index === 0 ? "No" : "Yes",
            reason:
              index === 0
                ? "The sketch lacks the bolt pitch, so the tolerances need site measurements"
                : "To measure the bolt pitch and rail length",
          })),
        },
      },
    ],
    "Bolgatanga Cold Room": [
      {
        toolId: "D1.1",
        state: "locked",
        day: 0,
        payload: d11(bolgaFiles, "Approved"),
      },
      {
        toolId: "D1.2",
        state: "locked",
        day: 1,
        payload: d12(
          bolgaFiles,
          allPass([
            "Readable",
            "Cold rooms are in scope",
            "Association office confirmed",
          ]),
          "Proceed to D1.3"
        ),
      },
    ],
    "Koforidua Poultry Feed Mill": [
      {
        toolId: "D1.1",
        state: "locked",
        day: 0,
        payload: d11(koforiduaFiles, "Approved"),
      },
      {
        toolId: "D1.2",
        state: "locked",
        day: 1,
        payload: d12(
          koforiduaFiles,
          [
            ["Fail", "The attachment is an executable, not a document"],
            ["Pass", "A feed mill would be in scope"],
            ["Fail", "The phone number does not connect"],
          ],
          "Reject as Spam"
        ),
      },
    ],
  } satisfies Record<string, SeedRecord[]>)
)

// Requests to unlock a locked record, waiting for the project's PM.
export const projectChangeRequests = new Map(
  Object.entries({
    "Tema Foods Boiler Skid": [
      {
        toolId: "D1.1",
        day: 4,
        reason:
          "The client emailed a photo of the boiler nameplate on 4 Nov. It belongs with the attached files.",
      },
    ],
  } satisfies Record<string, SeedChangeRequest[]>)
)
