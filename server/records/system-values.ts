import type { Database } from "@/db"
import type { JsonObject, RecordState } from "@/db/schema"
import { COST_ESTIMATION } from "@/lib/cost-estimation"
import { HANDOFF } from "@/lib/handoff"
import { INITIAL_DRAFT } from "@/lib/initial-draft"
import { PROJECT_BRIEF, T3_QUOTE } from "@/lib/project-brief"
import { briefValues, quoteValues } from "@/server/brief/project-brief"
import { CAPABILITY, capabilityValues } from "@/server/capability/capability"
import { draftValues } from "@/server/contract/initial-draft"
import { costValues } from "@/server/cost/cost-estimation"
import {
  FEASIBILITY,
  feasibilityValues,
} from "@/server/feasibility/feasibility"
import { handoffValues } from "@/server/handoff/handoff"
import {
  NEEDS_ASSESSMENT,
  synthesisValues,
} from "@/server/needs/needs-assessment"
import { INTERNAL_REVIEW, reviewValues } from "@/server/review/internal-review"
import { RISK, riskValues } from "@/server/risk/risk"
import { SCOPE_OF_WORK, scopeValues } from "@/server/scope/scope-of-work"
import { T3_CONTRACT } from "@/lib/t3-contract"
import { PM_REVIEW } from "@/lib/pm-review"
import { shownFromValues } from "@/lib/shown-from"
import { pmReviewValues } from "@/server/contract/pm-review"
import { FINANCE_REVIEW } from "@/lib/finance-review"
import { financeReviewValues } from "@/server/contract/finance-review"
import { EXECUTIVE_REVIEW } from "@/lib/executive-review"
import { executiveReviewValues } from "@/server/contract/executive-review"
import { BASELINE } from "@/lib/baseline"
import { baselineValues } from "@/server/contract/baseline"
import { TRANSMITTAL } from "@/lib/transmittal"
import { transmittalValues } from "@/server/contract/transmittal"
import { NEGOTIATION_INVITE } from "@/lib/negotiation-invite"
import { negotiationInviteValues } from "@/server/contract/negotiation-invite"
import { NEGOTIATION_NOTES } from "@/lib/negotiation-notes"
import { FINAL_CONTRACT } from "@/lib/final-contract"
import { SIGNATURE_CONTRACT } from "@/lib/signature-contract"
import { EXECUTED_CONTRACT } from "@/lib/executed-contract"
import { ARCHIVE } from "@/lib/archive"
import { archiveValues } from "@/server/contract/archive"
import { executedValues } from "@/server/contract/executed-contract"
import { signatureValues } from "@/server/contract/signature-contract"
import { finalContractValues } from "@/server/contract/final-contract"
import { negotiationNotesValues } from "@/server/contract/negotiation-notes"
import { t3ContractValues } from "@/server/contract/t3-contract"
import { tools } from "@/server/tools/registry"

// The record a tool's system values are worked out for. A tool with no record
// yet is "notStarted".
export type ShownRecord = {
  id: string
  state: RecordState | "notStarted"
  payload: JsonObject
} | null

// What the system fills into a tool's fields, read live from the project, its
// request and its other records, as the tool page shows it over the saved
// answers, with what each field shown from another field's answer says.
// Empty for a tool with no such fields. `writer` is the name of the person
// writing D1.8, shown as its author until it is submitted.
export async function systemValuesOf(
  database: Database,
  projectId: string,
  toolId: string,
  record: ShownRecord,
  writer?: string
): Promise<JsonObject> {
  const values = await workedOut(database, projectId, toolId, record, writer)
  const tool = tools.getTool(toolId)

  if (!tool) {
    return values
  }

  return { ...values, ...shownFromValues(tool, record?.payload ?? {}) }
}

async function workedOut(
  database: Database,
  projectId: string,
  toolId: string,
  record: ShownRecord,
  writer?: string
): Promise<JsonObject> {
  const payload = record?.payload ?? {}
  const state = record?.state ?? "notStarted"

  switch (toolId) {
    case NEEDS_ASSESSMENT: {
      return await synthesisValues(
        database,
        projectId,
        record
          ? {
              id: record.id,
              state: record.state === "notStarted" ? "draft" : record.state,
            }
          : null,
        writer
      )
    }

    case INTERNAL_REVIEW: {
      return await reviewValues(database, projectId)
    }

    case CAPABILITY: {
      return await capabilityValues(database, projectId, payload)
    }

    case RISK: {
      return await riskValues(database, projectId, payload)
    }

    case FEASIBILITY: {
      return await feasibilityValues(database, projectId, payload)
    }

    case SCOPE_OF_WORK: {
      return await scopeValues(database, projectId, { state, payload })
    }

    case COST_ESTIMATION: {
      return await costValues(database, projectId, { state, payload })
    }

    case PROJECT_BRIEF: {
      return await briefValues(database, projectId)
    }

    case T3_QUOTE: {
      return await quoteValues(database, projectId)
    }

    case HANDOFF: {
      return await handoffValues(database, projectId)
    }

    case INITIAL_DRAFT: {
      return await draftValues(database, projectId)
    }

    case T3_CONTRACT: {
      return await t3ContractValues(database, projectId, payload)
    }

    case PM_REVIEW: {
      return await pmReviewValues(database, projectId)
    }

    case FINANCE_REVIEW: {
      return await financeReviewValues(database, projectId)
    }

    case EXECUTIVE_REVIEW: {
      return await executiveReviewValues(database, projectId)
    }

    case BASELINE: {
      return await baselineValues(database, projectId)
    }

    case TRANSMITTAL: {
      return await transmittalValues(database, projectId, payload)
    }

    case NEGOTIATION_INVITE: {
      return await negotiationInviteValues(database, projectId, payload)
    }

    case NEGOTIATION_NOTES: {
      return await negotiationNotesValues(database, projectId, payload)
    }

    case FINAL_CONTRACT: {
      return await finalContractValues(database, projectId, payload)
    }

    case SIGNATURE_CONTRACT: {
      return await signatureValues(database, projectId, payload)
    }

    case EXECUTED_CONTRACT: {
      return await executedValues(database, projectId, payload)
    }

    case ARCHIVE: {
      return await archiveValues(database, projectId, payload)
    }

    default: {
      return {}
    }
  }
}
