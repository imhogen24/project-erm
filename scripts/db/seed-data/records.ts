import type { JsonObject } from "@/db/schema"

import { DONE, defaultAgenda, preMeetingChecks } from "@/lib/calendar-agenda"
import { schedulingEmail } from "@/lib/meeting-proposal"
import { qualityGateQuestions } from "@/workbooks/wb01/tools/t3-d1-3a"

import { featuredProject, requestIdOf } from "./projects"

// Where each project has got to in Workbook 1, so every role has something to
// open. A tool only opens once the one before it is locked, so each project's
// records run in order from D1.1. The client writes D1.1; the OM prepares
// D1.2 and D1.3 and the PM approves them (server/permissions/matrix.ts).
//
// What the PMs see:
// - Ama Owusu: D1.2 waiting for approval on Tamale Shea Butter, a change
//   request on D1.1 of Tema Foods, and a finished D1.3 on Cape Coast.
// - Efua Quartey: D1.3 waiting for approval on Ho Water Treatment.
// - Nana Adjei: D1.2 waiting for approval on Sunyani Timber Kiln.
// - Yaw Boateng: Kumasi Cocoa has its client's form but no OM to triage it.
//
// D1.1 is the client's web form, locked the moment it is submitted, so it is
// locked on every project.
//
// Tema Foods Boiler Skid (Tier 1) and Tarkwa Mine Pump Station Drawings (Tier
// 3) are where the tool being built is open: their records are locked up to
// the tool before it. On Tema Foods that is D1.8: D1.4 is delivered, on D1.5
// the client chose a meeting time, on D1.6 the invite went out, and the PM
// approved the D1.7 meeting notes. On Tarkwa it is T3.D1.8a: D1.4 is
// delivered.

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

// D1.1 is the client's web form; the record holds the files they attached.
// It locks the moment the client submits it.
function d11(files: File[]) {
  return {
    attachedFiles: files.map((file) => ({
      label: file.label,
      dateUploaded: file.date,
      fileLink: `https://utfs.io/f/${file.slug}`,
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
// Keeps one record's payload its own type, so the list of records is not
// widened into one shape.
function payloadOf(payload: JsonObject): JsonObject {
  return payload
}

// The next `count` weekdays, starting a few days from when the seed runs, as
// "2026-11-17".
function weekdaysAhead(count: number) {
  const days: string[] = []
  const day = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)

  while (days.length < count) {
    if (day.getUTCDay() !== 0 && day.getUTCDay() !== 6) {
      days.push(day.toISOString().slice(0, 10))
    }

    day.setUTCDate(day.getUTCDate() + 1)
  }

  return days
}

const [firstDay, secondDay, thirdDay] = weekdaysAhead(3)

// The meeting times the OM sent Tema Foods: always ahead of today, so the
// meeting they agreed on is still to come.
const temaSlots = [
  { date: firstDay!, time: "11:00", timeZone: "Africa/Accra" },
  { date: secondDay!, time: "14:00", timeZone: "Africa/Accra" },
  { date: thirdDay!, time: "10:00", timeZone: "Africa/Accra" },
]

export const projectRecords = new Map<string, SeedRecord[]>(
  Object.entries({
    "Tema Foods Boiler Skid": [
      {
        toolId: "D1.1",
        state: "locked",
        day: 0,
        payload: d11(temaFiles),
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
      {
        toolId: "D1.3",
        state: "locked",
        day: 2,
        payload: d13({
          core: [
            "A packaged steam boiler skid for the juice line, ready to connect to the existing steam header.",
            "One skid with drawings, a test report and an O&M manual.",
            "The skid must fit the old boiler's plinth and be installed during the plant's two-week shutdown.",
          ],
          operands: {
            M: [
              "Feed water, carbon steel plate, stainless piping",
              "Steam at 10 bar to the juice line",
            ],
            E: [
              "415 V supply, diesel for the burner",
              "Heat to the process, flue gas to the stack",
            ],
            I: [
              "PLC signals from the plant controller",
              "Pressure, level and alarm signals back to the controller",
            ],
            L: ["Boiler operators on each shift", "None"],
          },
          operators: [
            "Two certified boiler operators per shift and the maintenance supervisor",
            "Burner, feed pumps, safety valves and the plant PLC",
            "Hot, humid plant room near the coast",
            "Shift logbook and the plant controller's history",
            "Plant manager approves shutdowns and safety checks",
          ],
          missing: [
            [
              "Steam demand at peak production",
              "Kwaku Ampofo",
              "Asked by email",
            ],
          ],
        }),
      },
      {
        toolId: "D1.4",
        state: "locked",
        day: 3,
        payload: payloadOf({
          sentTo: "kwaku.ampofo@temafoods.test",
          sentBy: "kwabena.asante@imhogen.test",
          subject:
            "Acknowledgement of Packaged boiler skid for the juice line request",
          body: "Dear Kwaku Ampofo,\n\nThank you for reaching out to IMHOGEN LTD. We have successfully received your project inquiry.\n\nBest regards",
          dateSent: "2026-11-04",
          timeSent: "10:15",
          deliveryStatus: "Delivered",
        }),
      },
      // D1.5: three times were sent and Kwaku Ampofo chose the second; the
      // OM confirmed it, so D1.6 is open.
      {
        toolId: "D1.5",
        state: "locked",
        day: 4,
        payload: payloadOf({
          slots: temaSlots,
          offeredSlots: temaSlots,
          sentToClientAt: new Date().toISOString(),
          emailText: schedulingEmail(
            {
              contact: "Kwaku Ampofo",
              title: "Packaged boiler skid for the juice line",
              requestId: requestIdOf(featuredProject),
            },
            temaSlots
          ),
          chosenSlot: 2,
          clientComment: "Our plant manager will join.",
          agreedDate: temaSlots[1]!.date,
          agreedTime: temaSlots[1]!.time,
          agreedTimeZone: temaSlots[1]!.timeZone,
          clientConfirmed: true,
          platform: "Google Meet",
          meetingLink: "https://meet.google.com/zpr-zhib-amp",
          calendarInviteSent: false,
        }),
      },
      // D1.6: the invite went to Kwaku Ampofo and the OM, PM and LE, and every
      // pre-meeting check is done, so D1.7 is open. An attendee's personId
      // names their role here; the seed puts in who holds it on the project.
      {
        toolId: "D1.6",
        state: "locked",
        day: 5,
        payload: payloadOf({
          meetingDate: temaSlots[1]!.date,
          meetingTime: temaSlots[1]!.time,
          meetingTimeZone: temaSlots[1]!.timeZone,
          platform: "Google Meet",
          meetingLink: "https://meet.google.com/zpr-zhib-amp",
          imhogenAttendees: [
            { personId: "role:OM", name: "Kwabena Asante", role: "OM" },
            { personId: "role:PM", name: "Ama Owusu", role: "PM" },
            { personId: "role:LE", name: "Kojo Antwi", role: "LE" },
          ],
          clientAttendees: "Kwaku Ampofo",
          agenda: defaultAgenda,
          // When the seed starts D1.6, before it is locked.
          inviteSentAt: new Date(
            Date.parse(featuredProject.received) + 5 * 24 * 60 * 60 * 1000
          ).toISOString(),
          inviteSequence: 0,
          preMeetingChecks: preMeetingChecks.map((each) => ({
            ...each,
            status: DONE,
          })),
        }),
      },
      // D1.7: the OM's notes from the discovery meeting, approved by the PM,
      // so D1.8 is open for the Lead Engineer.
      {
        toolId: "D1.7",
        state: "locked",
        day: 7,
        payload: payloadOf({
          actualDate: temaSlots[1]!.date,
          actualStartTime: "14:00",
          actualEndTime: "14:40",
          imhogenPresent: [
            { name: "Kwabena Asante", present: true },
            { name: "Ama Owusu", present: true },
            { name: "Kojo Antwi", present: true },
          ],
          clientPresent: [
            { name: "Kwaku Ampofo", present: true },
            { name: "Plant manager", present: true },
          ],
          discussion: [
            {
              minutes: 5,
              topic: "Introductions & Project Overview",
              rawNotes: "They want the skid running before the mango season.",
              remarks: "Their brief was detailed; no gaps on the overview.",
            },
            {
              minutes: 15,
              topic: "Technical Requirements (Inputs/Outputs)",
              rawNotes:
                "2 t/h saturated steam at 10 bar. Feed water from the existing softener. Diesel now, LPG later.",
              remarks: "Burner must take both fuels; confirm LPG supply date.",
            },
            {
              minutes: 10,
              topic: "Operational Environment & Constraints",
              rawNotes:
                "Skid sits outdoors under a canopy; one operator per shift.",
              remarks: "Controls must be simple; check ambient 40 °C rating.",
            },
          ],
          parkingLot: [
            {
              item: "Choose a date to visit the site and measure the header",
              action: "OM to propose a date",
            },
          ],
          primaryOutcome:
            "Requirements are clear enough to assess; a site visit is needed.",
          clientNextStep: "Confirm the proposed site visit date.",
          imhogenNextStep: "Lead Engineer writes the needs assessment (D1.8).",
        }),
      },
    ],
    "Tamale Shea Butter Processing Plant": [
      {
        toolId: "D1.1",
        state: "locked",
        day: 0,
        payload: d11(tamaleFiles),
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
        payload: d11(capeCoastFiles),
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
        payload: d11(hoFiles),
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
        state: "locked",
        day: 1,
        payload: d11(sunyaniFiles),
      },
      {
        toolId: "D1.2",
        state: "submitted",
        day: 2,
        payload: d12(
          sunyaniFiles,
          allPass([
            "Readable, photos open",
            "Kiln controls are in scope",
            "Company phone confirmed",
          ]),
          "Proceed to D1.3"
        ),
      },
    ],
    "Kumasi Cocoa Roasting Line": [
      // The client's form is in; the project has no OM yet to triage it.
      {
        toolId: "D1.1",
        state: "locked",
        day: 0,
        payload: d11(kumasiFiles),
      },
    ],
    "Tarkwa Mine Pump Station Drawings": [
      {
        toolId: "D1.1",
        state: "locked",
        day: 0,
        payload: d11(tarkwaFiles),
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
      {
        toolId: "T3.D1.3a",
        state: "locked",
        day: 2,
        payload: {
          sourceAssets: [
            {
              assetType: "Blueprints",
              formatDescription: "1998 paper blueprints, scanned at 300 dpi",
              condition: "Faded; pipe sizes hard to read on two sheets",
              actionRequired: "Confirm pipe sizes against the site photos",
              notes: "",
            },
            {
              assetType: "Photographs",
              formatDescription: "42 site photos of the pump station",
              condition: "Clear",
              actionRequired: "None",
              notes: "Taken after the 2024 pump replacement",
            },
          ],
          draftingSpecs: [
            {
              requirement: "3D Modelling",
              standard: "ISO",
              toleranceClass: "General",
              fileFormat: "STEP",
              notes: "",
            },
            {
              requirement: "General Arrangement/Assembly",
              standard: "ISO",
              toleranceClass: "General",
              fileFormat: "PDF, DWG",
              notes: "",
            },
            {
              requirement: "Manuals/Technical Illustrations",
              standard: "ISO",
              toleranceClass: "General",
              fileFormat: "PDF",
              notes: "For the maintenance crew",
            },
          ],
          qualityGate: qualityGateQuestions.map((question, index) => ({
            question,
            answer: index === 0 ? "Yes" : "No",
            reason:
              index === 0
                ? "General tolerances are enough for maintenance drawings"
                : "The photos and blueprints cover every part",
          })),
        },
      },
      // D1.4 went to the client and was delivered, so T3.D1.8a is open for
      // the AE. Obuasi Workshop Crane Rail keeps a Tier 3 D1.4 open to try.
      {
        toolId: "D1.4",
        state: "locked",
        day: 3,
        payload: payloadOf({
          sentTo: "joseph.arhin@tarkwaminesupport.test",
          sentBy: "selorm.dzigbordi@imhogen.test",
          subject:
            "Acknowledgement of Tarkwa Mine Pump Station Drawings request",
          body: "Dear Joseph Arhin,\n\nThank you for reaching out to IMHOGEN LTD. We have successfully received your project inquiry.\n\nBest regards",
          dateSent: "2026-11-06",
          timeSent: "09:40",
          deliveryStatus: "Delivered",
        }),
      },
    ],
    "Takoradi Port Conveyor Upgrade": [
      {
        toolId: "D1.1",
        state: "locked",
        day: 0,
        payload: d11(takoradiFiles),
      },
    ],
    "Accra Brewery Bottling Retrofit": [
      {
        toolId: "D1.1",
        state: "locked",
        day: 1,
        payload: d11(accraFiles),
      },
    ],
    "Obuasi Workshop Crane Rail": [
      {
        toolId: "D1.1",
        state: "locked",
        day: 0,
        payload: d11(obuasiFiles),
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
        payload: d11(bolgaFiles),
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
        payload: d11(koforiduaFiles),
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
export const projectChangeRequests = new Map<string, SeedChangeRequest[]>(
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
