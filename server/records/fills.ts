import type { Database } from "@/db"
import type { JsonObject } from "@/db/schema"
import { fieldFills, type Fills } from "@/lib/placeholders"
import { FINANCE_REVIEW } from "@/lib/finance-review"
import { INITIAL_DRAFT } from "@/lib/initial-draft"
import { ARCHIVE } from "@/lib/archive"
import { archiveFills } from "@/server/contract/archive"
import { SIGNATURE_CONTRACT } from "@/lib/signature-contract"
import { STANDARD_CONTRACT } from "@/lib/standard-contract"
import { signatureFills } from "@/server/contract/signature-contract"
import { financeReviewFills } from "@/server/contract/finance-review"
import { draftFills } from "@/server/contract/initial-draft"
import { contractFills } from "@/server/contract/standard-contract"
import { tools } from "@/server/tools/registry"
import { APPROVED_INVOICE } from "@/lib/approved-invoice"
import { approvedInvoiceFills } from "@/server/payments/approved-invoice"
import { TRANSMITTED_INVOICE } from "@/lib/transmitted-invoice"
import { transmittedInvoiceFills } from "@/server/payments/transmitted-invoice"
import { BANK_STATEMENT_LOG } from "@/lib/bank-statement-log"
import { bankLogFills } from "@/server/payments/bank-statement-log"

// What the system fills into the [bracketed] names of a tool's fixed text,
// read live from the project, in the payment milestone `cycle` shown for a
// tool run once per milestone. Empty for a tool with none.
export async function systemFillsOf(
  database: Database,
  projectId: string,
  toolId: string,
  cycle = 1
): Promise<Fills> {
  switch (toolId) {
    case APPROVED_INVOICE: {
      return await approvedInvoiceFills(database, projectId, cycle)
    }

    case TRANSMITTED_INVOICE: {
      return await transmittedInvoiceFills(database, projectId)
    }

    case BANK_STATEMENT_LOG: {
      return await bankLogFills(database, projectId)
    }

    case STANDARD_CONTRACT: {
      return await contractFills(database, projectId)
    }

    case INITIAL_DRAFT: {
      return await draftFills(database, projectId)
    }

    case FINANCE_REVIEW: {
      return await financeReviewFills(database, projectId)
    }

    case SIGNATURE_CONTRACT: {
      return await signatureFills(database, projectId)
    }

    case ARCHIVE: {
      return await archiveFills(database, projectId)
    }

    default: {
      return {}
    }
  }
}

// Every fill of a record as it is now: the system's, and those from the
// record's own fields. The PDF export shows the text filled in with these.
export async function fillsOf(
  database: Database,
  projectId: string,
  toolId: string,
  values: JsonObject,
  cycle = 1
): Promise<Fills> {
  return {
    ...(await systemFillsOf(database, projectId, toolId, cycle)),
    ...fieldFills(tools.getTool(toolId)?.fills, (field) => values[field]),
  }
}
