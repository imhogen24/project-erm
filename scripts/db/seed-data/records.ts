import { z } from "zod"

import type { JsonObject } from "@/db/schema"

import { DONE, defaultAgenda, preMeetingChecks } from "@/lib/calendar-agenda"
import { schedulingEmail } from "@/lib/meeting-proposal"
import { commercialCriteria, technicalCriteria } from "@/lib/capability"
import { capabilityDomains } from "@/lib/feasibility"
import { reviewDirectives } from "@/lib/internal-review"
import { conclusionQuestions } from "@/lib/risk"
import { handoffChecklist, handoffDirectives } from "@/lib/handoff"
import { needsCategories, specCategories } from "@/lib/needs-assessment"
import {
  t3Deliverables,
  t3Exclusions,
  t3PricingLines,
} from "@/lib/project-brief"
import { qualityGateQuestions } from "@/workbooks/wb01/tools/t3-d1-3a"

import { DEV_LOCKED, DEV_UNLOCKED } from "@/server/workflow/dev-unlocked"

import { loginFor, staffWith } from "./people"
import {
  approverOf,
  currentToolFor,
  NEEDS_TEAM,
  requestIdOf,
  seedProjectNamed,
  toolProjectName,
  toolProjects,
  type SeedProject,
  type ToolStage,
} from "./projects"

// Where each project has got to in Workbook 1. A tool only opens once the one
// before it is locked, so each project's records run in order from D1.1.
//
// The projects for the tool being built (CURRENT_TOOL in projects.ts) have
// every tool before it locked, and the tool itself not started, submitted for
// approval, or approved. The Every Tool Locked projects have every tool built
// locked, and the Every Tool Unlocked ones only the client's web form.

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

// A comment the team left on a tool, with its replies, each said by whoever
// holds the role. Hours are after the tool was started.
export type SeedComment = {
  toolId: string
  role: "OM" | "PM"
  hour: number
  body: string
  resolved?: boolean
  replies?: { role: "OM" | "PM"; hour: number; body: string }[]
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

// The meeting times the OM sent: always ahead of today, so the meeting the
// client agreed on is still to come.
const meetingSlots = [
  { date: firstDay!, time: "11:00", timeZone: "Africa/Accra" },
  { date: secondDay!, time: "14:00", timeZone: "Africa/Accra" },
  { date: thirdDay!, time: "10:00", timeZone: "Africa/Accra" },
]

// Sample records for every tool built.

type Stage = {
  name: string
  contact: string
  email: string
  title: string
  requestId: string
}

function stageOf(name: string): Stage {
  const project = seedProjectNamed(name)

  return {
    name,
    contact: project.client.name,
    email: project.client.email,
    title: "title" in project.request ? project.request.title : name,
    requestId: requestIdOf(project),
  }
}

function stageFiles(stage: Stage): File[] {
  const slug = stage.name.toLowerCase().replaceAll(" ", "-")

  return [
    { label: "Site photo", date: "2026-11-01", slug: `${slug}-site` },
    { label: "Sketch", date: "2026-11-01", slug: `${slug}-sketch` },
  ]
}

const stageTriage = allPass([
  "Plain text, both files open",
  "Within IMHOGEN's services",
  "Phone and email check out",
])

function stageD13(stage: Stage) {
  return d13({
    core: [
      `${stage.title}, built and commissioned on site.`,
      "Drawings, the built line, a test report and an O&M manual.",
      "Budget and timeline as on the web form.",
    ],
    operands: {
      M: ["Raw produce and clean water", "Finished product, bagged"],
      E: ["415 V supply, LPG", "Heat to the process, exhaust to the stack"],
      I: ["Operator settings", "Temperatures and alarms on a panel"],
      L: ["Operators on each shift", "None"],
    },
    operators: [
      "Two operators per shift and a supervisor",
      "Motors, burner, controls",
      "Open shed, hot and dusty",
      "Shift log",
      "The owner approves shutdowns",
    ],
    missing: [],
  })
}

function stageD14(stage: Stage) {
  return payloadOf({
    sentTo: stage.email,
    sentBy: loginFor("OM"),
    subject: `Acknowledgement of ${stage.title} request`,
    body: `Dear ${stage.contact},\n\nThank you for reaching out to IMHOGEN LTD. We have successfully received your project inquiry.\n\nBest regards`,
    dateSent: "2026-11-06",
    timeSent: "10:00",
    deliveryStatus: "Delivered",
  })
}

function stageD15(stage: Stage) {
  return payloadOf({
    slots: meetingSlots,
    offeredSlots: meetingSlots,
    sentToClientAt: new Date().toISOString(),
    emailText: schedulingEmail(
      {
        contact: stage.contact,
        title: stage.title,
        requestId: stage.requestId,
      },
      meetingSlots
    ),
    chosenSlot: 1,
    agreedDate: meetingSlots[0]!.date,
    agreedTime: meetingSlots[0]!.time,
    agreedTimeZone: meetingSlots[0]!.timeZone,
    clientConfirmed: true,
    platform: "Google Meet",
    meetingLink: "https://meet.google.com/abc-defg-hij",
    calendarInviteSent: false,
  })
}

function stageD16(stage: Stage) {
  return payloadOf({
    meetingDate: meetingSlots[0]!.date,
    meetingTime: meetingSlots[0]!.time,
    meetingTimeZone: meetingSlots[0]!.timeZone,
    platform: "Google Meet",
    meetingLink: "https://meet.google.com/abc-defg-hij",
    imhogenAttendees: [
      { personId: "role:OM", name: "Onboarding Manager", role: "OM" },
      { personId: "role:PM", name: "Project Manager", role: "PM" },
    ],
    clientAttendees: stage.contact,
    agenda: defaultAgenda,
    inviteSentAt: "2026-11-07T09:00:00.000Z",
    inviteSequence: 0,
    preMeetingChecks: preMeetingChecks.map((each) => ({
      ...each,
      status: DONE,
    })),
  })
}

function stageD17(stage: Stage) {
  return payloadOf({
    actualDate: meetingSlots[0]!.date,
    actualStartTime: meetingSlots[0]!.time,
    actualEndTime: "11:40",
    imhogenPresent: [{ name: staffWith("OM").name, present: true }],
    clientPresent: [{ name: stage.contact, present: true }],
    discussion: [
      {
        minutes: 15,
        topic: "Technical Requirements (Inputs/Outputs)",
        rawNotes: "Throughput and power supply confirmed as on the web form.",
        remarks: "Confirm the site's three-phase capacity.",
      },
    ],
    parkingLot: [],
    primaryOutcome: "Requirements are clear enough to assess.",
    clientNextStep: "Send the site's power bill.",
    imhogenNextStep: "Lead Engineer writes the needs assessment.",
  })
}

// The LE confirmed the first two inputs and the main function; the rest is
// left empty, as the form allows.
function stageD18() {
  const [material, energy, ...otherCategories] = needsCategories
  const [functional, ...otherSpecs] = specCategories

  return payloadOf({
    constraints: [
      {
        category: material,
        confirmed: "Paddy at 14 percent moisture, 1 t/h",
        remarks: "",
      },
      {
        category: energy,
        confirmed: "415 V three phase, 60 kW available",
        remarks: "Check the transformer rating",
      },
      ...otherCategories.map((category) => ({
        category,
        confirmed: "",
        remarks: "",
      })),
    ],
    designSpecs: [
      {
        category: functional!,
        requirement: "Mill 1 t/h of paddy",
        priority: "Fixed",
        tolerance: "± 10 percent",
      },
      ...otherSpecs.map((category) => ({ category })),
    ],
    leadEngineerSignature: {
      signedBy: "role:LE",
      signedAt: "2026-09-25T10:00:00.000Z",
    },
  })
}

const stageT3Intake = {
  sourceAssets: [
    {
      assetType: "Physical part",
      formatDescription: "The part in service on site",
      condition: "Worn but complete",
      actionRequired: "Measure on site",
      notes: "",
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
  ],
  qualityGate: qualityGateQuestions.map((question) => ({
    question,
    answer: "No",
    reason: "General tolerances are enough",
  })),
}

function stageT3D18a() {
  return payloadOf({
    equipment: [
      {
        tool: "Tape Measure",
        serial: "-",
        calibration: "-",
        accuracy: "Trusted supplier (Tolsen)",
        notes: "No calibration performed",
      },
    ],
    dimensions: [
      {
        feature: "Hopper outline",
        method: "Tape Measure",
        value: "2400 x 1800 x 1500",
        photo: "https://drive.example.com/konongo/outline",
        confidence: "Medium",
        notes: "Measured out to out",
      },
    ],
    photos: [
      {
        view: "All views captured",
        captured: "Yes",
        file: "https://drive.example.com/konongo/photos",
        quality: "Clear",
      },
    ],
    leadMeasurerSignature: {
      signedBy: "role:AE",
      signedAt: "2026-09-29T10:00:00.000Z",
    },
  })
}

// Every Tier 1 tool built, in order, as each stage project has it.
// The OM's internal review request, every review done, approved by the HE.
function stageD19() {
  return payloadOf({
    primaryObjective:
      "Confirm the information is accurate and the client's demands are realistic.",
    priority: "High",
    reviews: reviewDirectives.map((each) => ({
      ...each,
      status: "Passed",
    })),
  })
}

// The Lead Engineer's capability assessment, signed and approved by the PM:
// capable with the schedule adjusted.
function stageD110() {
  const answered = (criteria: readonly string[], status: string) =>
    criteria.map((criterion) => ({
      criterion,
      status,
      justification: "Checked against the current team and workshop.",
    }))

  return payloadOf({
    technicalCapability: answered(technicalCriteria, "Yes"),
    additionalCapacity: [
      {
        criterion: "Mechanical / Structural Engineering Review",
        status: "Partial",
        justification: "The existing frame needs an engineering review.",
      },
    ],
    commercialAlignment: answered(commercialCriteria, "Partial"),
    overallCapabilityStatus: "Partially Capable",
    primaryBottleneck: "The requested timeline against the core team's size.",
    assessorSignature: {
      signedBy: "role:LE",
      signedAt: "2026-09-30T10:00:00.000Z",
    },
  })
}

// The Lead Engineer's risk assessment, signed and approved by the PM: one
// risk, the four questions answered, a conditional go.
function stageD111() {
  return payloadOf({
    primaryObjective:
      "Assess the technical, schedule and commercial risks of the requested scope.",
    risks: [
      {
        category: "Requested timeline",
        description: "The full scope may not fit the client's timeline.",
        probability: "H",
        impact: "H",
        mitigation: "Agree a phased schedule before committing.",
        owner: "Project Manager",
      },
    ],
    conclusionQuestions: conclusionQuestions.map((question) => ({
      question,
      status: "Yes, Conditional",
      remarks: "Manageable with the phased schedule.",
    })),
    overallRiskProfile: "High, manageable with conditions.",
    goNoGoDecision: "Conditional Go",
    assessorSignature: {
      signedBy: "role:LE",
      signedAt: "2026-10-02T10:00:00.000Z",
    },
  })
}

// The Lead Engineer's feasibility report, signed and approved by the PM.
function stageD112() {
  return payloadOf({
    capability: capabilityDomains.map((domain) => ({
      domain,
      status: "Partial",
      findings: "Capable with the schedule adjusted.",
    })),
    criticalRisks: [
      {
        risk: "Requested timeline: the full scope may not fit it.",
        impact: "High",
        mitigation: "The contract sets a realistic, phased schedule.",
      },
    ],
    realisticTimeline: "8 weeks",
    costFloor: 80000,
    commercialNotes: "The complete scope needs about 8 weeks.",
    recommendation: "Feasible with a revised scope and timeline.",
    assessorSignature: {
      signedBy: "role:LE",
      signedAt: "2026-10-05T10:00:00.000Z",
    },
  })
}

// The Lead Engineer's scope of work, with its alignment meeting booked and
// the invite sent, signed and approved by the PM.
function stageD113() {
  const slot = { date: "2026-10-08", time: "10:00", timeZone: "Africa/Accra" }

  return payloadOf({
    vision: "A complete, controlled engineering documentation package.",
    includedScope: [
      {
        category: "Engineering Design / Reverse Engineering",
        description: "An accurate 3D model of the existing unit.",
        format: "Native CAD + STEP",
        phase: "Phase 1-2",
      },
    ],
    excludedScope: [
      {
        category: "Physical Fabrication",
        description: "Building further units is excluded.",
        reasoning: "This is a documentation engagement.",
      },
    ],
    phases: [
      {
        name: "Engineering Review & Scope Confirmation",
        activities: "Review measurements, confirm the documentation basis.",
        duration: "1 week",
        target: "Week 1",
      },
    ],
    clientResponsibilities: [
      {
        requirement: "Client Engineering Decision",
        description: "Choose as-is, modify or redesign.",
        due: "Before scope lock",
        status: "Done",
      },
    ],
    slots: [slot],
    offeredSlots: [slot],
    sentToClientAt: "2026-10-06T09:00:00.000Z",
    chosenSlot: 1,
    agreedDate: slot.date,
    agreedTime: slot.time,
    agreedTimeZone: slot.timeZone,
    clientConfirmed: true,
    platform: "Google Meet",
    meetingLink: "https://meet.google.com/abc-defg-hij",
    inviteSentAt: "2026-10-06T12:00:00.000Z",
    inviteSequence: 0,
    signature: {
      signedBy: "role:LE",
      signedAt: "2026-10-09T10:00:00.000Z",
    },
  })
}

// The Lead Engineer's cost estimate, above D1.12's GHS 80,000 floor and
// allocated in full to D1.13's one deliverable, signed by the LE and the PM.
function stageD114() {
  return payloadOf({
    labor: [
      { module: "Mechanical", days: 40, dailyRate: 1000, total: 40000 },
      { module: "Electronics", days: 20, dailyRate: 1000, total: 20000 },
    ],
    directCosts: [
      {
        item: "3D Printing Housing",
        quantity: 2,
        unitCost: 5000,
        total: 10000,
      },
    ],
    markups: [
      {
        category: "Project Management & QC",
        rate: 15,
        value: 9000,
        notes: "Applied to Base Labor",
      },
      {
        category: "Administrative Overhead",
        rate: 7,
        value: 4900,
        notes: "Fixed Institutional Cost",
      },
      {
        category: "Sustainability / Risk Margin",
        rate: 15,
        value: 10500,
        notes: "Varies by Project Risk (D1.11)",
      },
    ],
    allocations: [
      { deliverable: "Engineering Design / Reverse Engineering", cost: 94400 },
    ],
    totalProjectValue: 94400,
    costFloor: 80000,
    minimumOverheadMet: true,
    leadEngineerSignature: {
      signedBy: "role:LE",
      signedAt: "2026-10-12T10:00:00.000Z",
    },
    financeSignature: {
      signedBy: "role:PM",
      signedAt: "2026-10-13T10:00:00.000Z",
    },
  })
}

// The Lead Engineer's brief, from D1.13 and D1.14, signed by the LE and the
// PM.
function stageD115() {
  return payloadOf({
    targetStartDate: "2026-11-02",
    vision: "A complete, controlled engineering documentation package.",
    objectives: [
      { objective: "An accurate 3D model of the existing unit." },
      { objective: "Drawings the workshop can build from." },
    ],
    phases: [
      {
        phaseNo: "1",
        name: "Engineering Review & Scope Confirmation",
        deliverables: "Review measurements, confirm the documentation basis.",
        duration: "1 week",
        target: "Week 1",
      },
    ],
    budget: [
      {
        deliverable: "Engineering Design / Reverse Engineering",
        value: 94400,
        paymentSchedule: "40% at Contract Signing, 60% at Handover",
      },
    ],
    outOfScope: "Physical Fabrication: building further units is excluded.",
    clientDependencies:
      "Client Engineering Decision: choose as-is, modify or redesign.",
    headOfRdSignature: {
      signedBy: "role:LE",
      signedAt: "2026-10-15T10:00:00.000Z",
    },
    approverSignature: {
      signedBy: "role:PM",
      signedAt: "2026-10-16T10:00:00.000Z",
    },
  })
}

// The Lead Engineer's Tier 3 quote, signed by the LE.
function stageT3D115a() {
  return payloadOf({
    deliverables: t3Deliverables.map((each) => ({
      ...each,
      qty: 1,
      timeline: "2 weeks",
    })),
    pricing: [
      {
        description: t3PricingLines[0]!,
        rate: 500,
        qty: 80,
        subtotal: 40000,
      },
      {
        description: t3PricingLines[1]!,
        rate: 15000,
        qty: 1,
        subtotal: 15000,
      },
      {
        description: t3PricingLines[2]!,
        rate: 5000,
        qty: 1,
        subtotal: 5000,
        financeNotes: "Admin fee",
      },
    ],
    totalT3ProjectValue: 60000,
    exclusions: t3Exclusions.map((exclusion) => ({ exclusion })),
    leadEngineerSignature: {
      signedBy: "role:LE",
      signedAt: "2026-10-15T10:00:00.000Z",
    },
  })
}

// The Lead Engineer's handoff to contracting, signed by the LE and the PM.
function stageD116(briefTool: string) {
  return payloadOf({
    meetingDate: "2026-10-20",
    meetingTime: "10:00",
    scopeSummary:
      "IMHOGEN will model the existing unit in 3D and deliver a drawing set. Fabrication is excluded.",
    paymentTerms: "40% at Contract Signing, 60% at Handover",
    directives: handoffDirectives.map((each) => ({
      category: each.category,
      directive: "State it in the contract.",
      source: each.source === "D1.15" ? briefTool : each.source,
    })),
    checklist: handoffChecklist.map((each) => ({ ...each, status: "Done" })),
    engineeringRelease: {
      signedBy: "role:LE",
      signedAt: "2026-10-20T12:00:00.000Z",
    },
    contractingAcceptance: {
      signedBy: "role:PM",
      signedAt: "2026-10-21T10:00:00.000Z",
    },
  })
}

function tier1Records(name: string): SeedRecord[] {
  const stage = stageOf(name)
  const files = stageFiles(stage)

  return [
    { toolId: "D1.1", state: "locked", day: 0, payload: d11(files) },
    {
      toolId: "D1.2",
      state: "locked",
      day: 1,
      payload: d12(files, stageTriage, "Proceed to D1.3"),
    },
    { toolId: "D1.3", state: "locked", day: 2, payload: stageD13(stage) },
    { toolId: "D1.4", state: "locked", day: 3, payload: stageD14(stage) },
    { toolId: "D1.5", state: "locked", day: 4, payload: stageD15(stage) },
    { toolId: "D1.6", state: "locked", day: 5, payload: stageD16(stage) },
    { toolId: "D1.7", state: "locked", day: 7, payload: stageD17(stage) },
    { toolId: "D1.8", state: "locked", day: 9, payload: stageD18() },
    { toolId: "D1.9", state: "locked", day: 11, payload: stageD19() },
    { toolId: "D1.10", state: "locked", day: 13, payload: stageD110() },
    { toolId: "D1.11", state: "locked", day: 15, payload: stageD111() },
    { toolId: "D1.12", state: "locked", day: 17, payload: stageD112() },
    { toolId: "D1.13", state: "locked", day: 20, payload: stageD113() },
    { toolId: "D1.14", state: "locked", day: 23, payload: stageD114() },
    { toolId: "D1.15", state: "locked", day: 25, payload: stageD115() },
    {
      toolId: "D1.16",
      state: "locked",
      day: 27,
      payload: stageD116("D1.15"),
    },
  ]
}

function tier3Records(name: string): SeedRecord[] {
  const stage = stageOf(name)
  const files = stageFiles(stage)

  return [
    { toolId: "D1.1", state: "locked", day: 0, payload: d11(files) },
    {
      toolId: "D1.2",
      state: "locked",
      day: 1,
      payload: d12(files, stageTriage, "Proceed to D1.3"),
    },
    { toolId: "T3.D1.3a", state: "locked", day: 2, payload: stageT3Intake },
    { toolId: "D1.4", state: "locked", day: 3, payload: stageD14(stage) },
    { toolId: "T3.D1.8a", state: "locked", day: 6, payload: stageT3D18a() },
    { toolId: "D1.9", state: "locked", day: 8, payload: stageD19() },
    { toolId: "D1.10", state: "locked", day: 10, payload: stageD110() },
    { toolId: "D1.11", state: "locked", day: 12, payload: stageD111() },
    { toolId: "D1.12", state: "locked", day: 14, payload: stageD112() },
    { toolId: "D1.13", state: "locked", day: 17, payload: stageD113() },
    { toolId: "D1.14", state: "locked", day: 20, payload: stageD114() },
    {
      toolId: "T3.D1.15a",
      state: "locked",
      day: 22,
      payload: stageT3D115a(),
    },
    {
      toolId: "D1.16",
      state: "locked",
      day: 24,
      payload: stageD116("T3.D1.15a"),
    },
  ]
}

// Every tool built locked on the Locked projects. On the Unlocked ones only
// the client's web form exists, as a draft the client can still change, and
// every other tool opens empty.
function unlocked(name: string): SeedRecord[] {
  return [
    {
      toolId: "D1.1",
      state: "draft",
      day: 0,
      payload: d11(stageFiles(stageOf(name))),
    },
  ]
}

const signedBy = z.object({ signedBy: z.string() })

// The records before the tool being built, all locked, then the tool itself
// at the project's stage: not started, waiting for approval, or approved.
function toolRecords(project: SeedProject, stage: ToolStage): SeedRecord[] {
  const all =
    project.serviceTrack === "Tier_1"
      ? tier1Records(project.name)
      : tier3Records(project.name)

  const tool = currentToolFor(project.serviceTrack)
  const at = all.findIndex((record) => record.toolId === tool)
  const before = all.slice(0, at)

  if (stage === "open") {
    return before
  }

  const current = all[at]!

  if (stage === "locked") {
    return [...before, { ...current, state: stage }]
  }

  // Waiting for approval, so the approver has not signed yet.
  const approverSigns = `role:${approverOf(tool)}`

  return [
    ...before,
    {
      ...current,
      state: stage,
      payload: Object.fromEntries(
        Object.entries(current.payload).filter(
          ([, value]) =>
            signedBy.safeParse(value).data?.signedBy !== approverSigns
        )
      ),
    },
  ]
}

export const projectRecords = new Map<string, SeedRecord[]>([
  ...toolProjects.map(
    ({ project, stage }) => [project.name, toolRecords(project, stage)] as const
  ),
  [NEEDS_TEAM, [{ ...unlocked(NEEDS_TEAM)[0]!, state: "locked" }]],
  [`${DEV_LOCKED} (Tier 1)`, tier1Records(`${DEV_LOCKED} (Tier 1)`)],
  [`${DEV_UNLOCKED} (Tier 1)`, unlocked(`${DEV_UNLOCKED} (Tier 1)`)],
  [`${DEV_LOCKED} (Tier 3)`, tier3Records(`${DEV_LOCKED} (Tier 3)`)],
  [`${DEV_UNLOCKED} (Tier 3)`, unlocked(`${DEV_UNLOCKED} (Tier 3)`)],
])

// Requests to unlock a locked record, waiting for the project's PM: on the
// approved project, a change to the client's web form.
export const projectChangeRequests = new Map<string, SeedChangeRequest[]>([
  [
    toolProjectName("Tier_1", "locked"),
    [
      {
        toolId: "D1.1",
        day: 4,
        reason:
          "The client emailed a photo of the equipment nameplate. It belongs with the attached files.",
      },
    ],
  ],
])

export const projectComments = new Map<string, SeedComment[]>([
  [
    `${DEV_LOCKED} (Tier 1)`,
    [
      {
        toolId: "D1.2",
        role: "PM",
        hour: 3,
        body: "The second photo looks like a different site from the address on the form. Did the client confirm it?",
        replies: [
          {
            role: "OM",
            hour: 5,
            body: "Yes. I called them: it is the old boiler house behind the main plant, same address.",
          },
        ],
      },
      {
        toolId: "D1.2",
        role: "OM",
        hour: 1,
        body: "The client's email has a typo. I used the one from their website.",
        resolved: true,
        replies: [
          {
            role: "PM",
            hour: 2,
            body: "Good. Put the right one in D1.3 as well.",
          },
        ],
      },
    ],
  ],
])
