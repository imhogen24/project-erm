import { z } from "zod"

import type { JsonObject } from "@/db/schema"

import {
  DONE as INVOICE_DONE,
  FAIL,
  NO,
  PASS,
  PENDING,
  YES as INVOICE_YES,
  conversionTasks,
  qualityChecks,
} from "@/lib/approved-invoice"
import { DONE, defaultAgenda, preMeetingChecks } from "@/lib/calendar-agenda"
import { schedulingEmail } from "@/lib/meeting-proposal"
import { commercialCriteria, technicalCriteria } from "@/lib/capability"
import { capabilityDomains } from "@/lib/feasibility"
import { reviewDirectives } from "@/lib/internal-review"
import { conclusionQuestions } from "@/lib/risk"
import { handoffChecklist, handoffDirectives } from "@/lib/handoff"
import { needsCategories, specCategories } from "@/lib/needs-assessment"
import { contractDefaults, standardClauses } from "@/lib/standard-contract"
import {
  appendices,
  coreVariables,
  legalDirectives,
  paymentSchedules,
  phases,
} from "@/lib/initial-draft"
import { ipOptions } from "@/lib/t3-contract"
import {
  CONTRACT_ADMIN,
  DONE as TASK_DONE,
  archiveTasks,
  contractVariables,
} from "@/lib/baseline"
import {
  APPROVED_FOR_CLIENT,
  macroRisks,
  signOffCheckpoints,
} from "@/lib/executive-review"
import { deliverableCategories, projectMilestones } from "@/lib/pm-review"
import {
  OVERHEAD_MET,
  financialElements,
  paymentMilestones,
  riskProtections,
} from "@/lib/finance-review"
import {
  t3Deliverables,
  t3Exclusions,
  t3PricingLines,
} from "@/lib/project-brief"
import { qualityGateQuestions } from "@/workbooks/wb01/tools/t3-d1-3a"

import {
  ACCEPTED_AS_IS,
  REQUESTED_NEGOTIATION,
  scriptFor,
  subjectFor,
} from "@/lib/transmittal"
import { YES, inviteScriptFor } from "@/lib/negotiation-invite"
import { TERMS_AGREED } from "@/lib/negotiation-notes"
import { UPDATED, finalTasks } from "@/lib/final-contract"
import { APP_PLATFORM, SCAN, financeTasks } from "@/lib/executed-contract"
import { vaultDocuments } from "@/lib/archive"
import {
  complianceRules,
  paymentMilestones as termsMilestones,
} from "@/lib/payment-terms"
import { PROCEED } from "@/lib/billing-trigger"
import { formatNumber, sequences } from "@/lib/sequences"
import {
  CLIENT_ROLE,
  COURIER,
  DIGITAL,
  IMHOGEN_ROLE,
  SIGNED,
  signatureScriptFor,
} from "@/lib/signature-contract"
import {
  CONTINUE_WAITING,
  PROCEED as BANK_PROCEED,
  YES as FUNDS_YES,
  accountChecked,
} from "@/lib/bank-statement-log"
import { companyBank } from "@/lib/company"
import { scriptFor as transmittedScript } from "@/lib/transmitted-invoice"
import { DEV_LOCKED, DEV_UNLOCKED } from "@/server/workflow/dev-unlocked"

import { loginFor, staffWith } from "./people"
import {
  ACCEPTED_AS_IS_PROJECT,
  INVOICE_APPROVED_PROJECT,
  INVOICE_DRAFTED_PROJECT,
  INVOICE_SENT_BACK_PROJECT,
  INVOICE_SENT_PROJECT,
  BANK_WAITING_PROJECT,
  BANK_FEE_PROJECT,
  HALF_PAID_PROJECT,
  PAPER_SIGNED_PROJECT,
  TRIGGER_APPROVED_PROJECT,
  TRIGGER_WAITING_PROJECT,
  approverOf,
  client,
  currentToolFor,
  NEEDS_TEAM,
  requestIdOf,
  routeOf,
  seedProjectNamed,
  testProjectName,
  testProjects,
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
// locked, and the Every Tool Unlocked ones only the client's web form. Each
// Test project has every tool before its own locked, so its tool is open.

export type SeedState = "draft" | "submitted" | "locked"

export type SeedRecord = {
  toolId: string
  // The payment milestone cycle of a tool run once per milestone, such as
  // D3.3. Left out, cycle 1.
  cycle?: number
  state: SeedState
  // Days after the request arrived that the record was started.
  day: number
  payload: JsonObject
  // Why an approver sent a draft back, shown to the writer on the tool page.
  sentBackReason?: string
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

// The CA's standard contract template: the eight clauses with Limitation of
// Liability archived, one clause the CA added, and 40% on execution. Locked
// as the CA submitted it, since nobody approves D2.1.
function stageD21() {
  return payloadOf({
    lastLegalReviewDate: "2026-10-22",
    reviewedBy: staffWith("PM").name,
    jurisdiction: contractDefaults.jurisdiction,
    currency: contractDefaults.currency,
    executionPercentage: 40,
    clauses: [
      ...standardClauses.map((clause) => ({
        category: clause.category,
        text: clause.text,
        status:
          clause.category === "Limitation of Liability" ? "Archived" : "Active",
      })),
      {
        category: "Site Access",
        text: "The Client gives IMHOGEN safe access to the site during working hours.",
        status: "Active",
      },
    ],
  })
}

// The CA's initial draft contract, signed and submitted, which locked it, so
// D2.3 is open for the PM.
function stageD22() {
  const values = [client.organisation, client.name, "GHS 94,400.00", "8 weeks"]

  return payloadOf({
    draftedBy: staffWith("CA").name,
    draftDate: "2026-10-24",
    coreVariables: coreVariables.map((row, index) => ({
      variable: row.variable,
      value: values[index]!,
    })),
    paymentMilestones: paymentSchedules.map((milestone, index) => ({
      milestone,
      schedule: index === 0 ? "40% at Contract Signing, 60% at Handover" : "-",
    })),
    projectMilestones: phases.map((milestone, index) => ({
      milestone,
      timeline: index === 0 ? "1 week" : "-",
    })),
    deliverables: phases.map((phase) => ({
      deliverableNumber: phase,
      deliverable: `[${phase} Key Deliverables]`,
    })),
    legalDirectives: legalDirectives.map((category) => ({
      category,
      clause: "Stated in the contract.",
      location: "Section 4.1",
    })),
    appendices: appendices.map((row) => ({
      attachment: row.attachment,
      status: "Attached",
    })),
    initialDraftComplete: "Yes",
    readyForPmReview: "Yes",
    routingDate: "2026-10-24",
    caSignature: {
      signedBy: "role:CA",
      signedAt: "2026-10-24T10:00:00.000Z",
    },
  })
}

// The OM's Tier 3 contract mapping with Standard Release, signed by the FO,
// the PM and the client, which locked it, so D2.3 is open for the PM.
function stageT3D22a() {
  return payloadOf({
    ipElection: ipOptions.map((row, index) => ({
      picked: index === 0,
      option: row.option!,
      definition: row.definition!,
      ...(row.fee !== undefined && { fee: Number(row.fee) }),
    })),
    foSignature: { signedBy: "role:FO", signedAt: "2026-10-28T10:00:00.000Z" },
    pmSignature: { signedBy: "role:PM", signedAt: "2026-10-28T12:00:00.000Z" },
    clientSignature: {
      signedBy: "role:Client",
      signedAt: "2026-10-29T10:00:00.000Z",
    },
  })
}

// The PM's review of the draft, approved, signed and submitted, which locked
// it, so D2.4 is open for the FO. Tier 3 has no D1.15, so 4.0 holds the one
// row the PM filled in.
function stageD23() {
  return payloadOf({
    scopeVerification: deliverableCategories.map((category) => ({
      category,
      clauseRef: "Section 2.1",
      status: "Accurate",
    })),
    projectVerification: projectMilestones.map((milestone) => ({
      milestone,
      timeline: "As drafted",
      feasible: "Yes",
    })),
    clientDependencies: [
      {
        dependency: "Client must sign off on CAD before Fab",
        clauseRef: "Section 4.2",
        protected: "Yes",
      },
    ],
    operationalStatus: "Approved",
    dateReviewCompleted: "2026-11-02",
    signOffDate: "2026-11-02",
    pmSignature: {
      signedBy: "role:PM",
      signedAt: "2026-11-02T10:00:00.000Z",
    },
  })
}

// The FO's review of the draft, approved, signed and submitted, which locked
// it, so D2.5 follows for the Head of R&D / Ops. Row 2.2 holds D1.14's
// answer, filled in each time it is shown.
function stageD24() {
  return payloadOf({
    valueVerification: financialElements.map((element, index) => ({
      element,
      clauseRef: index === 1 ? `[${OVERHEAD_MET}]` : "Section 3.1",
      status: "Accurate",
    })),
    paymentVerification: paymentMilestones.map((milestone) => ({
      milestone,
      clauseRef: "Section 3.3",
      cashFlowSafe: "Yes",
    })),
    riskVerification: riskProtections.map((protection) => ({
      protection,
      clauseRef: "Section 8.1",
      protected: "Yes",
    })),
    commercialStatus: "Approved",
    dateReviewCompleted: "2026-11-04",
    signOffDate: "2026-11-04",
    foSignature: {
      signedBy: "role:FO",
      signedAt: "2026-11-04T10:00:00.000Z",
    },
  })
}

// The Head of R&D / Ops's review, approved for client transmission, signed
// and submitted, which locked it, so D2.6 follows for the CA.
function stageD25() {
  return payloadOf({
    signOffVerification: signOffCheckpoints.map((checkpoint) => ({
      checkpoint,
      status: "Verified",
    })),
    riskAssessment: macroRisks.map((risk) => ({
      ...risk,
      status: "Yes",
    })),
    strategicAlignment: "Yes",
    justification: "Establishes a foothold in agricultural processing.",
    executiveDecision: APPROVED_FOR_CLIENT,
    signOffDate: "2026-11-06",
    heSignature: {
      signedBy: "role:HE",
      signedAt: "2026-11-06T10:00:00.000Z",
    },
  })
}

// The CA's baseline, every task Done, signed and submitted, which locked it,
// so D2.7 is open for the CA to email the draft contract. The value is the
// tier's approved total: D1.15's on Tier 1, T3.D1.15a's on Tier 3.
function stageD26(value: string, floor: string) {
  const baselines = [value, "40%", "8 weeks", "30 Days Post-Delivery"]
  const limits = [floor, "35%", "7 weeks", "60 Days"]

  return payloadOf({
    lockExecutedBy: staffWith("CA").name,
    dateLocked: "2026-11-08",
    baseline: contractVariables.map((row, index) => ({
      variable: row.variable,
      baselineValue: baselines[index]!,
      absoluteLimit: limits[index]!,
    })),
    archiveTasks: archiveTasks.map((task) => ({
      task,
      assignee: CONTRACT_ADMIN,
      status: TASK_DONE,
    })),
    readyForTransmittal: "Yes",
    verificationDate: "2026-11-08",
    caSignature: {
      signedBy: "role:CA",
      signedAt: "2026-11-08T10:00:00.000Z",
    },
  })
}

// The CA's email of the draft contract to the client, sent without a
// follow-up, with the client's reply recorded and submitted, which locked it.
// Requested Negotiation opens D2.8 for the CA; Accepted as-is does not.
function stageD27(projectName: string, reply = REQUESTED_NEGOTIATION) {
  return payloadOf({
    sentTo: client.email,
    sentBy: staffWith("CA").name,
    dateSent: "2026-11-10",
    timeSent: "10:00",
    subject: subjectFor(projectName),
    quoteExpiry: "2026-12-10",
    script: scriptFor(client.organisation, projectName),
    followUpScheduled: "No",
    initialResponse: reply,
  })
}

// The CA's negotiation meeting invite, sent to the client for 1 December at
// 10:00 and submitted with every 4.0 answer Yes, which locked it and opened
// D2.9 for the meeting's notes.
function stageD28(projectName: string) {
  const when = "Tue, 1 Dec 2026, 10:00 GMT"

  return payloadOf({
    proposedDate: "2026-12-01",
    meetingTime: "10:00",
    platform: "Google Meet",
    meetingLink: "https://meet.google.com/abc-defg-hij",
    imhogenReps: "Lead PM & Head of R&D",
    clientReps: client.name,
    clientConcerns: "Wants a 10% discount and the timeline cut to 6 weeks.",
    hardLimits: "Advance Payment %: Absolute minimum 35% to cover initial BOM",
    script: inviteScriptFor(client.organisation, projectName)
      .replace(
        "[Insert 1-2 words on their concern,e.g.,the delivery timeline]",
        "the total value and timeline"
      )
      .replace("[Proposed Date & Time]", when),
    clientConfirmed: YES,
    preMeetHeld: YES,
    readyForMeeting: YES,
    inviteSentAt: "2026-11-12T10:00:00.000Z",
    inviteSequence: 0,
    inviteWhen: when,
  })
}

// The negotiation meeting's notes: two clauses the client challenged and
// what was agreed, one item left open, signed and submitted with Terms
// Agreed, which locked it and opened D2.10.
function stageD29() {
  return payloadOf({
    actualDate: "2026-12-01",
    startEndTime: "10:00 to 10:45",
    leadNegotiator: staffWith("CA").name,
    clientNegotiator: client.name,
    redlines: [
      {
        clause: "Sec 3.1 - Total Value",
        requestedChange: "Wants 10% discount on final price",
        baselineLimit: "Min viable is GHS 90,000",
        resolution: "Agreed to a discount down to the walk-away floor",
      },
      {
        clause: "Sec 4.1 - Timeline",
        requestedChange: "Wants delivery compressed to 6 weeks",
        baselineLimit: "Min 7 weeks",
        resolution: "IMHOGEN held firm at 7 weeks",
      },
    ],
    parkingLot: [
      {
        item: "Client legal to review the IP buyout wording",
        owner: "Client Legal Team",
        deadline: "2026-12-08",
      },
    ],
    meetingOutcome: TERMS_AGREED,
    nextSteps: "Contract Admin to apply the discount to the final contract.",
    leadSignature: {
      signedBy: "role:CA",
      signedAt: "2026-12-01T11:00:00.000Z",
    },
  })
}

// The finalized contract: D2.9's two concessions written into the contract,
// at the tier's own walk-away floor, the FO's re-check and the CA signed, and
// the tasks done, which locked it and opened D2.11. A contract accepted as it
// was has no amendments and no re-check.
function stageD210(finalValue: string | undefined) {
  if (!finalValue) {
    return payloadOf({
      editedBy: staffWith("CA").name,
      finalEditDate: "2026-11-20",
      amendments: [],
      finalTasks: finalTasks.map((task) => ({
        task,
        assignee: CONTRACT_ADMIN,
        status: TASK_DONE,
      })),
      readyForSignature: "Yes",
      caSignature: {
        signedBy: "role:CA",
        signedAt: "2026-11-20T10:00:00.000Z",
      },
    })
  }

  return payloadOf({
    editedBy: staffWith("CA").name,
    finalEditDate: "2026-12-03",
    amendments: [
      {
        concession: "Agreed to a discount down to the walk-away floor",
        section: "Section 3.1",
        newText: `Total Contract Value is ${finalValue}`,
        status: UPDATED,
      },
      {
        concession: "IMHOGEN held firm at 7 weeks",
        section: "Section 4.1",
        newText: "Total Project Timeline is 7 weeks from the advance payment",
        status: UPDATED,
      },
    ],
    financeSignature: {
      signedBy: "role:FO",
      signedAt: "2026-12-02T15:00:00.000Z",
    },
    finalTasks: finalTasks.map((task) => ({
      task,
      assignee: CONTRACT_ADMIN,
      status: TASK_DONE,
    })),
    readyForSignature: "Yes",
    caSignature: {
      signedBy: "role:CA",
      signedAt: "2026-12-03T10:00:00.000Z",
    },
  })
}

// The final contract sent and signed, which locked D2.11 and opened D2.12:
// in the app, the client then the HE; on paper, both dates recorded by the
// CA. The seed's contract is a web link, not a PDF uploaded in the ERM, so
// D2.12 starts without the files the app makes from one.
function stageD211(method: string) {
  const sent = {
    routingMethod: method,
    sentTo: `${client.name} ${client.email}`,
    imhogenSignatory: `${staffWith("HE").name}, Head of Engineering`,
    autoReminder: "Yes",
    finalContract: "https://utfs.io/f/imho-final-contract-client-test-ltd",
    script: signatureScriptFor(
      client.organisation,
      staffWith("CA").name,
      method
    ),
    dateDispatched: "2026-12-04",
    dispatchedAt: "2026-12-04T09:00:00.000Z",
    dispatchConfirmed: "2026-12-04T09:00:05.000Z",
  }

  if (method === COURIER) {
    return payloadOf({
      ...sent,
      signatories: [
        {
          signatory: "[Client Name]",
          role: CLIENT_ROLE,
          dateSigned: "2026-12-07",
          status: SIGNED,
        },
        {
          signatory: "[IMHOGEN Rep]",
          role: IMHOGEN_ROLE,
          dateSigned: "2026-12-08",
          status: SIGNED,
        },
      ],
    })
  }

  return payloadOf({
    ...sent,
    clientViewedAt: "2026-12-04T15:00:00.000Z",
    clientSignature: {
      signedBy: "role:Client",
      signedAt: "2026-12-05T10:00:00.000Z",
    },
    heViewedAt: "2026-12-05T12:00:00.000Z",
    heSignature: {
      signedBy: "role:HE",
      signedAt: "2026-12-06T09:00:00.000Z",
    },
  })
}

// D2.8 and D2.9 follow D2.7 only where the client asked to negotiate, and
// D2.10 there after D2.9, then D2.11: on paper on the project signed that
// way, in the app on the others.
function negotiated(
  name: string,
  day: number,
  finalValue: string
): SeedRecord[] {
  const accepted = name === ACCEPTED_AS_IS_PROJECT
  const method = name === PAPER_SIGNED_PROJECT ? COURIER : DIGITAL

  return [
    ...(accepted
      ? []
      : ([
          { toolId: "D2.8", state: "locked", day, payload: stageD28(name) },
          {
            toolId: "D2.9",
            state: "locked",
            day: day + 2,
            payload: stageD29(),
          },
        ] satisfies SeedRecord[])),
    {
      toolId: "D2.10",
      state: "locked",
      day: day + 4,
      payload: stageD210(accepted ? undefined : finalValue),
    },
    {
      toolId: "D2.11",
      state: "locked",
      day: day + 7,
      payload: stageD211(method),
    },
    {
      toolId: "D2.12",
      state: "locked",
      day: day + 9,
      payload: stageD212(method),
    },
    {
      toolId: "D2.13",
      state: "locked",
      day: day + 10,
      payload: stageD213(),
    },
  ]
}

// Every contract document found in the vault and signed off, which locked
// D2.13 and opened D2.14.
function stageD213() {
  return payloadOf({
    vault: vaultDocuments.map((row) => ({
      naming: row.naming,
      status: TASK_DONE,
    })),
    allPresent: "Yes",
    caSignature: {
      signedBy: "role:CA",
      signedAt: "2026-12-10T10:00:00.000Z",
    },
  })
}

// The executed contract filed and the advance invoice issued, which the PM
// approved, locking D2.12 and opening D2.13 and Workbook 3. The seed's files
// are web links, as its contract is; a paper signing has no certificate.
function stageD212(method: string) {
  const digital = method === DIGITAL

  return payloadOf({
    platform: digital ? APP_PLATFORM : SCAN,
    executedPdf: "https://utfs.io/f/imho-executed-contract-client-test-ltd",
    ...(digital && {
      auditCertificate: "https://utfs.io/f/imho-signing-log-client-test-ltd",
    }),
    financeTrigger: financeTasks.map((row) => ({ ...row, status: TASK_DONE })),
    invoiceNumber: "IMHO-INV26-ADV-010",
    invoiceDate: "2026-12-09",
    fullyExecuted: "Yes",
    caSignature: {
      signedBy: "role:CA",
      signedAt: "2026-12-09T10:00:00.000Z",
    },
  })
}

// The executed contract's payment terms, which the PM approved, locking D3.1
// and opening D3.3: 40% on signing (the advance, billed through D2.12), 40%
// on design approval and 20% on handover, each Amount Due stored as D3.1's
// submit stores it.
function stageD31(total: number) {
  const shares = [40, 40, 20]

  return payloadOf({
    paymentSchedule: termsMilestones.map((milestone, index) => ({
      milestone,
      percentage: shares[index]!,
      amountDue: (total * shares[index]!) / 100,
      clauseRef: `Section 3.3.${index + 1}`,
    })),
    complianceRules: complianceRules.map(({ category, term }, index) => ({
      category,
      term,
      clauseRef: `Section 4.${index + 1}`,
    })),
    accepted: "Yes",
    foSignature: {
      signedBy: "role:FO",
      signedAt: "2026-12-12T09:00:00.000Z",
    },
  })
}

// The PM's trigger for a milestone, the design approval, 2.2, unless
// another is named, signed and submitted; once approved, the FO's decision
// is on it too.
function stageD33(
  decided: boolean,
  milestone = "2.2 Fabrication Milestone (Design Approval)"
) {
  return payloadOf({
    milestone,
    proofOfCompletion: "https://utfs.io/f/imho-design-approval-client-test-ltd",
    clientAccepted: "Yes",
    openDisputes: "No",
    pmSignature: {
      signedBy: "role:PM",
      signedAt: "2026-12-20T09:00:00.000Z",
    },
    ...(decided && {
      actionTaken: PROCEED,
      financeOfficer: staffWith("FO").name,
      dateReceived: "2026-12-20",
    }),
  })
}

// The FO's invoice for 2.2, at D3.1's 40% of the project total plus 15% VAT,
// signed and submitted, which locked it with its sums stored. Once the PM
// sends it back, the same draft is open again with the FO's signature cleared.
function stageD34(total = 94400, reopened = false) {
  const milestone = total * 0.4
  const vat = milestone * 0.15

  const payload: JsonObject = {
    invoiceNumber: SEEDED_INVOICE,
    billingAddress: `${client.organisation}
Accra`,
    lineItems: [
      {
        description: "Fabrication Milestone (Design Approval) (40% Milestone)",
        quantity: 1,
        unitPrice: milestone,
        totalAmount: milestone,
      },
      {},
    ],
    subtotal: milestone,
    vat,
    totalAmountDue: milestone + vat,
    draftComplete: "Yes",
    generatedBy: staffWith("FO").name,
    dateDrafted: "2026-12-22",
  }

  if (!reopened) {
    payload.foSignature = {
      signedBy: "role:FO",
      signedAt: "2026-12-22T09:00:00.000Z",
    }
  }

  return payloadOf(payload)
}

// The check the PM failed on the sent-back project, and the reason the app
// writes on the draft when a review sends work back (server/records/send-back).
const SENT_BACK_NOTE = "VAT should be 15% of the subtotal"

const SENT_BACK_REASON = `D3.5 sent it back: ${NO}. 2.2: ${SENT_BACK_NOTE}`

// The PM, as Head of Finance, checked 2.2's invoice at D3.5. With every check
// Passed, Yes and their signature lock it and open the approved invoice PDF.
// With one check Failed, No and their signature lock the review and send D3.4
// back to the FO; the conversion tasks stay Pending until an invoice is passed.
function stageD35(failed?: number) {
  return payloadOf({
    checklist: qualityChecks.map(({ point }, index) => ({
      point,
      status: index === failed ? FAIL : PASS,
      comments: index === failed ? SENT_BACK_NOTE : "",
    })),
    conversion: conversionTasks.map(({ task, assignee }) => ({
      task,
      assignee,
      status: failed === undefined ? INVOICE_DONE : PENDING,
    })),
    authorized: failed === undefined ? INVOICE_YES : NO,
    pmSignature: {
      signedBy: "role:PM",
      signedAt: "2026-12-24T09:00:00.000Z",
    },
  })
}

// The FO sent 2.2's approved invoice to the client at D3.6 on 24 Dec 2026,
// which started the 21-day payment clock and scheduled the reminder for
// 7 days before the due date.
function stageD36(name: string, amount = "GHS 43,424.00") {
  return payloadOf({
    sentTo: client.email,
    ccBcc: loginFor("PM"),
    subject: `IMHO GEN Invoice ${SEEDED_INVOICE} - ${name}`,
    dateSent: "2026-12-24",
    timeSent: "10:00",
    paymentDueDate: "2027-01-14",
    script: transmittedScript({
      clientName: client.organisation,
      milestone: "Fabrication Milestone (Design Approval)",
      invoiceNumber: SEEDED_INVOICE,
      amount,
      dueDate: "2027-01-14",
      windowDays: 21,
      bankName: companyBank.bankName,
    }),
    paymentClockStarted: "Yes",
    reminderScheduled: "Yes",
  })
}

// Two days the FO checked the bank after sending 2.2's invoice and found no
// payment, newest first, as D3.7 keeps them under Earlier Checks.
function earlierBankChecks(): JsonObject[] {
  return ["2026-12-29", "2026-12-28"].map((day) => ({
    dateOfCheck: day,
    timeOfCheck: "09:15",
    checkingOfficer: staffWith("FO").name,
    fundsDeposited: NO,
    actionRequired: CONTINUE_WAITING,
  }))
}

// The FO's check on 30 Dec 2026 that found the client's deposit for 2.2 and
// proceeded to D3.8: `deposited` against the invoice's `expected` total.
function stageD37(deposited: number, expected: number) {
  const variance = Math.round((deposited - expected) * 100) / 100

  return payloadOf({
    checkingOfficer: staffWith("FO").name,
    dateOfCheck: "2026-12-30",
    timeOfCheck: "09:15",
    accountChecked: accountChecked(),
    fundsDeposited: FUNDS_YES,
    amountDeposited: deposited,
    reference: `TRF FROM ${client.organisation.toUpperCase()} - ${SEEDED_INVOICE}`,
    valueDate: "2026-12-30",
    amountMatches: variance === 0 ? FUNDS_YES : NO,
    expectedAmount: expected,
    variance,
    actionRequired: BANK_PROCEED,
    foSignature: {
      signedBy: "role:FO",
      signedAt: "2026-12-30T09:15:00.000Z",
    },
    signedDate: "2026-12-30",
  })
}

// The running count the seeded D3.4's invoice number takes. The seed keeps
// the count past it, so the next invoice drafted takes the number after.
export const seededInvoice = { period: "26", value: 1 }

const SEEDED_INVOICE = formatNumber(
  sequences.invoice,
  seededInvoice.period,
  seededInvoice.value
)

// The first payment milestone cycle: D3.3 for 2.2 waiting for the FO, or
// approved by them, which opens D3.4 for 2.2, as on the D3.4 test
// projects; on the invoiced project, D3.4 for 2.2 locked and D3.3 for 2.3
// approved, which opens D3.4 for 2.3; on the approved project, D3.5 for
// 2.2 locked too, on the sent-back project that D3.5 failed and D3.4 is a
// draft for the FO again, and on the D3.5 test projects, D3.4 locked for
// the Head of Finance to approve.
function billingCycle(name: string): SeedRecord[] {
  const approved: SeedRecord = {
    toolId: "D3.3",
    cycle: 1,
    state: "locked",
    day: 60,
    payload: stageD33(true),
  }

  const invoice = (total = 94400): SeedRecord => ({
    toolId: "D3.4",
    cycle: 1,
    state: "locked",
    day: 62,
    payload: stageD34(total),
  })

  if (name === INVOICE_DRAFTED_PROJECT) {
    return [
      approved,
      invoice(),
      {
        toolId: "D3.3",
        cycle: 2,
        state: "locked",
        day: 64,
        payload: stageD33(true, "2.3 Final Handover (System Delivery)"),
      },
    ]
  }

  const passed = (): SeedRecord => ({
    toolId: "D3.5",
    cycle: 1,
    state: "locked",
    day: 64,
    payload: stageD35(),
  })

  if (name === INVOICE_APPROVED_PROJECT) {
    return [approved, invoice(), passed()]
  }

  if (name === INVOICE_SENT_PROJECT) {
    return [
      approved,
      invoice(),
      passed(),
      {
        toolId: "D3.6",
        cycle: 1,
        state: "locked",
        day: 65,
        payload: stageD36(name),
      },
    ]
  }

  const transmitted = (amount?: string): SeedRecord => ({
    toolId: "D3.6",
    cycle: 1,
    state: "locked",
    day: 65,
    payload: stageD36(name, amount),
  })

  if (name === BANK_WAITING_PROJECT) {
    return [
      approved,
      invoice(),
      passed(),
      transmitted(),
      {
        toolId: "D3.7",
        cycle: 1,
        state: "draft",
        day: 67,
        payload: { earlierChecks: earlierBankChecks() },
      },
    ]
  }

  // The FO logged 2.2's payment at D3.7 and proceeded: in full on the D3.8
  // test projects, 15.00 short (bank fees) or half of it on the others.
  const proceeded = (deposited: number, expected = 43424): SeedRecord => ({
    toolId: "D3.7",
    cycle: 1,
    state: "locked",
    day: 67,
    payload: stageD37(deposited, expected),
  })

  if (name === testProjectName("Tier_1", "D3.8")) {
    return [approved, invoice(), passed(), transmitted(), proceeded(43424)]
  }

  if (name === testProjectName("Tier_3", "D3.8")) {
    return [
      approved,
      invoice(60000),
      passed(),
      transmitted("GHS 27,600.00"),
      proceeded(27600, 27600),
    ]
  }

  if (name === BANK_FEE_PROJECT) {
    return [approved, invoice(), passed(), transmitted(), proceeded(43409)]
  }

  if (name === HALF_PAID_PROJECT) {
    return [approved, invoice(), passed(), transmitted(), proceeded(21712)]
  }

  if (name === testProjectName("Tier_1", "D3.7")) {
    return [approved, invoice(), passed(), transmitted()]
  }

  if (name === testProjectName("Tier_3", "D3.7")) {
    return [approved, invoice(60000), passed(), transmitted("GHS 27,600.00")]
  }

  if (name === testProjectName("Tier_1", "D3.6")) {
    return [approved, invoice(), passed()]
  }

  if (name === testProjectName("Tier_3", "D3.6")) {
    return [approved, invoice(60000), passed()]
  }

  if (name === INVOICE_SENT_BACK_PROJECT) {
    return [
      approved,
      {
        toolId: "D3.5",
        cycle: 1,
        state: "locked",
        day: 64,
        payload: stageD35(1),
      },
      {
        toolId: "D3.4",
        cycle: 1,
        state: "draft",
        day: 62,
        payload: stageD34(94400, true),
        sentBackReason: SENT_BACK_REASON,
      },
    ]
  }

  if (
    name === testProjectName("Tier_1", "D3.4") ||
    name === testProjectName("Tier_3", "D3.4")
  ) {
    return [approved]
  }

  if (name === testProjectName("Tier_1", "D3.5")) {
    return [approved, invoice()]
  }

  if (name === testProjectName("Tier_3", "D3.5")) {
    return [approved, invoice(60000)]
  }

  if (name === TRIGGER_WAITING_PROJECT) {
    return [
      {
        toolId: "D3.3",
        cycle: 1,
        state: "submitted",
        day: 60,
        payload: stageD33(false),
      },
    ]
  }

  return name === TRIGGER_APPROVED_PROJECT
    ? [
        {
          toolId: "D3.3",
          cycle: 1,
          state: "locked",
          day: 60,
          payload: stageD33(true),
        },
      ]
    : []
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
    { toolId: "D2.1", state: "locked", day: 29, payload: stageD21() },
    { toolId: "D2.2", state: "locked", day: 31, payload: stageD22() },
    { toolId: "D2.3", state: "locked", day: 33, payload: stageD23() },
    { toolId: "D2.4", state: "locked", day: 35, payload: stageD24() },
    { toolId: "D2.5", state: "locked", day: 37, payload: stageD25() },
    {
      toolId: "D2.6",
      state: "locked",
      day: 39,
      payload: stageD26("GHS 94,400.00", "GHS 90,000.00"),
    },
    {
      toolId: "D2.7",
      state: "locked",
      day: 41,
      payload: stageD27(
        name,
        name === ACCEPTED_AS_IS_PROJECT ? ACCEPTED_AS_IS : REQUESTED_NEGOTIATION
      ),
    },
    ...negotiated(name, 43, "GHS 90,000.00"),
    { toolId: "D3.1", state: "locked", day: 55, payload: stageD31(94400) },
    ...billingCycle(name),
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
    { toolId: "D2.1", state: "locked", day: 26, payload: stageD21() },
    { toolId: "T3.D2.2a", state: "locked", day: 28, payload: stageT3D22a() },
    { toolId: "D2.3", state: "locked", day: 30, payload: stageD23() },
    { toolId: "D2.4", state: "locked", day: 32, payload: stageD24() },
    { toolId: "D2.5", state: "locked", day: 34, payload: stageD25() },
    {
      toolId: "D2.6",
      state: "locked",
      day: 36,
      payload: stageD26("GHS 60,000.00", "GHS 57,000.00"),
    },
    { toolId: "D2.7", state: "locked", day: 38, payload: stageD27(name) },
    ...negotiated(name, 40, "GHS 57,000.00"),
    { toolId: "D3.1", state: "locked", day: 52, payload: stageD31(60000) },
    ...billingCycle(name),
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

// A test project's records: the sample answers of every tool before its own,
// all locked, so its tool is open and starts from them.
function testRecords(project: SeedProject, toolId: string): SeedRecord[] {
  const route = routeOf(project.serviceTrack)
  const at = route.indexOf(toolId)

  const all =
    project.serviceTrack === "Tier_1"
      ? tier1Records(project.name)
      : tier3Records(project.name)

  return all.filter((record) => route.indexOf(record.toolId) < at)
}

export const projectRecords = new Map<string, SeedRecord[]>([
  ...toolProjects.map(
    ({ project, stage }) => [project.name, toolRecords(project, stage)] as const
  ),
  ...testProjects.map(
    ({ project, toolId }) =>
      [project.name, testRecords(project, toolId)] as const
  ),
  [NEEDS_TEAM, [{ ...unlocked(NEEDS_TEAM)[0]!, state: "locked" }]],
  [`${DEV_LOCKED} (Tier 1)`, tier1Records(`${DEV_LOCKED} (Tier 1)`)],
  [ACCEPTED_AS_IS_PROJECT, tier1Records(ACCEPTED_AS_IS_PROJECT)],
  [PAPER_SIGNED_PROJECT, tier1Records(PAPER_SIGNED_PROJECT)],
  [TRIGGER_WAITING_PROJECT, tier1Records(TRIGGER_WAITING_PROJECT)],
  [TRIGGER_APPROVED_PROJECT, tier1Records(TRIGGER_APPROVED_PROJECT)],
  [INVOICE_DRAFTED_PROJECT, tier1Records(INVOICE_DRAFTED_PROJECT)],
  [INVOICE_APPROVED_PROJECT, tier1Records(INVOICE_APPROVED_PROJECT)],
  [INVOICE_SENT_BACK_PROJECT, tier1Records(INVOICE_SENT_BACK_PROJECT)],
  [INVOICE_SENT_PROJECT, tier1Records(INVOICE_SENT_PROJECT)],
  [BANK_WAITING_PROJECT, tier1Records(BANK_WAITING_PROJECT)],
  [BANK_FEE_PROJECT, tier1Records(BANK_FEE_PROJECT)],
  [HALF_PAID_PROJECT, tier1Records(HALF_PAID_PROJECT)],
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
