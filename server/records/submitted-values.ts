import type { JsonObject } from "@/db/schema"
import { COST_ESTIMATION } from "@/lib/cost-estimation"
import type { Transaction } from "@/server/audit/audit"
import { PROJECT_BRIEF, T3_QUOTE } from "@/lib/project-brief"
import { briefOnSubmit, quoteOnSubmit } from "@/server/brief/project-brief"
import { costOnSubmit } from "@/server/cost/cost-estimation"
import { PAYMENT_TERMS } from "@/lib/payment-terms"
import { paymentTermsOnSubmit } from "@/server/payments/payment-terms"
import { DRAFT_INVOICE } from "@/lib/draft-invoice"
import { draftInvoiceOnSubmit } from "@/server/payments/draft-invoice"
import { BANK_STATEMENT_LOG } from "@/lib/bank-statement-log"
import { bankLogOnSubmit } from "@/server/payments/bank-check-submit"
import { RECONCILED_PAYMENT } from "@/lib/reconciled-payment"
import { reconciledOnSubmit } from "@/server/payments/reconciled-submit"
import { LOCKED_BASELINE } from "@/lib/locked-baseline"
import { lockedBaselineOnSubmit } from "@/server/team/locked-baseline"

import type { FieldError } from "./validate"

// What a tool works out from its own answers when it is submitted, such as
// D1.14's totals, stored with the submitted copy so the workflow can read
// them; and what stops the submit while those sums are wrong.
export async function submittedValues(
  transaction: Pick<Transaction, "select">,
  record: {
    toolId: string
    projectId: string
    cycle: number
    payload: JsonObject
  }
): Promise<{ values: JsonObject; errors: FieldError[] }> {
  switch (record.toolId) {
    case COST_ESTIMATION: {
      return costOnSubmit(transaction, record.projectId, record.payload)
    }

    case PROJECT_BRIEF: {
      return briefOnSubmit(transaction, record.projectId, record.payload)
    }

    case T3_QUOTE: {
      return quoteOnSubmit(record.payload)
    }

    case PAYMENT_TERMS: {
      return paymentTermsOnSubmit(transaction, record.projectId, record.payload)
    }

    case DRAFT_INVOICE: {
      return draftInvoiceOnSubmit(record.payload)
    }

    case BANK_STATEMENT_LOG: {
      return bankLogOnSubmit(
        transaction,
        record.projectId,
        record.cycle,
        record.payload
      )
    }

    case RECONCILED_PAYMENT: {
      return reconciledOnSubmit(transaction, record.projectId, record.cycle)
    }

    case LOCKED_BASELINE: {
      return lockedBaselineOnSubmit(record.payload)
    }

    default: {
      return { values: {}, errors: [] }
    }
  }
}
